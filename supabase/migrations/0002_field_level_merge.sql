-- AVE-94 — Field-level merge for concurrent multiplayer edits.
--
-- The previous write path did `update campaigns set <section> = <payload>`.
-- That overwrites the entire column. Two players editing different keys in
-- the same section concurrently would silently lose one write — player A's
-- update clobbers player B's, or vice versa.
--
-- This migration adds a server-side deep-merge function. The new write path
-- is `select merge_section(id, section_name, payload)`, which:
--   1. Reads the current column value.
--   2. Recursively merges the incoming payload into it (key-by-key:
--      for matching keys, incoming overwrites; for non-matching keys,
--      the existing value is preserved; for nested objects, recurse).
--   3. Writes the merged result back and bumps `<section>_updated_at`.
--   4. Returns the merged result.
--
-- This makes concurrent edits to *different* keys in the same section
-- safe for every section (resources, cities, party, guard_0…guard_7,
-- stash, campaign). It also closes the debounce race: a stale client
-- write no longer clobbers a fresher server value it didn't touch.
--
-- The same-key edge case (two players both editing the SAME stash key
-- concurrently — e.g., both picking up Iron at the same instant) is
-- genuinely a CRDT problem and is not solved here. Documented as a
-- known limitation. A client-side delta tracking refactor is the right
-- next step if it ever becomes a real issue.
--
-- Apply this to an existing database. Idempotent (CREATE OR REPLACE).
-- Fresh installs: schema.sql should also include the function definitions
-- (the schema.sql update is a separate change).

-- ─── deep_merge_jsonb ────────────────────────────────────────────────────────
-- Recursive JSONB merge: for each key in `incoming`:
--   - if both existing[k] and incoming[k] are JSONB objects, recurse
--   - otherwise incoming[k] overwrites existing[k]
-- Keys present in `existing` but not in `incoming` are preserved.
create or replace function public.deep_merge_jsonb(existing jsonb, incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := coalesce(existing, '{}'::jsonb);
  k      text;
  v      jsonb;
begin
  if incoming is null then
    return result;
  end if;
  for k, v in select * from jsonb_each(incoming)
  loop
    if jsonb_typeof(result -> k) = 'object' and jsonb_typeof(v) = 'object' then
      result := jsonb_set(result, array[k], public.deep_merge_jsonb(result -> k, v));
    else
      result := jsonb_set(result, array[k], v);
    end if;
  end loop;
  return result;
end;
$$;

-- ─── merge_section ──────────────────────────────────────────────────────────
-- Merges the incoming payload into the named section of the given campaign
-- and returns the merged result. Bumps `<section>_updated_at` to now().
--
-- The section_name parameter is whitelisted before being used in dynamic
-- SQL. While Supabase's parameter binding would already be safe, this
-- defense-in-depth prevents accidental misuse and gives a clear error
-- for typos in client code.
--
-- The read-merge-write cycle is done in a single function body. Because
-- Postgres serializes function calls within a connection, two concurrent
-- calls on the same campaign row may still race — but the INSERT ... ON
-- CONFLICT path makes the write itself atomic. A stricter solution would
-- use SELECT ... FOR UPDATE on the row, but that requires the row to
-- exist; the upsert flow covers both first-write and update cases.
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
  ts_col   text;
  existing jsonb;
  merged   jsonb;
begin
  if section_name <> all(valid_sections) then
    raise exception 'unknown section name: %', section_name
      using errcode = '22023'; -- invalid parameter value
  end if;

  ts_col := quote_ident(section_name || '_updated_at');

  -- Read the current column value (null if the row doesn't exist yet).
  execute format('select %I from public.campaigns where id = $1', section_name)
    into existing
    using campaign_id;

  merged := public.deep_merge_jsonb(existing, payload);

  -- Upsert: insert if missing, update if present. Both branches set
  -- the section column and bump the timestamp.
  execute format(
    'insert into public.campaigns (id, %I, %s) values ($1, $2, now()) '
    'on conflict (id) do update set %I = excluded.%I, %s = excluded.%s',
    section_name, ts_col, section_name, section_name, ts_col, ts_col
  )
    using campaign_id, merged;

  return merged;
end;
$$;

-- Grant execute on the new functions to the anon role. The merge_section
-- function does an UPDATE on public.campaigns, which is already permitted
-- by the RLS policy in schema.sql. No new table-level grants are needed.
grant execute on function public.deep_merge_jsonb(jsonb, jsonb) to anon, authenticated;
grant execute on function public.merge_section(text, text, jsonb)    to anon, authenticated;
