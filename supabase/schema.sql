-- Guards Ledger — Supabase schema
--
-- One row per campaign. Each synced section is a JSONB column with a sibling
-- `<section>_updated_at` timestamp. Guards are split into eight per-guard
-- columns (guard_0 … guard_7) so two players editing different guards at the
-- same time never collide — each write touches only that guard's column.
--
-- Sections (see src/hooks/useSupabaseSync.js):
--   resources       { sil, lux }
--   cities          { cities }
--   party           { activeParty }            -- the shared 2-element party
--   guard_0…guard_7 a single guard object each  -- state.guards[i]
--   stash           { stash, stonebound }
--   campaign        { campaign }
--
-- log, settings and activeGuardIdx are local-only and never stored here.
--
-- After running this, enable Realtime for the `campaigns` table in
-- Database → Replication (or via the statement at the bottom of this file).

create table if not exists public.campaigns (
  id          text primary key,

  resources   jsonb,
  cities      jsonb,
  party       jsonb,
  guard_0     jsonb,
  guard_1     jsonb,
  guard_2     jsonb,
  guard_3     jsonb,
  guard_4     jsonb,
  guard_5     jsonb,
  guard_6     jsonb,
  guard_7     jsonb,
  stash       jsonb,
  campaign    jsonb,

  -- Monotonic full-replacement counter (AVE-527). Bumped only by replaceRow
  -- (reset/import); merge_section gates on it via expected_generation so a
  -- stale in-flight write can't resurrect the pre-reset row.
  generation  bigint not null default 0,

  resources_updated_at timestamptz,
  cities_updated_at    timestamptz,
  party_updated_at     timestamptz,
  guard_0_updated_at   timestamptz,
  guard_1_updated_at   timestamptz,
  guard_2_updated_at   timestamptz,
  guard_3_updated_at   timestamptz,
  guard_4_updated_at   timestamptz,
  guard_5_updated_at   timestamptz,
  guard_6_updated_at   timestamptz,
  guard_7_updated_at   timestamptz,
  stash_updated_at     timestamptz,
  campaign_updated_at  timestamptz,

  created_at  timestamptz not null default now()
);

-- Row Level Security: campaigns are shared by anyone holding the short code,
-- so the anon role is allowed to read and write rows. The code itself is the
-- only access control, matching how the app is used.
--
-- THREAT MODEL:
--   The anon key is shipped in the client bundle and visible to end users.
--   With that key, anyone who knows (or guesses) a campaign code can read or
--   overwrite every row in this table. The following mitigations are in place:
--     1. Campaign codes now use ~2.2 billion combinations (word + 6 random
--        alphanumeric chars) instead of the previous 900 combinations, making
--        brute-force enumeration impractical.
--     2. Rate-limiting or an Edge Function for create/join could further
--        restrict enumeration at the cost of mobile-offline complexity; this
--        is a known tradeoff accepted for the current tableside-use profile.
--   In a future iteration, consider moving create/join behind a Supabase Edge
--   Function that validates a session or adds a proof-of-work step.
alter table public.campaigns enable row level security;

drop policy if exists "anon can read campaigns"   on public.campaigns;
drop policy if exists "anon can insert campaigns" on public.campaigns;
drop policy if exists "anon can update campaigns" on public.campaigns;

create policy "anon can read campaigns"   on public.campaigns for select using (true);
create policy "anon can insert campaigns" on public.campaigns for insert with check (true);
create policy "anon can update campaigns" on public.campaigns for update using (true) with check (true);

-- Enable Realtime so postgres_changes UPDATE events are broadcast.
alter publication supabase_realtime add table public.campaigns;

-- ─── Field-level merge RPC (AVE-94, AVE-197, AVE-362, AVE-373, AVE-527) ─────
-- See supabase/migrations/0002_field_level_merge.sql (object merge),
-- supabase/migrations/0003_array_merge.sql (array merge),
-- supabase/migrations/0005_plain_array_lww.sql (non-id arrays last-write-wins),
-- supabase/migrations/0006_atomic_merge_section.sql (atomic read-merge-write),
-- and supabase/migrations/0007_row_generation.sql (generation gate)
-- for the full rationale. Fresh installs: the functions are defined here so
-- they're available immediately. Existing installs: run the migrations
-- (idempotent CREATE OR REPLACE).

