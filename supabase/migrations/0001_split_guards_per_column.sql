-- AVE-83 — Split the single `guards` column into per-guard columns.
--
-- Before: campaigns.guards held one JSONB blob: { guards: [...8], activeParty: [...] }
-- After:  campaigns.guard_0 … guard_7 each hold one guard object, and
--         campaigns.party holds { activeParty: [...] }.
--
-- This lets two players edit different guards concurrently without the
-- last-write-wins clobbering that a single shared column causes.
--
-- Apply this ONCE to an existing database. Fresh installs should use
-- schema.sql instead (which already has the new columns). Idempotent:
-- safe to re-run.

-- 1. Add the new columns (and their timestamps).
alter table public.campaigns
  add column if not exists party              jsonb,
  add column if not exists guard_0            jsonb,
  add column if not exists guard_1            jsonb,
  add column if not exists guard_2            jsonb,
  add column if not exists guard_3            jsonb,
  add column if not exists guard_4            jsonb,
  add column if not exists guard_5            jsonb,
  add column if not exists guard_6            jsonb,
  add column if not exists guard_7            jsonb,
  add column if not exists party_updated_at   timestamptz,
  add column if not exists guard_0_updated_at timestamptz,
  add column if not exists guard_1_updated_at timestamptz,
  add column if not exists guard_2_updated_at timestamptz,
  add column if not exists guard_3_updated_at timestamptz,
  add column if not exists guard_4_updated_at timestamptz,
  add column if not exists guard_5_updated_at timestamptz,
  add column if not exists guard_6_updated_at timestamptz,
  add column if not exists guard_7_updated_at timestamptz;

-- 2. Backfill from the old `guards` blob (only rows that still have it).
update public.campaigns set
  party   = jsonb_build_object('activeParty', guards -> 'activeParty'),
  guard_0 = guards -> 'guards' -> 0,
  guard_1 = guards -> 'guards' -> 1,
  guard_2 = guards -> 'guards' -> 2,
  guard_3 = guards -> 'guards' -> 3,
  guard_4 = guards -> 'guards' -> 4,
  guard_5 = guards -> 'guards' -> 5,
  guard_6 = guards -> 'guards' -> 6,
  guard_7 = guards -> 'guards' -> 7,
  party_updated_at   = coalesce(guards_updated_at, now()),
  guard_0_updated_at = coalesce(guards_updated_at, now()),
  guard_1_updated_at = coalesce(guards_updated_at, now()),
  guard_2_updated_at = coalesce(guards_updated_at, now()),
  guard_3_updated_at = coalesce(guards_updated_at, now()),
  guard_4_updated_at = coalesce(guards_updated_at, now()),
  guard_5_updated_at = coalesce(guards_updated_at, now()),
  guard_6_updated_at = coalesce(guards_updated_at, now()),
  guard_7_updated_at = coalesce(guards_updated_at, now())
where guards is not null
  and guard_0 is null;

-- 3. Drop the old single-blob columns.
alter table public.campaigns
  drop column if exists guards,
  drop column if exists guards_updated_at;
