-- 0008_campaign_membership.sql — AVE-971
--
-- Scope campaign access to membership instead of granting the whole table to
-- anyone holding the anon key.
--
-- WHY THE PREVIOUS MODEL DID NOT HOLD
--
-- The policies this replaces were `using (true)`. An RLS `using` clause is
-- evaluated per row and cannot see the query's WHERE, so an unfiltered request
-- returned the entire table:
--
--   GET /rest/v1/campaigns?select=id      →  every campaign id, in one request
--   PATCH /rest/v1/campaigns?id=eq.<id>   →  overwrite any campaign
--
-- AVE-104 widened the code space from ~900 combinations to ~2.2 billion and
-- documented that as the mitigation. That raised the cost of *guessing* an id
-- and left the cost of *listing* every id at exactly one request. Enumeration
-- here is a list operation, not a brute-force search, so the size of the
-- keyspace was never the relevant number.
--
-- WHAT REPLACES IT
--
-- The campaign code becomes an enforced capability rather than an advisory one:
-- you may touch the row you can name, and nothing else. Player-visible
-- behaviour is unchanged — same code, same join box, no login, no account.
--
-- WHY ANONYMOUS AUTH RATHER THAN SOMETHING CHEAPER
--
-- Two simpler designs fail on the same constraint, and both fail *silently* —
-- sync just stops while everything looks fine in local testing:
--
--   * Matching a request header (X-Campaign-Id) in the policy: Realtime has no
--     request.headers, so the policy evaluates false on the websocket and
--     postgres_changes delivers nothing.
--   * Revoking select and reading through a security-definer RPC:
--     postgres_changes authorizes delivery via RLS `select` on the subscribing
--     user. No select policy, no events.
--
-- postgres_changes checks RLS against the SOCKET'S JWT, so the fix has to put
-- an identity in a JWT. Anonymous auth is not a login here; it exists solely to
-- give RLS something to test.
--
-- ROLE NOTE, EASY TO GET WRONG: a Supabase anonymous user is issued the
-- `authenticated` role with an `is_anonymous: true` claim — NOT `anon`. Policies
-- scoped `to authenticated` therefore cover all real traffic, and the `anon`
-- role loses table access entirely, which is the intended outcome. A keyless or
-- session-less request gets nothing.
--
-- ROLLOUT ORDER IS LOAD-BEARING:
--   (a) enable Anonymous sign-ins in Authentication → Providers
--   (b) deploy the client
--   (c) apply this migration
--
-- Applying this first would cut off every already-running client at once,
-- mid-session. The client is safe to run against an unmigrated database
-- because it treats PostgREST's PGRST202 ("could not find the function") as
-- "this database has no membership model" and falls through to the pre-0008
-- behaviour — so the deploy window, and forgetting this migration entirely,
-- both leave the app working exactly as it did before.
--
-- Idempotent: safe to re-run.

-- ─── Membership ──────────────────────────────────────────────────────────────

