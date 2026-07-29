# Sync boundary reference

Load this when working on `useSupabaseSync.js`, `useGameState.js`, or any feature that touches multiplayer state.

## Synced sections

| Section | State keys | Supabase column |
|---|---|---|
| `resources` | `sil`, `lux` | `resources` |
| `cities` | `cities` | `cities` |
| `party` | `activeParty` | `party` |
| `stash` | `stash`, `stonebound` | `stash` |
| `campaign` | `campaign` | `campaign` |
| `guard_0` … `guard_7` | one element of `guards` each | `guard_0` … `guard_7` |
| **local-only** | `log`, `settings`, `activeGuardIdx` | — not synced — |

`activeGuardIdx` is explicitly local-only. It is per-player UI navigation state. Syncing it caused a live bug where players overwrote each other's guard tab position.

## upsertSection behavior

`sync.upsertSection(sectionName, state)` extracts only the keys for that section and does a targeted UPDATE — it never writes local-only keys. When offline, upserts queue by section name (last write wins per section) and flush on reconnect.

## joinCampaign

On join, the full remote row is fetched and every section in `ALL_SECTIONS` is merged into local state. `log`, `settings`, and `activeGuardIdx` are preserved from local.

## Realtime subscription

Subscribes to `postgres_changes` filtered to `id=eq.{campaignId}`. On UPDATE, every section in `ALL_SECTIONS` is applied; local-only keys are preserved.

## Local-only mode

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent, the Supabase client is null and all sync calls silently no-op. The app runs fully local. Do not gate feature logic on env var presence.
