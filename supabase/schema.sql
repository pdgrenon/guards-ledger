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
-- so the anon role is allowed to read and write rows. (The code itself is the
-- only access control, matching how the app is used.)
alter table public.campaigns enable row level security;

drop policy if exists "anon can read campaigns"   on public.campaigns;
drop policy if exists "anon can insert campaigns" on public.campaigns;
drop policy if exists "anon can update campaigns" on public.campaigns;

create policy "anon can read campaigns"   on public.campaigns for select using (true);
create policy "anon can insert campaigns" on public.campaigns for insert with check (true);
create policy "anon can update campaigns" on public.campaigns for update using (true) with check (true);

-- Enable Realtime so postgres_changes UPDATE events are broadcast.
alter publication supabase_realtime add table public.campaigns;

-- ─── Field-level merge RPC (AVE-94) ─────────────────────────────────────────
-- See supabase/migrations/0002_field_level_merge.sql for the full rationale.
-- Fresh installs: the function is defined here so it's available immediately.
-- Existing installs: run the migration (idempotent CREATE OR REPLACE).
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

grant execute on function public.deep_merge_jsonb(jsonb, jsonb) to anon, authenticated;
grant execute on function public.merge_section(text, text, jsonb)    to anon, authenticated;