create table if not exists public.campaign_members (
  campaign_id text not null,
  user_id     uuid not null default auth.uid(),
  joined_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

alter table public.campaign_members enable row level security;

drop policy if exists "members see own rows" on public.campaign_members;
create policy "members see own rows" on public.campaign_members
  for select to authenticated using (user_id = auth.uid());

-- No insert/update/delete policy: membership is granted only through the
-- security-definer functions below, never written directly by a client.

-- security definer, because the campaigns policies call this — subjecting it to
-- campaign_members' own RLS would recurse. search_path is pinned so the body
-- cannot be redirected by a caller-controlled search_path.
create or replace function public.is_member(cid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid()
  );
$$;

-- The only way to reach a campaign you are not already in. It takes the code as
-- an argument, so it grants access without ever permitting a listing.
--
-- It deliberately does NOT check that the campaign exists: checking would make
-- this an oracle for "is this code real", which is the one thing the keyspace
-- is protecting. A membership row pointing at a nonexistent campaign grants
-- access to nothing. The cost is occasional litter.
create or replace function public.join_campaign(campaign_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.campaign_members (campaign_id, user_id)
  values (join_campaign.campaign_id, auth.uid())
  on conflict do nothing;
end;
$$;

-- Row + membership in ONE transaction. The naive order (join, then insert)
-- leaves a stray membership row behind when the insert hits a 23505 id
-- collision — silently granting the creating device access to a stranger's
-- campaign. Astronomically rare at 2.2B, but it is a permission grant, so it
-- should be structurally impossible rather than merely improbable. One function
-- body is one transaction: a collision rolls both back.
--
-- jsonb_populate_record over a NULL base yields NULL for any column the payload
-- omits, and `generation` and `created_at` are both NOT NULL — so their defaults
-- are merged in underneath the payload rather than left to the column defaults,
-- which populate_record does not consult.
create or replace function public.create_campaign(campaign_id text, row_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.campaigns
  select * from jsonb_populate_record(
    null::public.campaigns,
    jsonb_build_object('id', create_campaign.campaign_id,
                       'generation', 0,
                       'created_at', now())
      || row_data
  );

  insert into public.campaign_members (campaign_id, user_id)
  values (create_campaign.campaign_id, auth.uid());
end;
$$;

-- ─── Campaign policies ───────────────────────────────────────────────────────

-- The whole policy swap runs as ONE transaction. Between the drop loop and the
-- three creates, public.campaigns has RLS on and zero policies — which denies
-- everything to everyone. Uncommitted that state is invisible to other
-- sessions; run these statements loose and it is a real, if brief, outage.
begin;

-- Enabled here rather than left to schema.sql, which is FRESH INSTALLS ONLY:
-- a database upgraded step-by-step never runs it. No-op when already on.
--
-- Check enforcement, not the policy list — the two are independent. A policy on
-- a table without RLS is stored, listed by pg_policies, and filters nothing:
--   select relrowsecurity from pg_class where oid = 'public.campaigns'::regclass;
alter table public.campaigns enable row level security;

-- Drop EVERY policy on the table, whatever it is called, rather than naming the
-- ones we expect to find.
--
-- This is the AVE-971 verification's actual finding, and the reason that
-- migration silently accomplished nothing on production. The earlier version
-- dropped three literal names taken from schema.sql ("anon can read campaigns"
-- and friends). The production table had been provisioned by hand under
-- different names — campaigns_select / campaigns_insert / campaigns_update,
-- `to public`, `using (true)` — so all three drops matched nothing, all three
-- survived, and RLS policies are OR'd: a single permissive policy grants
-- everything no matter what sits beside it. The membership policies were
-- created, were correct, and were irrelevant.
--
-- Note how far it failed open. `to public` covers `anon`, so the table was
-- readable and writable with no session at all — wider than the `authenticated`
-- exposure AVE-971 set out to close, and completely invisible to a check that
-- confirms the three expected policies exist. They did exist.
--
-- Enumerating is the only formulation that converges: the three policies below
-- are the complete intended set for this table, so anything else present is by
-- definition drift, and a migration that cannot be defeated by a name it did
-- not anticipate is worth more than one that preserves a hypothetical
-- hand-added policy. If a legitimate fourth policy is ever wanted, add it here.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'campaigns'
  loop
    execute format('drop policy %I on public.campaigns', pol.policyname);
  end loop;
end
$$;

create policy "members read campaigns"   on public.campaigns for select
  to authenticated using (public.is_member(id));
create policy "members insert campaigns" on public.campaigns for insert
  to authenticated with check (public.is_member(id));
create policy "members update campaigns" on public.campaigns for update
  to authenticated using (public.is_member(id)) with check (public.is_member(id));

commit;

-- ─── Grants ──────────────────────────────────────────────────────────────────

grant execute on function public.is_member(text)              to authenticated;
grant execute on function public.join_campaign(text)          to authenticated;
grant execute on function public.create_campaign(text, jsonb) to authenticated;

-- merge_section keeps its existing grants. It is `security invoker`, so it runs
-- under the caller's RLS: an anon caller now matches no policy and its write
-- affects zero rows. Tightening the grant as well would add a moving part
-- without changing the outcome.
