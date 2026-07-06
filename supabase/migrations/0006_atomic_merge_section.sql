-- AVE-373 — merge_section's read-merge-write is not atomic.
--
-- The previous merge_section did:
--   1. SELECT <section> INTO existing            (separate statement)
--   2. merged := deep_merge_jsonb(existing, payload)
--   3. INSERT ... ON CONFLICT DO UPDATE SET <section> = merged
--
-- Two players writing the SAME section concurrently (e.g. both editing the
-- campaign section — plans, event tokens, bounty toggles all share it) could
-- both execute step 1 before either reached step 3, each merge against the
-- same stale `existing`, and the second write's INSERT overwrite the first
-- player's already-merged result — losing an edit even though the two writes
-- touched disjoint keys. This re-opened exactly the lost-update window the
-- field-level merge (AVE-94) was built to close.
--
-- Fix: fold the read into the same statement as the write. `INSERT ...
-- ON CONFLICT DO UPDATE SET col = deep_merge_jsonb(c.col, excluded.col)`
-- computes the merge against the row version the UPDATE itself locks —
-- `c.col` (the target table, aliased `c`) refers to the existing stored
-- value at the moment of the write, not an earlier, separately-fetched read.
-- Postgres serializes concurrent INSERT ON CONFLICT DO UPDATE against the
-- same row (the second waits for the first's row lock, then computes its
-- merge against the first's already-committed result), so two concurrent
-- calls with disjoint keys both survive. RETURNING replaces the old
-- SELECT-then-compute return value.
--
-- Apply to an existing database. Idempotent (CREATE OR REPLACE).
-- Fresh installs get the same definition from schema.sql.

create or replace function public.merge_section(
  campaign_id  text,
  section_name text,
  payload      jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  valid_sections text[] := array[
    'resources', 'cities', 'party',
    'guard_0', 'guard_1', 'guard_2', 'guard_3',
    'guard_4', 'guard_5', 'guard_6', 'guard_7',
    'stash', 'campaign'
  ];
  ts_col text;
  merged jsonb;
begin
  if section_name <> all(valid_sections) then
    raise exception 'unknown section name: %', section_name
      using errcode = '22023';
  end if;

  ts_col := quote_ident(section_name || '_updated_at');

  execute format(
    'insert into public.campaigns as c (id, %I, %s) values ($1, $2, now()) '
    'on conflict (id) do update set '
    '  %I = public.deep_merge_jsonb(c.%I, excluded.%I), '
    '  %s = excluded.%s '
    'returning c.%I',
    section_name, ts_col,
    section_name, section_name, section_name,
    ts_col, ts_col,
    section_name
  )
    into merged
    using campaign_id, payload;

  return merged;
end;
$$;

grant execute on function public.merge_section(text, text, jsonb) to anon, authenticated;
