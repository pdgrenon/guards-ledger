-- rls_check.sql — is campaign access actually enforced?
--
-- Paste the whole file into the Supabase SQL Editor and run it. READ-ONLY: it
-- writes nothing, and the closing rollback is belt-and-braces — the RAISE has
-- already aborted the transaction by then.
--
-- THE RESULT ARRIVES AS A RED "ERROR". That is the delivery mechanism, not a
-- failure. Read the text: every line ends PASS, or it does not.
--
-- WHY THIS EXISTS
--
-- 0008 was applied to production and accomplished nothing. It dropped three
-- policy names taken from schema.sql; the table had been provisioned by hand as
-- campaigns_select / campaigns_insert / campaigns_update, `to public`,
-- `using (true)`. The drops matched nothing, the permissive policies survived,
-- and RLS policies are OR'd — so the correctly-created membership policies were
-- irrelevant. Every structural check a reasonable person would run came back
-- clean: RLS was on, the three expected policies existed, the three functions
-- existed. The table was readable and writable by anyone, with no session.
--
-- So this checks BEHAVIOUR, not structure: it impersonates a non-member and
-- asserts it sees nothing. The structural lines are reported too, because they
-- explain a failure — but they are never what the verdict rests on.
--
-- It also self-tests the impersonation before trusting any of it. Without that,
-- "the stranger saw 0 rows" is equally consistent with a harness that never
-- switched roles, and the whole check passes vacuously.

begin;

do $check$
declare
  stranger  uuid := '00000000-0000-4000-8000-0000deadbeef';
  member    uuid;
  member_of text;
  rls_on    boolean;
  bypass    boolean;
  n_pol     int;
  n_bad     int;
  bad_names text;
  n_str     int;
  n_anon    int;
  n_mem     int;
  report    text := '';
  failures  int  := 0;

  procedure_note constant text :=
    E'\n(structural context — a failure above is usually explained by one of these)';
begin
  -- ── structural facts, gathered while still privileged ──────────────────────
  select relrowsecurity into rls_on
    from pg_class where oid = 'public.campaigns'::regclass;
  select rolbypassrls into bypass
    from pg_roles where rolname = 'authenticated';
  select count(*) into n_pol
    from pg_policies where schemaname='public' and tablename='campaigns';
  select count(*), string_agg(policyname, ', ' order by policyname)
    into n_bad, bad_names
    from pg_policies
    where schemaname='public' and tablename='campaigns'
      and (coalesce(qual,'') = 'true' or coalesce(with_check,'') = 'true'
           or 'public' = any(roles::text[]));

  -- A real member to test the positive direction with. Read-only: we use one
  -- that already exists rather than granting ourselves membership.
  select user_id, campaign_id into member, member_of
    from public.campaign_members order by joined_at limit 1;

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

  -- ── behaviour ──────────────────────────────────────────────────────────────
  select count(*) into n_str from public.campaigns;

  if member is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', member, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', member::text, true);
    select count(*) into n_mem from public.campaigns;
  end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select count(*) into n_anon from public.campaigns;
  execute 'reset role';

  -- ── verdict ────────────────────────────────────────────────────────────────
  report := report || format(E'\nnon-member sees %s campaigns (want 0)  %s',
    n_str, case when n_str = 0 then 'PASS'
                else '#### FAIL — anyone signed in can list every campaign ####' end);
  if n_str <> 0 then failures := failures + 1; end if;

  report := report || format(E'\nno session at all sees %s (want 0)     %s',
    n_anon, case when n_anon = 0 then 'PASS'
                 else '#### FAIL — the table is reachable without signing in ####' end);
  if n_anon <> 0 then failures := failures + 1; end if;

  if member is null then
    report := report || E'\nmember sees their own campaign         SKIPPED — campaign_members is empty, so the positive direction is untested. A device that has booted the current client creates a row; if none exists, no client has established membership.';
  else
    report := report || format(E'\nmember sees %s (want >= 1)             %s',
      n_mem, case when n_mem >= 1 then 'PASS'
                  else '#### FAIL — a real member is locked out of their own campaign ####' end);
    if n_mem < 1 then failures := failures + 1; end if;
  end if;

  report := report || procedure_note;
  report := report || format(E'\n  RLS enabled on campaigns: %s%s', rls_on,
    case when rls_on then '' else '   <- policies are inert without this' end);
  report := report || format(E'\n  authenticated BYPASSRLS:  %s%s', bypass,
    case when bypass then '   <- the role skips RLS entirely' else '' end);
  report := report || format(E'\n  policies on campaigns:    %s (want 3)', n_pol);
  if n_bad > 0 then
    report := report || format(E'\n  PERMISSIVE POLICIES:      %s   <- these OR with the others and grant everything', bad_names);
  end if;

  -- RAISE's placeholder is a bare `%`, not `%s` — `%s` substitutes and then
  -- emits a literal "s". (format() above is the opposite; it wants `%s`.)
  raise exception E'\n===== campaigns RLS =====%\n\n%\n',
    report,
    case when failures = 0
         then 'ALL PASS — access is scoped to membership.'
         else format('%s CHECK(S) FAILED. Fix: re-run supabase/migrations/0008_campaign_membership.sql in full (it drops every policy on the table, whatever it is named, and recreates the three membership ones inside one transaction).', failures) end;
end
$check$;

rollback;   -- normally unreachable; the RAISE already aborted
