/**
 * useSupabaseSync.js
 *
 * Manages all Supabase sync for the Guards Ledger.
 *
 * Responsibilities:
 *   - Creating and joining campaigns (short alphanumeric code)
 *   - Subscribing to Realtime changes on the active campaign
 *   - Upserting individual sections when local state changes
 *   - Queuing upserts while offline and flushing on reconnect
 *   - Resubscribing when the page becomes visible again after being backgrounded
 *     (mobile browsers drop websockets silently when a tab is backgrounded)
 *   - Re-fetching the campaign row on boot, reconnect, and foreground so state
 *     missed while disconnected is pulled in (resubscribing only delivers future
 *     events, never the UPDATEs missed while the socket was down) — see AVE-372
 *
 * Section mapping (matches Supabase columns):
 *   resources       ← { sil, lux }
 *   cities          ← { cities }
 *   party           ← { activeParty }
 *   guard_0…guard_7 ← one guard object each (state.guards[i])
 *   stash           ← { stash, stonebound }
 *   campaign        ← { campaign }
 *
 * Guards are split into eight per-guard columns (guard_0 … guard_7) so two
 * players editing different guards at the same time never collide — each write
 * touches only that guard's column. The shared two-element party selection
 * lives in its own `party` column. See AVE-83.
 *
 * Note: activeGuardIdx is intentionally excluded from all sections. It is
 * local-only UI state (which guard tab each player is viewing) and must never
 * be synced — each player controls their own view independently.
 *
 * Usage in useGameState:
 *   const sync = useSupabaseSync(state, onRemoteChange);
 *   // Call sync.upsertSection('resources', state) after any resources change.
 *   // sync.campaignId, sync.syncStatus, sync.createCampaign,
 *   // sync.joinCampaign, sync.leaveCampaign are exposed for SettingsPanel.
 *
 * Testability: the third argument accepts an injected Supabase client so unit
 * tests can pass a mock. Production callers (useGameState) leave it null and
 * the module-level client (built from VITE_SUPABASE_URL/ANON_KEY env vars) is
 * used.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import deepEqual from 'fast-deep-equal';
import { normalizeCompletedEncounters, healRemoteSection } from './gameReducers';

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Client is null when env vars are missing (solo/portfolio mode — sync is disabled).
const defaultSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_ID_KEY = 'guards_ledger_campaign_id';

// localStorage key backing the pending upsert queue. The queue (pendingQueue,
// below) is otherwise memory-only, so an edit sitting in it — offline, mid-error
// backoff, or captured out of useGameState's debounce window on tab-hide — is
// lost if the tab dies before the flush. Persisting it lets the next boot
// recover and replay those writes instead of `refetchRow` reverting the edit to
// the older server value (AVE-522).
export const PENDING_QUEUE_KEY = 'guards_ledger_pending_v1';

// Number of guards in a campaign (Grigory … Yana). Each gets its own column.
export const GUARD_COUNT = 8;

// Maps a "simple" section name → state keys written to / read from that
// Supabase column. Per-guard sections (guard_0 … guard_7) are handled
// separately by extractSection/applyRemoteSection.
// activeGuardIdx is deliberately absent: it is local-only UI navigation state.
const SECTION_KEYS = {
  resources: ['sil', 'lux'],
  cities:    ['cities'],
  party:     ['activeParty'],
  stash:     ['stash', 'stonebound'],
  campaign:  ['campaign'],
};

// Every synced section/column name, in a stable order. Used to iterate when
// applying a remote row (join + Realtime) and when building a full row.
export const ALL_SECTIONS = [
  'resources', 'cities', 'party', 'stash', 'campaign',
  ...Array.from({ length: GUARD_COUNT }, (_, i) => `guard_${i}`),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Column name for a guard index. */
export function guardColumn(idx) { return `guard_${idx}`; }

/** Whether a section name is a per-guard column. */
export function isGuardColumn(name) { return /^guard_\d+$/.test(name); }

/** Guard array index for a per-guard column name. */
export function guardIndexFromColumn(name) { return Number(name.slice('guard_'.length)); }

