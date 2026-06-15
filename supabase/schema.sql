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
