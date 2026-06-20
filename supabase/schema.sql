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

-- ─── Field-level merge RPC (AVE-94, AVE-197) ────────────────────────────────
-- See supabase/migrations/0002_field_level_merge.sql (object merge) and
-- supabase/migrations/0003_array_merge.sql (array merge) for the full
-- rationale. Fresh installs: the functions are defined here so they're
-- available immediately. Existing installs: run the migrations (idempotent
-- CREATE OR REPLACE).

-- Merge two JSONB arrays. Arrays of `id`-keyed objects are merged by id;
-- arrays of plain values are merged as a set union. (AVE-197)
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

  -- Plain-value arrays (e.g. completedEncounters: an array of strings, no
  -- "id"-keyed objects) merge as a union instead of by id.
  if jsonb_array_length(incoming) = 0 or jsonb_typeof(incoming -> 0) <> 'object' or not ((incoming -> 0) ? 'id') then
    select coalesce(jsonb_agg(distinct v), '[]'::jsonb) into result
    from (
      select v from jsonb_array_elements(existing) v
      union
      select v from jsonb_array_elements(incoming) v
    ) u(v);
    return result;
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
      using errcode = '22023';
  end if;

  ts_col := quote_ident(section_name || '_updated_at');

  execute format('select %I from public.campaigns where id = $1', section_name)
    into existing
    using campaign_id;

  merged := public.deep_merge_jsonb(existing, payload);

  execute format(
    'insert into public.campaigns (id, %I, %s) values ($1, $2, now()) '
    'on conflict (id) do update set %I = excluded.%I, %s = excluded.%s',
    section_name, ts_col, section_name, section_name, ts_col, ts_col
  )
    using campaign_id, merged;

  return merged;
end;
$$;

grant execute on function public.merge_jsonb_array_by_id(jsonb, jsonb) to anon, authenticated;
grant execute on function public.deep_merge_jsonb(jsonb, jsonb)        to anon, authenticated;
grant execute on function public.merge_section(text, text, jsonb)      to anon, authenticated;
