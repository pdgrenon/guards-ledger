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

`sync.upsertSection(sectionName, state)` extracts only the keys for that section
and calls the **`merge_section` RPC** — never a raw UPDATE. It never writes
local-only keys. The RPC performs a field-level, array-aware deep merge inside a
single atomic statement, so two players editing different keys of the same
section concurrently don't lose each other's writes. A plain targeted UPDATE is
the lost-update bug that merge exists to prevent, not a description of it.

When offline, upserts queue by section name (last write wins per section) and
flush on reconnect; the queue is persisted so a tab that dies before the flush
doesn't lose the edit.

The merge model has real subtleties — element deletion uses tombstones rather
than removal, non-id arrays replace wholesale, and a full-row replacement gates
on a row generation. **CLAUDE.md ("Sync (Supabase Realtime)") is authoritative
for all of it; this file is an orientation, not a spec.**

## joinCampaign

On join, the full remote row is fetched and every section in `ALL_SECTIONS` is merged into local state. `log`, `settings`, and `activeGuardIdx` are preserved from local.

## Realtime subscription

Subscribes to `postgres_changes` filtered to `id=eq.{campaignId}`. Realtime
delivers the *entire* row on every UPDATE, and only the changed section's
timestamp is bumped, so most sections in any given payload are stale filler.
Each one is therefore gated before it is applied: a per-section timestamp check
(strictly newer, compared as epoch milliseconds), then value-based echo
suppression against both current local state and a buffer of our own recent
writes. Applying every section unconditionally is the garbled-input bug those
gates exist to prevent. Local-only keys are preserved throughout.

The row is also re-fetched on boot, reconnect, and foreground, through that same
gated pipeline — resubscribing alone only delivers *future* events, never the
updates missed while the socket was down.

## Local-only mode

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent, the Supabase client is null and all sync calls silently no-op. The app runs fully local. Do not gate feature logic on env var presence.
