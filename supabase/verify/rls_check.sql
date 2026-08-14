-- rls_check.sql — is campaign access actually enforced?
--
-- Paste the whole file into the Supabase SQL Editor and run it. Nothing to
-- fill in: it finds a campaign and a real member on its own.
--
-- THE RESULT ARRIVES AS A RED "ERROR". That is the delivery mechanism, not a
-- failure. Read the text: every line ends PASS, or it does not.
--
-- SAFE TO RUN AGAINST PRODUCTION. Some checks must attempt a write to be worth
-- anything — a policy that refuses reads while permitting writes is exactly the
-- kind of half-fix this exists to catch. Every one of them runs inside the
-- transaction opened below, and the closing RAISE aborts it, so nothing is ever
-- committed. The member-side merge_section call does bump resources_updated_at
-- mid-transaction; that is rolled back with everything else.
--
-- WHY THIS EXISTS
--
-- 0008 was applied to production and accomplished nothing. It dropped three
-- policy names taken from schema.sql; the table had been provisioned by hand as
-- campaigns_select / campaigns_insert / campaigns_update, `to public`,
-- `using (true)`. The drops matched nothing, the permissive policies survived,
-- and RLS policies are OR'd — so the correctly-created membership policies were
-- irrelevant. Every structural check a reasonable person would run came back
-- clean: RLS was on, the three expected policies existed, the three expected
-- functions existed. The table was readable and writable by anyone, with no
-- session at all.
--
-- So this checks BEHAVIOUR, not structure. It impersonates a non-member and
-- asserts it gets nothing, through every path a client can reach: SELECT, the
-- merge_section RPC that all real writes go through, and a direct INSERT into
-- campaign_members (which, if it succeeded, would let anyone grant themselves
-- access to any campaign). Structural facts are reported only as context for a
-- failure — they are never what the verdict rests on.
--
-- It also self-tests the impersonation before trusting any of it. Without that,
-- "the stranger saw 0 rows" is equally consistent with a harness that never
-- switched roles, and the whole check passes vacuously.

begin;

do $check$
declare
  stranger  uuid := '00000000-0000-4000-8000-0000deadbeef';
  member    uuid;
  cid       text;
  has_mem   boolean := to_regclass('public.campaign_members') is not null;
  has_merge boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'merge_section');

  rls_on    boolean;
  bypass    boolean;
  n_pol     int;
  bad_names text;
  mem_pol   text;
  mem_rls   boolean;

  n_str int; n_anon int; n_mem int; n_rows int;
  nm_state text; nm_msg text; m_out text;
  grab text;

  report   text := '';
  failures int  := 0;