-- Merge two JSONB arrays. Arrays of `id`-keyed objects are merged by id;
-- arrays NOT keyed by id (guard satchel slots, activeParty) are treated as a
-- single value — incoming replaces existing wholesale, last-write-wins.
-- (AVE-197, AVE-362)
--
-- Element deletion is handled by tombstones, not by removal: the client marks a
-- deleted element `{ ...el, deleted: true }` and this by-id merge carries that
-- flag onto the matching element like any other field edit, so deletes sync
-- while concurrent adds of other ids still survive. Read sites filter tombstoned
-- elements out. completedEncounters is stored id-keyed (`{ id, deleted? }`) for
-- the same reason — see supabase/migrations/0004_tombstone_deletes.sql. (AVE-287)
--
-- Non-id arrays used to merge as a set union, but a union can only ever ADD
-- elements — clearing a satchel slot merged the old item right back in and the
-- Realtime echo resurrected it on the deleting client, and swapping a party
-- member unioned old + new into a 3-element party. After AVE-287 every array
-- that needs merge semantics is id-keyed, so plain arrays are safe to replace
-- wholesale. An empty incoming array is ambiguous (nothing to inspect for an
-- `id`) and in this app only ever means "nothing to merge", so existing is
-- preserved. See supabase/migrations/0005_plain_array_lww.sql. (AVE-362)
create or replace function public.merge_jsonb_array_by_id(existing jsonb, incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  elem    jsonb;
  elem_id jsonb;
  result  jsonb;
  idx     int;
  i       int;
begin
  if jsonb_typeof(existing) <> 'array' then
    return incoming;
  end if;
  if jsonb_typeof(incoming) <> 'array' then
    return incoming;
  end if;

  -- Empty incoming array: ambiguous (can't tell whether it is id-keyed), and
  -- in this app it only ever means "nothing to merge" — keep existing.
  if jsonb_array_length(incoming) = 0 then
    return existing;
  end if;

  -- Arrays NOT keyed by id (guard satchel slots, activeParty) are a single
  -- value: incoming replaces existing wholesale. The previous set-union merge
  -- could only add elements, so a deleted satchel item was resurrected by the
  -- write's own echo (AVE-362).
  if jsonb_typeof(incoming -> 0) <> 'object' or not ((incoming -> 0) ? 'id') then
    return incoming;
  end if;

  result := existing;
  for elem in select * from jsonb_array_elements(incoming)
  loop
    elem_id := elem -> 'id';
    idx := null;
    for i in 0 .. jsonb_array_length(result) - 1 loop
      if (result -> i) -> 'id' = elem_id then
        idx := i;
        exit;
      end if;
    end loop;

    if idx is null then
      result := result || jsonb_build_array(elem);
    else
      -- jsonb_set's path is text[]; an array index must be the index as text.
      result := jsonb_set(result, array[idx::text], public.deep_merge_jsonb(result -> idx, elem));
    end if;
  end loop;

  return result;
end;
$$;

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
    elsif jsonb_typeof(result -> k) = 'array' and jsonb_typeof(v) = 'array' then
      result := jsonb_set(result, array[k], public.merge_jsonb_array_by_id(result -> k, v));
    else
      result := jsonb_set(result, array[k], v);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.merge_section(
  campaign_id         text,
  section_name        text,
  payload             jsonb,
  expected_generation bigint default null
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

  -- Read and write in one statement (AVE-373): `c.<section>` refers to the
  -- row version the UPDATE itself locks, not a separately-fetched earlier
  -- read, so two concurrent merges of the same section can't clobber each
  -- other — the second call computes its merge against the first's
  -- already-committed result instead of overwriting it.
  --
  -- The WHERE gates the merge on generation (AVE-527): a null
  -- expected_generation always fires (backward compatible); a value that no
  -- longer matches the row's generation (a reset/import landed in between)
  -- skips the DO UPDATE entirely, so the stale full-section payload never lands
  -- and `merged` is null. merge_section never modifies generation itself, so
  -- two normal concurrent writes (same generation) are unaffected.
  execute format(
    'insert into public.campaigns as c (id, %I, %s) values ($1, $2, now()) '
    'on conflict (id) do update set '
    '  %I = public.deep_merge_jsonb(c.%I, excluded.%I), '
    '  %s = excluded.%s '
    'where c.generation = coalesce($3, c.generation) '
    'returning c.%I',
    section_name, ts_col,
    section_name, section_name, section_name,
    ts_col, ts_col,
    section_name
  )
    into merged
    using campaign_id, payload, expected_generation;

  return merged;
end;
$$;

grant execute on function public.merge_jsonb_array_by_id(jsonb, jsonb)     to anon, authenticated;
grant execute on function public.deep_merge_jsonb(jsonb, jsonb)            to anon, authenticated;
grant execute on function public.merge_section(text, text, jsonb, bigint)  to anon, authenticated;