/** Generate a campaign code like 'WOLF-7F3K9Q' — word prefix + 6 random alphanumeric chars (~2.2B combinations). */
export function generateCampaignId() {
  const words  = ['WOLF','BEAR','HAWK','IRON','GOLD','SNOW','DARK','FIRE','VALE','DUSK'];
  const word   = words[Math.floor(Math.random() * words.length)];
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${word}-${suffix}`;
}

/**
 * Normalize a user-entered campaign code to the canonical stored id.
 * Strips every non-alphanumeric character (spaces, hyphens of any Unicode
 * flavor, stray punctuation) and uppercases. A 10-character result is a
 * current-format code and gets its hyphen reinserted after the 4-letter word
 * prefix (WOLF7F3K9Q -> WOLF-7F3K9Q). Any other length is returned bare, which
 * preserves pre-AVE-104 legacy ids (e.g. WOLF42) that have no hyphen at all.
 */
export function normalizeCampaignCode(raw) {
  const bare = (raw ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return bare.length === 10 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

/**
 * Extract the payload for a section/column from full state.
 * For a per-guard column this is the guard object itself (state.guards[i]).
 * For a simple section it is an object of that section's keys.
 *
 * Throws on an unknown section name. Section names are tightly controlled
 * by the SECTION_KEYS map and the isGuardColumn helper, so a missing key
 * is always a programmer error (typo, refactor leftover). The server
 * also validates the name in merge_section as a defense-in-depth check.
 */
export function extractSection(state, sectionName) {
  if (isGuardColumn(sectionName)) {
    return state.guards[guardIndexFromColumn(sectionName)];
  }
  const keys = SECTION_KEYS[sectionName];
  if (!keys) {
    throw new Error(`extractSection: unknown section name "${sectionName}"`);
  }
  return Object.fromEntries(keys.map(k => [k, state[k]]));
}

/**
 * Normalize a raw Supabase row to the per-guard column shape.
 *
 * Pre-AVE-83 campaigns store guards as a single `guards` blob
 * ({ guards: [...8], activeParty: [...] }). If a row still has that shape and
 * no guard_0 column yet (i.e. the SQL migration hasn't been applied), expand it
 * into guard_0…guard_7 + party so the client can read either shape. This is the
 * client-side counterpart to the one-time SQL migration.
 *
 * Also normalizes a pre-AVE-287 `campaign.completedEncounters` (a plain array of
 * encounter-id strings) into the id-keyed { id, deleted? } shape, so a database
 * that hasn't yet had supabase/migrations/0004_tombstone_deletes.sql applied is
 * still read correctly.
 */
export function normalizeRow(row) {
  if (!row) return row;

  let out = row;
  if (row.guards !== undefined && row.guard_0 === undefined) {
    out = { ...out };
    const blob = row.guards || {};
    const arr  = Array.isArray(blob.guards) ? blob.guards : [];
    for (let i = 0; i < GUARD_COUNT; i++) {
      if (arr[i] !== undefined) out[guardColumn(i)] = arr[i];
    }
    if (out.party === undefined && blob.activeParty) {
      out.party = { activeParty: blob.activeParty };
    }
  }

  // Reshape completedEncounters from string[] to { id, deleted? }[] if needed.
  const enc = out.campaign?.completedEncounters;
  if (Array.isArray(enc) && enc.some(e => typeof e === 'string')) {
    if (out === row) out = { ...out };
    out.campaign = { ...out.campaign, completedEncounters: normalizeCompletedEncounters(enc) };
  }

  return out;
}

/** Build the full Supabase row payload from state (all sections + columns). */
function buildFullRow(campaignId, state) {
  const now = new Date().toISOString();
  const row = { id: campaignId };
  for (const section of ALL_SECTIONS) {
    row[section]                 = extractSection(state, section);
    row[`${section}_updated_at`] = now;
  }
  return row;
}

/**
 * Merge a remote section into local state.
 * - Per-guard column: replaces only that one guard in the guards array.
 * - Simple section: spreads its keys at the top level.
 * Keys not listed in any section (e.g. activeGuardIdx) are never touched.
 *
 * The payload is shape-healed first (AVE-873). Local loads run everything
 * through healState, and the components dereference these fields without guards
 * because of it — `CampaignTab` destructures `plans` / `locations` /
 * `eventTokens` / `ftIstraBuildings` and calls `plans.filter(...)`, `GuardPanel`
 * reads `guard.equipment.weapon`. A section arriving from Supabase used to skip
 * all of that, so a malformed one threw on render, dropped the tab into its
 * ErrorBoundary, and — being persisted by the save effect a moment later —
 * survived the reload the fallback offers.
 *
 * This is the single choke point for all three inbound paths (joinCampaign, the
 * Realtime UPDATE handler, refetchRow), and it runs AFTER applyRemoteRow's
 * timestamp and echo gates, which compare the raw incoming value against
 * extractSection(local) — healing earlier would break that deepEqual match.
 * Healing a healthy section is a deep-equal no-op, which the helper tests pin.
 */
export function applyRemoteSection(localState, sectionName, remoteSection) {
  if (remoteSection == null) return localState;
  const healed = healRemoteSection(sectionName, remoteSection);
  if (isGuardColumn(sectionName)) {
    const idx    = guardIndexFromColumn(sectionName);
    const guards = localState.guards.map((g, i) => i === idx ? healed : g);
    return { ...localState, guards };
  }
  return { ...localState, ...healed };
}

/**
 * Reconcile an inbound Realtime value against our own outstanding writes.
 *
 * Every write we push through `merge_section` is echoed straight back to us as a
 * Realtime UPDATE (Postgres replays our own change). The value-equality check in
 * the subscription drops an echo that still deep-equals current local state, but
 * that is not enough while the user is actively editing: by the time the echo of
 * an *earlier* keystroke arrives, local state has already advanced to a *later*
 * keystroke, so the echo no longer equals local — and gets applied, snapping the
 * field back to the older value. That is the AVE-314 "typing truncated / can't
 * delete" bug.
 *
 * To recognize those echoes we remember every value we send per section. This
 * helper takes that list (each entry `{ value, at }`), prunes entries older than
 * `ttl` (a lost echo must not linger forever), and reports whether `incoming`
 * matches one of our own outstanding writes. When it does, that single entry is
 * consumed so a genuine later remote change carrying the same value can still
 * come through.
 *
 * Pure — the caller swaps the returned `list` back into its ref. This stays
 * value-based and timing-independent: `ttl` only bounds buffer growth, it is not
 * a suppression window (contrast the wall-clock window removed in AVE-82). A
 * different value from another player never matches, so genuine remote changes
 * are never dropped.
 *
 * @returns {{ isEcho: boolean, list: Array<{value:*, at:number}> }}
 */
export function reconcileSelfEcho(list, incoming, now, ttl) {
  const pruned = (list || []).filter(e => now - e.at < ttl);
  const idx = pruned.findIndex(e => deepEqual(e.value, incoming));
  if (idx === -1) return { isEcho: false, list: pruned };
  return { isEcho: true, list: pruned.slice(0, idx).concat(pruned.slice(idx + 1)) };
}

/**
 * Whether a self-write was dispatched at or after `sinceTs` (AVE-518 follow-up).
 *
 * `refetchRow`'s SELECT is a plain HTTP request dispatched at one point in time
 * but not necessarily *resolved* before a write that started later — on a slow
 * (e.g. mobile) connection it can sit in flight for seconds. If the user makes
 * an edit *after* the refetch was dispatched but the refetch's response still
 * arrives after that edit's own write has already been sent and its echo
 * already consumed, the stale row is invisible to both existing guards: its
 * value doesn't match current local (which has the newer edit) and it doesn't
 * match a buffered self-write either (it predates that write, so the values
 * differ) — it slips through and clobbers the newer edit.
 *
 * This closes that window using only this device's own clock: if we dispatched
 * a write to this section at or after `sinceTs` (when the now-resolving fetch
 * was issued), that fetch cannot possibly reflect it, so its data for this
 * section must be discarded — the eventual echo/confirmation of that newer
 * write is what reconciles local state instead.
 */
export function hasNewerSelfWrite(list, sinceTs) {
  return (list || []).some(e => e.at >= sinceTs);
}

/**
 * Whether a `merge_section` response means the write was rejected by the
 * generation gate (AVE-527), rather than committed.
 *
 * A gated-out `DO UPDATE` matches nothing, so `RETURNING` yields no row and
 * PostgREST reports `{ data: null, error: null }` — indistinguishable from
 * success unless `data` is checked. That is why a rejected write used to be
 * deleted from the pending queue with the sync dot still green, losing the
 * edit silently (AVE-826).
 *
 * `merge_section` returns the merged section on every path that commits (both
 * the INSERT and the DO UPDATE), and `extractSection` always yields a JSON
 * object, so a null return uniquely means "rejected".
 */
export function isGenerationRejected(data, error) {
  return !error && data == null;
}

/** Per-section timestamp column name (matches the schema: `<section>_updated_at`). */
export function sectionTsColumn(section) { return `${section}_updated_at`; }

/**
 * Parse a `<section>_updated_at` value into epoch milliseconds.
 *
 * The same instant reaches us in three different renderings, so these values
 * must never be compared as strings (AVE-868):
 *   - Realtime UPDATE payload : `2026-07-29 15:30:00.654321+00`  (space, `+00`)
 *   - PostgREST SELECT        : `2026-07-29T15:30:00.654321+00:00`
 *   - buildFullRow (client)   : `2026-07-29T15:30:00.654Z`
 *
 * The columns are `timestamptz`, and @supabase/realtime-js deliberately passes
 * `timestamptz` through untouched (its `convertCell` applies the space→`T` fix
 * only to `timestamp`), so Realtime delivers raw Postgres text output while
 * PostgREST delivers ISO-8601. `' '` (0x20) sorts below `'T'` (0x54), so a
 * lexicographic compare rules *every* Realtime stamp older than *any* REST one
 * with the same date — which silently dropped every live update for the rest of
 * the UTC day once a boot/foreground refetch seeded the baseline.
 *
 * Returns NaN for a missing or unparseable value; callers fall open (see
 * sectionChanged) to preserve the existing "no reliable baseline → don't gate"
 * behavior.
 */
export function tsToMs(ts) {
  if (typeof ts !== 'string') return NaN;
  // Postgres text output is not valid ISO-8601 in two ways, and Date.parse
  // returns NaN on both: a space instead of `T`, and a bare two-digit UTC
  // offset (`+00`) where ISO requires minutes (`+00:00`) or `Z`. Normalize
  // both before parsing. The offset rewrite is anchored to a preceding time
  // component so a date-only string ('2026-07-29') can't have its `-29` day
  // mistaken for an offset.
  const iso = ts
    .replace(' ', 'T')
    .replace(/(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00');
  return Date.parse(iso);
}

/**
 * Whether a remote section in this UPDATE actually changed, judged by its
 * per-section `_updated_at` timestamp.
 *
 * Realtime delivers the *entire* row on every UPDATE, but `merge_section` only
 * bumps the timestamp of the one section it wrote. So when player B edits a
 * different guard, the payload still carries player A's section — with its
 * timestamp unchanged — and that value may be *stale* relative to A's own
 * in-flight local edit. Applying it would clobber A's edit (the AVE-314
 * two-player "typing stomped every few seconds" symptom).
 *
 * Returns true (apply, subject to echo checks) when the timestamp advanced, or
 * when we have no reliable baseline to compare against (first sighting, or a
 * pre-migration row without per-section timestamps — fall back to value-based
 * behavior). Returns false when the timestamp is unchanged from — or *older
 * than* — what we last saw: the section is just riding along (a stale value on
 * an unrelated section's UPDATE) or an out-of-order arrival (a slow refetch
 * resolving after a newer Realtime event already applied), and must be left
 * alone. Only a *strictly newer* section is a real change to apply (AVE-526).
 *
 * The comparison runs on epoch milliseconds via `tsToMs`, never on the raw
 * strings: the same instant arrives in three different textual formats
 * depending on whether it came over Realtime, PostgREST, or a client-built row,
 * and a lexicographic compare across those formats is not chronological
 * (AVE-868).
 */
export function sectionChanged(row, section, lastSeen) {
  const ts   = tsToMs(row[sectionTsColumn(section)]);
  const prev = tsToMs(lastSeen[section]);
  // Missing or unparseable on either side → no reliable baseline, don't gate.
  if (Number.isNaN(ts) || Number.isNaN(prev)) return true;
  return ts > prev;                            // only strictly newer sections apply
}

/** Snapshot the per-section `_updated_at` timestamps present on a row. */
export function snapshotTimestamps(row) {
  const out = {};
  for (const section of ALL_SECTIONS) {
    const ts = row[sectionTsColumn(section)];
    if (ts != null) out[section] = ts;
  }
  return out;
}

/**
 * Merge a fresh timestamp snapshot into the running `lastSeenTs` baseline,
 * keeping the *later* value per section. Monotonic so a stale, out-of-order row
 * can never regress the baseline and weaken the gate for the next event
 * (AVE-526). Compared as epoch milliseconds, not strings, for the same reason
 * as sectionChanged — the stored values arrive in mixed formats (AVE-868). The
 * raw string is what gets stored, so the baseline still shows what came over
 * the wire.
 */
export function mergeSeenTimestamps(prev, incoming) {
  const out = { ...prev };
  for (const section in incoming) {
    const ts = incoming[section];
    const existing = out[section];
    const existingMs = tsToMs(existing);
    // An unparseable baseline is worse than useless — it makes sectionChanged
    // fall open forever — so let any incoming value replace it.
    if (existing == null || Number.isNaN(existingMs) || tsToMs(ts) > existingMs) {
      out[section] = ts;
    }
  }
  return out;
}

// ─── Runtime helpers ──────────────────────────────────────────────────────────

/**
 * Load the persisted pending-upsert queue (AVE-522). Stored as a JSON array of
 * [sectionName, payload] pairs — exactly `Array.from(map.entries())` — so it
 * round-trips straight back into a Map. Returns an empty Map on any failure
 * (absent key, malformed JSON, storage blocked): a lost queue must never crash
 * boot.
 */
export function loadPendingQueue() {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? new Map(entries) : new Map();
  } catch {
    return new Map();
  }
}

/**
 * Persist the pending-upsert queue to localStorage (AVE-522). Called after every
 * mutation of `pendingQueue` so the on-disk copy always matches memory. An empty
 * queue removes the key entirely. Best-effort — a rejected write (quota/blocked)
 * is swallowed; the in-memory queue still drives this session.
 */
export function persistPendingQueue(queue) {
  try {
    if (queue.size === 0) {
      localStorage.removeItem(PENDING_QUEUE_KEY);
    } else {
      localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(Array.from(queue.entries())));
    }
  } catch {
    /* best-effort — the in-memory queue still flushes this session */
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object}    state            Current full game state (from useGameState)
 * @param {function}  onRemoteChange   Called with new full state when a remote update arrives
 * @param {object?}   injectedClient   Optional Supabase client (for tests). When undefined,
 *                                     uses the module-level default built from env vars.
 *                                     Pass an explicit value (including null) to override.
 */
export function useSupabaseSync(state, onRemoteChange, injectedClient) {
  // Resolve which Supabase client to use. Default is `defaultSupabase` (from
  // env vars). In tests, an injected mock is passed via the third argument.
  // The `arguments.length > 2` check distinguishes "not passed" from
  // "explicitly passed as null/false" — the latter overrides the default.
  const client = arguments.length > 2 ? injectedClient : defaultSupabase;

  const [campaignId,  setCampaignId]  = useState(() => localStorage.getItem(CAMPAIGN_ID_KEY));
  const [syncStatus,  setSyncStatus]  = useState('idle'); // 'idle' | 'syncing' | 'error' | 'offline'
  const [syncError,   setSyncError]   = useState(null);

  // Pending upserts queued while offline: Map<sectionName, sectionData>
  // Using a Map means newer data for the same section overwrites older.
  // Seeded from localStorage so writes queued before a tab death are recovered
  // and replayed on the next boot rather than silently lost (AVE-522). Lazy
  // init (useRef evaluates its argument every render) so the read happens once.
  const pendingQueue  = useRef(null);
  if (pendingQueue.current === null) pendingQueue.current = loadPendingQueue();
  const isOnline      = useRef(navigator.onLine);
  const channelRef    = useRef(null);
  // Keep a ref to the latest state and campaignId so async callbacks
  // always see current values without stale closure issues.
  const stateRef      = useRef(state);
  const campaignIdRef = useRef(campaignId);
  useEffect(() => { stateRef.current      = state;      }, [state]);
  useEffect(() => { campaignIdRef.current = campaignId; }, [campaignId]);

  // ── Self-write echo tracking (AVE-314) ────────────────────────────────────
  // Values we've sent per section that we still expect to hear back as our own
  // Realtime echo. Map<sectionName, Array<{ value, at }>>. Used to drop echoes
  // of earlier keystrokes that would otherwise revert an in-progress edit. TTL
  // bounds the buffer so a lost echo can't linger indefinitely; it is not a
  // suppression window (see reconcileSelfEcho / AVE-82).
  const selfWrites = useRef(new Map());
  const SELF_WRITE_TTL_MS = 15000;

  // ── Backoff retry for error recovery (AVE-376) ─────────────────────────────
  // When syncStatus is 'error', schedule flushQueue with exponential backoff
  // (1s, 2s, 4s, 8s… capped at 30s). Resets on a successful sync.
  const retryCountRef = useRef(0);
  // `refetchRow` is called from the generation-rejection path in both write
  // callbacks (AVE-826), but must NOT enter their dependency arrays: its
  // identity tracks the caller's `onRemoteChange`, so depending on it would make
  // `flushQueue` — and through it `upsertSection` — change every render, and the
  // boot-drain effect below (which depends on `flushQueue` and calls it) would
  // re-run in a loop. Reached through a ref so both callbacks stay stable.
  const refetchRowRef = useRef(null);
  // Bumped on every failed write. The recovery effect cannot key off
  // syncStatus alone: a retry goes 'error' → 'syncing' → 'error', and React
  // can coalesce that into a single committed render whose value is unchanged,
  // leaving the effect with no dependency change and no timer re-armed — so
  // exactly one retry ever fired (AVE-871). This counter always changes on a
  // failure, so the ladder re-arms whether or not the status string moved.
  const [retryTick, setRetryTick] = useState(0);
  const bumpRetryTick = useCallback(() => setRetryTick(t => t + 1), []);

  // ── Per-section timestamp baseline (AVE-314) ──────────────────────────────
  // The last `<section>_updated_at` value we've seen per section. An inbound
  // UPDATE carries the whole row, but only the section it actually changed has
  // a bumped timestamp — every other section is stale filler that must not be
  // applied over a local in-flight edit. Seeded on join/create; advanced on
  // each processed Realtime row. Map<sectionName, isoTimestamp>.
  const lastSeenTs = useRef({});

  // ── Last seen row generation (AVE-527) ────────────────────────────────────
  // The `generation` column bumps only on a full replacement (replaceRow —
  // reset/import). Tracked so every merge_section write can carry it as
  // `expected_generation` (a stale-generation write no-ops server-side), and so
  // an inbound row with a HIGHER generation than we last saw is recognized as a
  // full replacement — applyRemoteRow then treats every section as changed,
  // bypassing the per-section timestamp gate. Seeded on join/create/boot;
  // advanced (monotonically) whenever a processed row carries a higher value.
  const lastSeenGen = useRef(0);

  // ── "There is something to retry that isn't in pendingQueue" ──────────────
  // Both of these gate flushQueue's empty-queue branch, which otherwise clears
  // an 'error' status back to 'idle' about a second later and parks the sync
  // pill on green. That branch is correct for its own case (AVE-871: a failed
  // write whose queue another path already drained) — it simply cannot see
  // failures that never produce a queue entry.
  //
  // Declared here, ahead of subscribe/flushQueue/replaceRow, so no callback
  // closes over a not-yet-initialized binding.
  const channelDown   = useRef(false);  // Realtime channel is not subscribed (AVE-938)
  const replaceFailed = useRef(false);  // a full-row replaceRow failed (AVE-937)

  const noteSelfWrite = useCallback((section, value) => {
    const now  = Date.now();
    const list = (selfWrites.current.get(section) || []).filter(e => now - e.at < SELF_WRITE_TTL_MS);
    // One note per dispatch — the buffer must hold exactly as many entries as
    // writes actually sent, so every Realtime echo has a matching note to be
    // suppressed against. The previous deep-equal skip (AVE-528) tried to
    // dedupe an undo/debounce double-note, but the real defect was a double-
    // *send* (undo + the original edit's pending debounce both firing); that
    // is now fixed at the source in undoLastAction, so under-noting a genuine
    // repeated-value dispatch here would let its echo slip through and revert a
    // newer local edit (AVE-528 follow-up).
    list.push({ value, at: now });
    selfWrites.current.set(section, list);
  }, []);

  const consumeSelfEcho = useCallback((section, incoming) => {
    const { isEcho, list } = reconcileSelfEcho(
      selfWrites.current.get(section), incoming, Date.now(), SELF_WRITE_TTL_MS,
    );
    selfWrites.current.set(section, list);
    return isEcho;
  }, []);

  // Remove the most-recent self-write note matching `value` — the note we
  // optimistically recorded (before the RPC, to win the race against its own
  // Realtime echo) for a write that then FAILED. A failed write commits nothing
  // and so emits no echo; leaving the phantom note would make the next genuine
  // remote change carrying the same value look like an echo and be dropped
  // (AVE-528 follow-up). This is what lets us keep one-note-per-*successful*-
  // dispatch without the lossy deep-equal skip that used to paper over the
  // flush-retry double-note. If the write actually committed but reported an
  // error (e.g. a post-commit timeout), its real echo already consumed the note
  // and this is a no-op.
  const unnoteSelfWrite = useCallback((section, value) => {
    const list = selfWrites.current.get(section);
    if (!list || list.length === 0) return;
    for (let i = list.length - 1; i >= 0; i--) {
      if (deepEqual(list[i].value, value)) { list.splice(i, 1); break; }
    }
    if (list.length === 0) selfWrites.current.delete(section);
    else selfWrites.current.set(section, list);
  }, []);

  // ── Persisted pending queue (AVE-522) ─────────────────────────────────────
  // Mirror the in-memory queue to localStorage after every mutation so a write
  // still queued when the tab dies survives to the next boot.
  const persistQueue = useCallback(() => {
    persistPendingQueue(pendingQueue.current);
  }, []);

  // Synchronously capture the given sections' current payloads into the pending
  // queue and persist it (AVE-522). Called from useGameState's tab-hide /
  // beforeunload handlers so an edit still inside the 400ms debounce window is
  // recorded to localStorage — a synchronous, unabortable write — before the
  // async network flush that a dying tab may never complete. A successful flush
  // later clears the entry again. No-op outside a campaign (nothing to sync).
  const enqueuePendingSections = useCallback((sections, currentState) => {
    if (!campaignIdRef.current) return;
    let changed = false;
    for (const section of sections) {
      let payload;
      try { payload = extractSection(currentState, section); } catch { continue; }
      pendingQueue.current.set(section, payload);
      changed = true;
    }
    if (changed) persistQueue();
  }, [persistQueue]);

  // ── Apply a remote row through the gated pipeline (AVE-314 / AVE-372) ──────
  // Shared by the Realtime UPDATE handler and refetchRow. Takes a raw Supabase
  // row (Realtime's payload.new, or the result of a fresh SELECT), normalizes
  // it, then applies each section on top of current local state subject to the
  // same guards used everywhere:
  //   1. per-section timestamp gate (skip sections this row didn't change),
  //   2. value/self-echo suppression (skip echoes of our own writes), and
  //   3. staleness vs. our own outstanding writes (AVE-518 follow-up, see below).
  // Advances the per-section timestamp baseline to the row afterwards, and calls
  // onRemoteChange only when at least one section was actually applied.
  //
  // `requestedAt`, when given (refetchRow only — see below), is the time the
  // underlying request was dispatched. A row can arrive well after that: on a
  // slow connection, refetchRow's SELECT can still be in flight when a fresh
  // local edit is made and fully dispatched, so by the time the SELECT finally
  // resolves it is a stale snapshot racing a newer write. Neither of the other
  // two guards catches this — the stale value doesn't match current local (which
  // already has the newer edit) and doesn't match the buffered self-write either
  // (it predates that write, so the values genuinely differ) — so it would
  // otherwise slip through and clobber the newer edit. Skipping any section with
  // a self-write dispatched at/after `requestedAt` closes that window using only
  // this device's own clock (no cross-device timestamp comparison needed).
  const applyRemoteRow = useCallback((rawRow, requestedAt) => {
    const row = normalizeRow(rawRow);
    if (!row) return;
    // A higher generation than we last saw means a full replacement landed on
    // the server (a co-player's reset/import). Bypass the per-section timestamp
    // gate so every section is reconsidered — the replacement's timestamps may
    // not out-rank a value an in-flight remote UPDATE clobbered onto local a
    // moment earlier, and the reset must still win. Value-equality / self-echo
    // suppression below still keep a no-op echo from churning. (AVE-527)
    const incomingGen = typeof row.generation === 'number' ? row.generation : null;
    const genBumped   = incomingGen != null && incomingGen > lastSeenGen.current;
    const toApply = {};
    let applied = false;
    for (const section of ALL_SECTIONS) {
      const incoming = row[section];
      if (incoming == null) continue;
      if (!genBumped && !sectionChanged(row, section, lastSeenTs.current)) continue;
      // A section still in the pending queue holds a local edit the server has
      // not received yet (queued offline, mid-error backoff, or recovered from a
      // prior tab death). The persisted local value is newer by definition — do
      // not let a fetched/echoed server row revert it; flushQueue will send it
      // and its own echo will reconcile afterward (AVE-522).
      if (pendingQueue.current.has(section)) continue;
      if (requestedAt != null && hasNewerSelfWrite(selfWrites.current.get(section), requestedAt)) continue;
      const local = extractSection(stateRef.current, section);
      if (deepEqual(incoming, local)) { consumeSelfEcho(section, incoming); continue; }
      if (consumeSelfEcho(section, incoming)) continue;
      toApply[section] = incoming;
      applied = true;
    }
    // Advance the baseline *monotonically* — keep max(existing, incoming) per
    // section. A stale row (a slow refetch resolving after a newer event) must
    // not regress `lastSeenTs` to its older timestamps, or the next real event
    // would be gated against a baseline older than what we already applied and
    // could itself be dropped (AVE-526).
    lastSeenTs.current = mergeSeenTimestamps(lastSeenTs.current, snapshotTimestamps(row));
    // Advance the generation baseline monotonically so a later stale row can't
    // regress it and re-trigger a spurious full-replacement pass (AVE-527).
    if (incomingGen != null && incomingGen > lastSeenGen.current) lastSeenGen.current = incomingGen;
    if (applied) onRemoteChange(toApply);
  }, [onRemoteChange, consumeSelfEcho]);

  /**
   * Re-fetch the campaign row and push it through the same gated pipeline as a
   * Realtime event (AVE-372).
   *
   * Resubscribing after a dropped socket only delivers *future* events, never
   * the UPDATEs missed while disconnected — so after a phone lock, reconnect, or
   * a cold boot with a campaign already active, local state can sit stale
   * indefinitely (until the other player happens to edit again). This closes
   * that gap by actively reading the current server state and merging it in.
   *
   * On a cold boot it also seeds `lastSeenTs` (otherwise only join/create seed
   * it), so the first subsequent Realtime UPDATE has a proper timestamp baseline
   * to gate against instead of applying blind.
   *
   * Captures `requestedAt` before dispatching the SELECT so applyRemoteRow can
   * discard any section we've since written a newer value for (AVE-518
   * follow-up) — this request can resolve well after that on a slow connection.
   */
  const refetchRow = useCallback(async () => {
    const id = campaignIdRef.current;
    if (!client || !id) return;
    const requestedAt = Date.now();
    const { data, error } = await client
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return;
    applyRemoteRow(data, requestedAt);
  }, [client, applyRemoteRow]);

  // Keep the ref pointed at the current refetchRow, so the write callbacks can
  // call it without taking it as a dependency (see refetchRowRef above). In an
  // effect rather than during render, mirroring campaignIdRef — a ref written
  // during render is a lint error and can miss an update.
  useEffect(() => { refetchRowRef.current = refetchRow; }, [refetchRow]);

  // ── Core subscribe / unsubscribe ─────────────────────────────────────────

  const subscribe = useCallback((id) => {
    if (!client || !id) return;

    // Clean up any existing channel first
    if (channelRef.current) {
      client.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Build and register the channel BEFORE subscribing. The status callback's
    // ownership check compares against `channelRef.current`, so publishing the
    // ref afterwards left a window in which a status emitted synchronously from
    // `.subscribe()` (an immediate CHANNEL_ERROR) saw the *previous* channel in
    // the ref, failed the check, and returned — swallowing the failure, leaving
    // `channelDown` unset and the badge on green while nothing was arriving.
    const channel = client
      .channel(`campaign:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` },
        (payload) => {
          // Apply the inbound row through the shared gated pipeline: a
          // per-section timestamp gate (ignore sections this UPDATE didn't
          // actually change — stale full-row filler) plus value/self-echo
          // suppression (ignore echoes of our own writes). Both filters are
          // timing-independent, correctly distinguishing "echo" / "stale
          // filler" from "real change" (AVE-314). onRemoteChange fires only
          // when a section was actually applied, so echoes of our own writes
          // don't churn useGameState's undo snapshot or force re-renders
          // (AVE-371).
          applyRemoteRow(payload.new);
        }
      );

    // Publish before subscribing, so the ownership check below can never reject
    // a status for the channel that is actually current.
    channelRef.current = channel;

    channel.subscribe((status) => {
        // Only the channel we currently own may drive status. subscribe()
        // removes the previous channel first, and removeChannel makes THAT
        // channel emit CLOSED — without this check, every foreground and every
        // reconnect would flag a sync error (AVE-938).
        if (channelRef.current !== channel) return;

        if (status === 'SUBSCRIBED') {
          channelDown.current = false;
          setSyncStatus('idle');
          setSyncError(null);
          return;
        }

        // CHANNEL_ERROR | TIMED_OUT | CLOSED — we are not receiving live
        // updates. TIMED_OUT and CLOSED used to fall through both `if`s, which
        // left syncStatus on 'idle' and showed the player a green "Synced"
        // badge while inbound edits had silently stopped arriving. Outbound
        // writes are unaffected (merge_section is plain HTTP), so this is the
        // only signal that anything is wrong.
        channelDown.current = true;
        setSyncError('Live updates disconnected — reconnecting…');
        setSyncStatus('error');
    });
  }, [client, applyRemoteRow]);

  // ── Upsert helpers ────────────────────────────────────────────────────────

  // ── Re-entrancy guard for flushQueue (AVE-528) ──────────────────────────────
  // Prevents overlapping flushQueue invocations from the online handler, the
  // visibility handler, and upsertSection's post-success drain from iterating
  // the same queue snapshot and double-sending + double-noting entries.
  const flushInFlight = useRef(false);

  /** Flush all queued section upserts. Called on reconnect / visibility restore. */
  const flushQueue = useCallback(async () => {
    if (!client || !campaignIdRef.current) return;
    if (pendingQueue.current.size === 0) {
      // Nothing left in the queue to send. An error status with an empty queue
      // (e.g. a queue drained by another path) has nothing to retry, and
      // leaving it set would park the UI on a permanent red "Sync error" —
      // while the retry effect, whose only trigger is a syncStatus change,
      // never re-runs to recover it (AVE-871). Functional update so a
      // concurrent 'offline' transition isn't clobbered.
      //
      // But two failures never produce a queue entry and ARE retryable, so
      // clearing the status for them would hide a real problem behind a green
      // pill: a dead Realtime channel (AVE-938) and a failed full-row
      // replacement (AVE-937). Both are recovered elsewhere — recoverSync
      // resubscribes, and the player retries the replacement from a banner.
      if (!channelDown.current && !replaceFailed.current) {
        setSyncStatus(s => (s === 'error' ? 'idle' : s));
      }
      return;
    }
    if (flushInFlight.current) return;
    flushInFlight.current = true;

    try {
      // Snapshot the queued sections. Each is sent through merge_section
      // individually (rather than a single multi-column update) because the
      // RPC's per-section deep-merge is exactly the concurrent-write safety
      // we want — if the server has fresher state in some keys than we do,
      // those keys are preserved while ours are applied.
      //
      // We do not clear the queue up front: if a write fails the data stays
      // queued so a later flush can retry it instead of silently dropping
      // the edits.
      const entries = Array.from(pendingQueue.current.entries());
      setSyncStatus('syncing');

      // Send each entry individually, noting the self-write immediately
      // before its RPC is dispatched (not for the whole batch up front).
      // On error the remaining entries stay queued and will be retried on
      // the next flush — but they were never noted, so the retry won't
      // double-note them (AVE-528).
      for (const [sectionName, payload] of entries) {
        noteSelfWrite(sectionName, payload);
        const { data, error } = await client.rpc('merge_section', {
          campaign_id:         campaignIdRef.current,
          section_name:        sectionName,
          payload:             payload,
          expected_generation: lastSeenGen.current,
        });
        if (isGenerationRejected(data, error)) {
          // The row moved to a newer generation (a co-player's reset/import, or
          // our own boot before the generation baseline was seeded), so nothing
          // committed and no echo will arrive — drop the note for the same
          // reason the error branch below does (AVE-528 follow-up).
          //
          // This entry and the rest of the batch stay queued: entries are only
          // deleted after the whole batch succeeds. Re-seed the generation and
          // let the backoff ladder retry with the correct one (AVE-376).
          unnoteSelfWrite(sectionName, payload);
          setSyncError('Campaign was reset or replaced — re-syncing.');
          setSyncStatus('error');
          bumpRetryTick();
          refetchRowRef.current?.();
          return;
        }
        if (error) {
          // This write did not commit — drop the note we optimistically took so
          // the retry (which notes again) doesn't leave a duplicate that eats a
          // later genuine remote change (AVE-528 follow-up). The entry stays
          // queued for retry.
          unnoteSelfWrite(sectionName, payload);
          setSyncError(error.message);
          setSyncStatus('error');
          bumpRetryTick(); // re-arm the backoff even if the status didn't change
          return;
        }
      }

      // All succeeded — remove flushed entries from the queue, but only where
      // the queued payload is still the exact one we sent. `entries` is a
      // snapshot taken before the first await; a section can pick up a NEWER
      // payload while the batch is in flight (going offline mid-flush routes
      // upsertSection straight to the queue, and a generation rejection
      // re-queues). Deleting by key alone threw that newer edit away without
      // ever sending it — and because applyRemoteRow skips sections still in
      // the queue, dropping the entry also removed the guard that was keeping
      // the next refetch from reverting the edit. extractSection builds a fresh
      // object per call, so identity is an exact "unchanged since we sent it"
      // test; a false negative merely costs one redundant write next flush.
      for (const [section, payload] of entries) {
        if (pendingQueue.current.get(section) === payload) pendingQueue.current.delete(section);
      }
      persistQueue(); // keep the persisted copy in step with the drained queue (AVE-522)
      setSyncStatus('idle');
      setSyncError(null);
    } finally {
      flushInFlight.current = false;
    }
  }, [client, noteSelfWrite, unnoteSelfWrite, persistQueue, bumpRetryTick]);

  /**
   * One recovery step for the backoff ladder (AVE-938).
   *
   * The ladder used to call `flushQueue` directly, which retries queued writes
   * and nothing else — useless for a dead socket, and resubscription otherwise
   * only ever happens on `online`, foreground, or a campaign change. A channel
   * that dies while the tab stays foregrounded (phone propped up on the table,
   * a wifi blip that produces no browser `offline` event) had nothing that
   * would notice.
   *
   * Resubscribing alone only delivers *future* events, so the refetch is what
   * pulls in whatever was missed while disconnected (AVE-372). The resubscribe
   * is conditional on `channelDown` so the pure write-retry case behaves
   * exactly as it did before.
   */
  const recoverSync = useCallback(() => {
    const id = campaignIdRef.current;
    if (!client || !id) return;
    if (channelDown.current) {
      subscribe(id);
      refetchRow();
    }
    flushQueue();
  }, [client, subscribe, refetchRow, flushQueue]);

  // ── Online / offline detection ────────────────────────────────────────────

  useEffect(() => {
    function handleOnline() {
      isOnline.current = true;
      const id = campaignIdRef.current;
      if (id) {
        subscribe(id);   // resubscribe in case the socket dropped while offline
        refetchRow();    // pull UPDATEs missed while offline (resubscribe only gets future events) — AVE-372
        flushQueue();
      }
    }
    function handleOffline() {
      isOnline.current = false;
      setSyncStatus('offline');
    }
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [subscribe, refetchRow, flushQueue]);

  // ── Visibility-based resubscription ──────────────────────────────────────
  // Mobile browsers silently drop WebSocket connections when a tab is
  // backgrounded. When the page becomes visible again we tear down the
  // existing channel and resubscribe to ensure we're receiving updates.

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const id = campaignIdRef.current;
        if (id && client) {
          subscribe(id);
          // Pull any UPDATEs missed while the tab was backgrounded — the mobile
          // browser silently drops the socket, and resubscribing only receives
          // future events, not the ones missed while disconnected (AVE-372).
          refetchRow();
          // Also flush any queued upserts that accumulated while hidden
          flushQueue();
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [client, subscribe, refetchRow, flushQueue]);

  // ── Backoff retry timer for error recovery (AVE-376) ──────────────────────
  // When syncStatus is 'error', schedule flushQueue with exponential backoff.
  // Resets when status leaves 'error' or campaignId changes.
  useEffect(() => {
    if (syncStatus !== 'error' || !client || !campaignIdRef.current) {
      // Only a *successful* sync clears the backoff. Resetting on any
      // non-error status pinned the delay at 1s forever (AVE-871): every retry
      // passes through 'syncing' on its way back to 'error' — flushQueue sets
      // it before awaiting the RPC — and that transient re-ran this effect and
      // zeroed the counter. 'offline' also preserves the ladder, so a flapping
      // connection doesn't restart at 1s each time.
      if (syncStatus === 'idle') retryCountRef.current = 0;
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
    retryCountRef.current += 1;
    const timer = setTimeout(() => recoverSync(), delay);
    return () => clearTimeout(timer);
  }, [syncStatus, retryTick, client, recoverSync]);

  // ── Subscribe / unsubscribe when campaignId changes ───────────────────────

  useEffect(() => {
    if (campaignId) {
      subscribe(campaignId);
      // Boot / campaign-change fetch (AVE-372): local state came purely from
      // localStorage, which may be stale if another player edited while this
      // app was closed. Pull the current row and merge it in through the gated
      // pipeline. This also seeds `lastSeenTs` on a cold boot (only join/create
      // seed it otherwise), giving the first Realtime UPDATE a real baseline.
      // On a join the row was just fetched and applied, so this re-fetch merges
      // nothing new — harmless and gated.
      refetchRow();
    } else if (channelRef.current) {
      client?.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    return () => {
      if (channelRef.current) {
        client?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [campaignId, client, subscribe, refetchRow]);

  // ── Boot / campaign-change queue drain (AVE-522) ──────────────────────────
  // Replay any persisted pending writes as soon as a campaign is active —
  // edits queued before a prior tab death reach the server on the next boot.
  // Kept in its own effect (not folded into the subscribe effect above) so it
  // depends only on the stable `flushQueue`, not on `subscribe`/`refetchRow`
  // (whose identity tracks the caller's onRemoteChange). Draining before the
  // boot refetchRow resolves keeps those sections in pendingQueue, so the
  // applyRemoteRow guard skips them instead of reverting the recovered edit.
  useEffect(() => {
    if (campaignId && client) flushQueue();
  }, [campaignId, client, flushQueue]);

  /**
   * Upsert a single section to Supabase.
   * If offline, queues it for later.
   */
  const upsertSection = useCallback(async (sectionName, currentState) => {
    if (!client || !campaignId) return;

    let sectionData;
    try {
      sectionData = extractSection(currentState, sectionName);
    } catch (err) {
      // extractSection throws on unknown section names. Surface as a sync
      // error so the user sees a clear message instead of an unhandled
      // exception in the debounce timer.
      setSyncError(err.message);
      setSyncStatus('error');
      return;
    }

    if (!isOnline.current) {
      pendingQueue.current.set(sectionName, sectionData);
      persistQueue(); // survive tab death while offline (AVE-522)
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('syncing');
    // Remember what we sent so the inbound Realtime echo of this write can be
    // recognized and dropped even after local state moves on (AVE-314).
    noteSelfWrite(sectionName, sectionData);
    // Carry the last seen generation so this write no-ops server-side if a
    // reset/import bumped the row's generation in between (AVE-527).
    const { data, error } = await client.rpc('merge_section', {
      campaign_id:         campaignId,
      section_name:        sectionName,
      payload:             sectionData,
      expected_generation: lastSeenGen.current,
    });

    if (isGenerationRejected(data, error)) {
      // Rejected by the generation gate: nothing committed, and no echo will
      // arrive, so drop the note taken before dispatch (AVE-528 follow-up).
      // Re-queue rather than re-send inline — an immediate retry would race the
      // refetchRow below and could re-send the same stale generation.
      //
      // The section is back in pendingQueue, so applyRemoteRow's queue guard
      // leaves the local value alone when the refetch lands; the AVE-376 backoff
      // timer then re-runs flushQueue with the correct generation.
      unnoteSelfWrite(sectionName, sectionData);
      pendingQueue.current.set(sectionName, sectionData);
      persistQueue();
      setSyncError('Campaign was reset or replaced — re-syncing.');
      setSyncStatus('error');
      bumpRetryTick();
      refetchRowRef.current?.();
      return;
    }

    if (error) {
      // The write failed — no echo will arrive, so drop the note we took before
      // dispatching it. The entry is re-queued and flushQueue will note it fresh
      // on retry, keeping one note per *successful* dispatch (AVE-528 follow-up).
      unnoteSelfWrite(sectionName, sectionData);
      setSyncError(error.message);
      setSyncStatus('error');
      bumpRetryTick(); // re-arm the backoff even if the status didn't change
      pendingQueue.current.set(sectionName, sectionData);
      persistQueue(); // survive tab death while the write is failing (AVE-522)
    } else {
      setSyncStatus('idle');
      setSyncError(null);
      // The fresh write supersedes any queued stale payload for this section
      // (AVE-376). Also drain any other queued sections so a failed write
      // doesn't sit in the queue until the next online/visibility transition.
      pendingQueue.current.delete(sectionName);
      persistQueue(); // keep the persisted copy in step with the drained queue (AVE-522)
      flushQueue();
    }
  }, [client, campaignId, noteSelfWrite, unnoteSelfWrite, flushQueue, persistQueue, bumpRetryTick]);

  // ── Public actions ────────────────────────────────────────────────────────

  /**
   * Create a new campaign in Supabase and store the ID locally.
   * Returns { id, error }.
   */
  const createCampaign = useCallback(async () => {
    if (!client) return { id: null, error: 'Supabase not configured' };

    for (let attempt = 0; attempt < 5; attempt++) {
      const id  = generateCampaignId();
      const row = buildFullRow(id, stateRef.current);

      const { error } = await client.from('campaigns').insert(row);
      if (!error) {
        // Seed the timestamp baseline from the row we just wrote so the first
        // inbound UPDATE can gate correctly (AVE-314). A freshly inserted row
        // starts at generation 0 (column default) — seed the counter to match
        // so our own writes carry the right expected_generation (AVE-527).
        lastSeenTs.current  = snapshotTimestamps(row);
        lastSeenGen.current = 0;
        localStorage.setItem(CAMPAIGN_ID_KEY, id);
        setCampaignId(id);
        return { id, error: null };
      }
      if (error.code !== '23505') {
        return { id: null, error: error.message };
      }
    }
    return { id: null, error: 'Could not generate a unique campaign ID. Try again.' };
  }, [client]);

  /**
   * Join an existing campaign by code.
   * Fetches the remote row and merges shared sections into local state.
   * activeGuardIdx is explicitly preserved from local state — each player
   * independently controls which guard tab they are viewing.
   * Returns { state, error }.
   */
  const joinCampaign = useCallback(async (code) => {
    if (!client) return { state: null, error: 'Supabase not configured' };
    // Offline is not a wrong code. Checked before the request so the player is
    // never told to re-read a code that was correct (AVE-942).
    if (!isOnline.current) {
      return { state: null, error: "You're offline — connect to the internet and try again." };
    }

    // Codes get read aloud across a table, so the entered text routinely
    // differs from the stored id by punctuation alone (missing hyphen,
    // en-dash, stray spaces). Normalize to the canonical shape before the
    // exact-match lookup — and store that normalized id, never the raw
    // input (AVE-786).
    const id = normalizeCampaignCode(code);
    const notFound = `No campaign found with code ${id}. Check the code and try again.`;
    const { data, error } = await client
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // PostgREST returns PGRST116 ("JSON object requested, multiple (or no)
      // rows returned") for .single() against a missing row. That, and only
      // that, is a genuinely wrong code. Everything else — a network failure, a
      // captive portal, RLS, a database missing a migration (AVE-870) — used to
      // report "Campaign not found. Check the code and try again.", sending the
      // group off to re-read a correct code and eventually to Create a new
      // campaign, abandoning the one they were actually in (AVE-942).
      if (error.code === 'PGRST116') return { state: null, error: notFound };
      return {
        state: null,
        error: `Couldn't reach the campaign server (${error.message}). Check your connection and try again.`,
      };
    }
    if (!data) return { state: null, error: notFound };

    // Drop any queued writes from a previous campaign so they can't replay into
    // the one we're joining (AVE-522). Joining adopts the remote row wholesale.
    pendingQueue.current.clear();
    persistQueue();
    // A replacement that failed against the campaign we're leaving must not
    // park the one we're joining on red (AVE-937).
    replaceFailed.current = false;

    // Apply each synced section from the remote row (normalizing any pre-AVE-83
    // single-`guards`-blob row to per-guard columns first). No section includes
    // activeGuardIdx, so it is never touched — the joining player keeps their
    // own guard view.
    const row = normalizeRow(data);
    const sections = {};
    for (const section of ALL_SECTIONS) {
      if (row[section] != null) sections[section] = row[section];
    }

    // Seed the timestamp baseline from the fetched row so subsequent Realtime
    // UPDATEs can tell which sections genuinely changed (AVE-314), and the
    // generation baseline so our writes carry the right expected_generation and
    // a later reset is recognized as a bump (AVE-527).
    lastSeenTs.current  = snapshotTimestamps(data);
    lastSeenGen.current = typeof data.generation === 'number' ? data.generation : 0;

    localStorage.setItem(CAMPAIGN_ID_KEY, id);
    setCampaignId(id);
    // Push the joined campaign state into local React state immediately.
    // Without this, the joining player keeps seeing their old local state
    // until the host's next Realtime UPDATE happens to trigger a re-render.
    onRemoteChange(sections);
    return { state: null, error: null };
  }, [client, onRemoteChange, persistQueue]);

  /**
   * Leave the current campaign.
   * Clears the local campaign ID and unsubscribes from Realtime.
   * Does NOT delete the campaign from Supabase.
   */
  const leaveCampaign = useCallback(() => {
    localStorage.removeItem(CAMPAIGN_ID_KEY);
    setCampaignId(null);
    pendingQueue.current.clear();
    persistQueue(); // drop the persisted queue so it can't replay into another campaign (AVE-522)
    // Neither retryable failure outlives the campaign it belongs to, or the
    // status we set below would be re-flagged by the next flush.
    channelDown.current   = false;  // AVE-938
    replaceFailed.current = false;  // AVE-937
    setSyncStatus('idle');
    setSyncError(null);
  }, [persistQueue]);

  /**
   * Replace EVERY section of the campaign row with the values from `state`.
   * Unlike `upsertSection` (which deep-merges through `merge_section`), this
   * does a raw `UPDATE` — the full row is overwritten with all sections and
   * bumped timestamps. Intended for import/reset where the intent is explicit
   * full replacement.
   *
   * Bumps the `generation` column (AVE-527): every in-flight `merge_section`
   * write from a co-player carries the generation it last saw as
   * `expected_generation`, so once this replacement lands those stale writes
   * no-op server-side instead of deep-merging the pre-reset campaign back in.
   * The generation is read first, then written as read+1 — `generation` only
   * ever changes here (merge_section never touches it), so this read can be
   * stale only relative to another concurrent replaceRow, an
   * astronomically-rare reset-vs-reset race whose outcome (one reset wins, the
   * row is fully reset either way) is acceptable.
   *
   * Seeds `lastSeenTs` on success but deliberately does NOT seed `lastSeenGen`:
   * the inbound Realtime echo carries the bumped generation, and letting it
   * register as a generation bump lets applyRemoteRow re-apply the replacement
   * over any stale value an in-flight remote UPDATE clobbered onto local in the
   * meantime (the secondary same-device divergence window in AVE-527). In the
   * normal case every section deep-equals local, so the echo is a value-equal
   * no-op. No-op when no campaign is active.
   *
   * Returns { error: null | string }.
   */
  const replaceRow = useCallback(async (state) => {
    const id = campaignIdRef.current;
    if (!client || !id) return { error: null };

    setSyncStatus('syncing');
    replaceFailed.current = false;

    // Every queued section payload predates this replacement and is therefore
    // dead data: import/reset/demo-load rebuilt the whole of local state, so
    // nothing in the queue is still reachable from it. Left in place, the next
    // flush sends those payloads through `merge_section`, which deep-merges the
    // pre-replacement ledger back into the freshly replaced row — rebuilding
    // exactly the AVE-374 chimera a full replacement exists to prevent, and
    // `applyRemoteRow`'s pending-queue guard then suppresses the correcting row
    // so local never notices. The generation gate (AVE-527) only delays this: a
    // rejected write is re-queued, the refetch adopts the new generation, and
    // the retry commits the stale payload. joinCampaign and leaveCampaign
    // already clear the queue for the same reason.
    pendingQueue.current.clear();
    persistQueue();

    // Read the current generation so the replacement can bump it.
    const { data: cur, error: readErr } = await client
      .from('campaigns')
      .select('generation')
      .eq('id', id)
      .single();
    if (readErr) {
      // Nothing was written and nothing is queued (a replacement deliberately
      // does NOT go through pendingQueue — those entries deep-merge, which is
      // exactly the chimera a full replacement exists to avoid). Flag it so
      // flushQueue's empty-queue branch doesn't clear the error a second later
      // and leave the row silently diverged behind a green pill (AVE-937).
      replaceFailed.current = true;
      setSyncError(readErr.message);
      setSyncStatus('error');
      return { error: readErr.message };
    }
    const nextGen = (typeof cur?.generation === 'number' ? cur.generation : 0) + 1;

    const row = { ...buildFullRow(id, state), generation: nextGen };

    const { error } = await client.from('campaigns').update(row).eq('id', id);
    if (error) {
      replaceFailed.current = true;   // see the readErr branch above (AVE-937)
      setSyncError(error.message);
      setSyncStatus('error');
      return { error: error.message };
    }

    // Update timestamp baseline so unrelated future events gate correctly. Do
    // NOT seed lastSeenGen — see the doc comment above (AVE-527).
    lastSeenTs.current = { ...lastSeenTs.current, ...snapshotTimestamps(row) };
    setSyncStatus('idle');
    setSyncError(null);
    return { error: null };
  }, [client, persistQueue]);

  return {
    campaignId,
    syncStatus,   // 'idle' | 'syncing' | 'error' | 'offline'
    syncError,
    upsertSection,
    enqueuePendingSections, // synchronously persist in-debounce edits on tab-hide (AVE-522)
    createCampaign,
    joinCampaign,
    leaveCampaign,
    replaceRow,
    isConfigured: !!client,
  };
}