begin
  -- ── structural facts, gathered while still privileged ──────────────────────
  select relrowsecurity into rls_on
    from pg_class where oid = 'public.campaigns'::regclass;
  select rolbypassrls into bypass
    from pg_roles where rolname = 'authenticated';
  select count(*) into n_pol
    from pg_policies where schemaname='public' and tablename='campaigns';
  select string_agg(policyname, ', ' order by policyname) into bad_names
    from pg_policies
    where schemaname='public' and tablename='campaigns'
      and (coalesce(qual,'') = 'true' or coalesce(with_check,'') = 'true'
           or 'public' = any(roles::text[]));

  if has_mem then
    select relrowsecurity into mem_rls
      from pg_class where oid = 'public.campaign_members'::regclass;
    select string_agg(policyname||' ['||cmd||']', '; ' order by policyname)
      into mem_pol
      from pg_policies where schemaname='public' and tablename='campaign_members';

    -- A campaign that someone has actually joined, so the positive direction is
    -- meaningful. Read-only: we borrow an existing membership rather than
    -- granting ourselves one.
    select cm.campaign_id, cm.user_id into cid, member
      from public.campaign_members cm
      join public.campaigns c on c.id = cm.campaign_id
      order by cm.joined_at limit 1;
  end if;

  if cid is null then
    select id into cid from public.campaigns order by id limit 1;
  end if;

  if cid is null then
    raise exception 'NOTHING TO CHECK — public.campaigns is empty, so "a non-member sees nothing" would be true for the wrong reason.';
  end if;

  -- ── harness self-test ──────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  execute 'set local role authenticated';

  if current_user <> 'authenticated' then
    raise exception 'HARNESS BROKEN — SET LOCAL ROLE did not take (current_user=%). RLS is still bypassed and every result below would be meaningless.', current_user;
  end if;
  if auth.uid() is distinct from stranger then
    raise exception 'HARNESS BROKEN — auth.uid() is %, not the forged claim. The policies are being asked about nobody, so "sees 0 rows" would prove nothing.', coalesce(auth.uid()::text, 'NULL');
  end if;
  -- Nested, not `has_mem and public.is_member(...)`: plpgsql compiles a boolean
  -- expression as one SQL query, so it does not short-circuit and the function
  -- would have to exist even on a database that has never run 0008.
  if has_mem then
    if public.is_member(cid) then
      raise exception 'HARNESS BROKEN — the synthetic stranger is somehow a member of %.', cid;
    end if;
  end if;

  -- ── 1. reads ───────────────────────────────────────────────────────────────
  select count(*) into n_str from public.campaigns;

  -- ── 2. merge_section as a non-member (the path every client write takes) ───
  -- '{}' cannot alter a value, and null::bigint disables the generation gate on
  -- purpose, so a refusal here can only be RLS — never the gate.
  if has_merge then
    begin
      perform public.merge_section(cid, 'resources', '{}'::jsonb, null::bigint);
      nm_state := 'NO ERROR'; nm_msg := 'the write was accepted';
    exception when others then
      nm_state := sqlstate; nm_msg := sqlerrm;
    end;
  end if;

  -- ── 3. can a signed-in stranger grant themselves membership? ──────────────
  if has_mem then
    begin
      insert into public.campaign_members (campaign_id, user_id) values (cid, stranger);
      grab := 'SUCCEEDED';
    exception when others then
      grab := sqlstate || ' ' || sqlerrm;
    end;
  end if;

  -- ── 4. the member, same transaction — proves refusals are about membership ─
  if member is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', member, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', member::text, true);
    select count(*) into n_mem from public.campaigns;
    if has_merge then
      begin
        perform public.merge_section(cid, 'resources', '{}'::jsonb, null::bigint);
        m_out := 'accepted';
      exception when others then
        m_out := sqlstate || ' ' || sqlerrm;
      end;
    end if;
  end if;

  -- ── 5. no session at all ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n_anon from public.campaigns;
  update public.campaigns set stash = stash where id = cid;
  get diagnostics n_rows = row_count;
  execute 'reset role';

  -- ── verdict ────────────────────────────────────────────────────────────────
  report := report || format(E'\n  1. non-member SELECT sees %s (want 0)          %s',
    n_str, case when n_str = 0 then 'PASS'
                else '#### FAIL — anyone signed in can list every campaign ####' end);
  if n_str <> 0 then failures := failures + 1; end if;

  if not has_merge then
    report := report || E'\n  2. non-member merge_section                    #### FAIL — merge_section does not exist. Apply migrations 0002-0007. ####';
    failures := failures + 1;
  elsif nm_state = '42501' then
    report := report || E'\n  2. non-member merge_section refused (42501)    PASS';
  elsif nm_state = '42883' then
    report := report || E'\n  2. non-member merge_section                    #### FAIL — 42883: this is the 3-argument pre-0007 function. EVERY client write is already failing. Apply 0007. ####';
    failures := failures + 1;
  elsif nm_state = 'NO ERROR' then
    report := report || E'\n  2. non-member merge_section                    #### FAIL — a non-member write was ACCEPTED. Reads may be scoped while writes are not. ####';
    failures := failures + 1;
  else
    report := report || format(E'\n  2. non-member merge_section                    #### FAIL — refused with %s (%s); only 42501 proves RLS did it ####', nm_state, nm_msg);
    failures := failures + 1;
  end if;

  if not has_mem then
    report := report || E'\n  3. stranger self-grant                         #### FAIL — campaign_members does not exist; 0008 has not been applied. ####';
    failures := failures + 1;
  elsif grab like '42501%' then
    report := report || format(E'\n  3. stranger self-grant refused (42501)         PASS%s',
      case when grab like '%row-level security%' then '' else '  (by table grant, not RLS — safe, but enable RLS on campaign_members too)' end);
  elsif grab = 'SUCCEEDED' then
    report := report || E'\n  3. stranger self-grant                         #### FAIL — anyone signed in can join any campaign. The model is defeated. Fix: alter table public.campaign_members enable row level security; ####';
    failures := failures + 1;
  else
    report := report || format(E'\n  3. stranger self-grant                         #### FAIL — refused with %s; expected 42501 ####', grab);
    failures := failures + 1;
  end if;

  report := report || format(E'\n  4. no session SELECT sees %s (want 0)          %s',
    n_anon, case when n_anon = 0 then 'PASS'
                 else '#### FAIL — the table is readable without signing in ####' end);
  if n_anon <> 0 then failures := failures + 1; end if;

  report := report || format(E'\n  5. no session UPDATE touched %s rows (want 0)  %s',
    n_rows, case when n_rows = 0 then 'PASS'
                 else '#### FAIL — the table is WRITABLE without signing in ####' end);
  if n_rows <> 0 then failures := failures + 1; end if;

  -- The positive direction. Without it, every PASS above is equally consistent
  -- with "nobody can reach anything", which is not a working app.
  if member is null then
    report := report || E'\n  6. a real member still has access              SKIPPED — no membership rows exist, so this is untested. Every check above is equally consistent with total lockout. Boot the app on a device to create one, then re-run.';
  else
    report := report || format(E'\n  6. member SELECT sees %s (want >= 1)           %s',
      n_mem, case when n_mem >= 1 then 'PASS'
                  else '#### FAIL — a real member is locked out of their own campaign ####' end);
    if n_mem < 1 then failures := failures + 1; end if;
    if has_merge then
      report := report || format(E'\n  7. member merge_section %s%s',
        rpad(m_out, 22),
        case when m_out = 'accepted' then 'PASS'
             else '#### FAIL — the member write failed too, so the refusals above were not about membership ####' end);
      if m_out <> 'accepted' then failures := failures + 1; end if;
    end if;
  end if;

  report := report || E'\n\n  --- structural context (explains a failure; never the verdict) ---';
  report := report || format(E'\n  RLS enabled on campaigns:  %s%s', rls_on,
    case when rls_on then '' else '   <- policies are inert without this' end);
  report := report || format(E'\n  authenticated BYPASSRLS:   %s%s', bypass,
    case when bypass then '   <- the role skips RLS entirely' else '' end);
  report := report || format(E'\n  policies on campaigns:     %s (want 3)', n_pol);
  if bad_names is not null then
    report := report || format(E'\n  PERMISSIVE POLICIES:       %s   <- these OR with the others and grant everything', bad_names);
  end if;
  if has_mem then
    report := report || format(E'\n  campaign_members RLS:      %s', mem_rls);
    report := report || format(E'\n  campaign_members policies: %s', coalesce(mem_pol, '(none)'));
    report := report || E'\n    ^ want exactly "members see own rows [SELECT]". Any INSERT/UPDATE/DELETE policy here is a self-grant vector.';
  end if;
  report := report || format(E'\n  campaign checked:          %s', cid);

  raise exception E'\n===== campaigns RLS =====\n%\n\n%\n',
    report,
    case when failures = 0
         then 'ALL PASS — access is scoped to membership. Nothing was committed.'
         else format('%s CHECK(S) FAILED. First fix to try: re-run supabase/migrations/0008_campaign_membership.sql in full — it drops every policy on the table, whatever it is named, and recreates the three membership ones inside one transaction. Nothing was committed.', failures) end;
end
$check$;

rollback;   -- normally unreachable; the RAISE already aborted
