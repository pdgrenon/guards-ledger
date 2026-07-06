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
import { normalizeCompletedEncounters } from './gameReducers';

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Client is null when env vars are missing (solo/portfolio mode — sync is disabled).
const defaultSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_ID_KEY = 'guards_ledger_campaign_id';

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
 */
export function applyRemoteSection(localState, sectionName, remoteSection) {
  if (remoteSection == null) return localState;
  if (isGuardColumn(sectionName)) {
    const idx    = guardIndexFromColumn(sectionName);
    const guards = localState.guards.map((g, i) => i === idx ? remoteSection : g);
    return { ...localState, guards };
  }
  return { ...localState, ...remoteSection };
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

/** Per-section timestamp column name (matches the schema: `<section>_updated_at`). */
export function sectionTsColumn(section) { return `${section}_updated_at`; }

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
 * behavior). Returns false only when the timestamp is unchanged from what we
 * last saw — the section is just riding along and must be left alone.
 */
export function sectionChanged(row, section, lastSeen) {
  const ts   = row[sectionTsColumn(section)];
  const prev = lastSeen[section];
  if (ts == null || prev == null) return true; // no baseline → don't gate
  return ts !== prev;
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

// ─── Runtime helpers ──────────────────────────────────────────────────────────

/**
 * Send queued section writes through the merge_section RPC. Calls happen
 * sequentially so a failure on one section doesn't roll back others. The
 * first error (if any) is returned and short-circuits the remaining calls;
 * unprocessed sections stay in the queue for the next flush.
 */
async function mergeSections(client, campaignId, entries) {
  for (const [sectionName, payload] of entries) {
    const { error } = await client.rpc('merge_section', {
      campaign_id:  campaignId,
      section_name: sectionName,
      payload:      payload,
    });
    if (error) return { error };
  }
  return { error: null };
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
  const pendingQueue  = useRef(new Map());
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

  // ── Per-section timestamp baseline (AVE-314) ──────────────────────────────
  // The last `<section>_updated_at` value we've seen per section. An inbound
  // UPDATE carries the whole row, but only the section it actually changed has
  // a bumped timestamp — every other section is stale filler that must not be
  // applied over a local in-flight edit. Seeded on join/create; advanced on
  // each processed Realtime row. Map<sectionName, isoTimestamp>.
  const lastSeenTs = useRef({});

  const noteSelfWrite = useCallback((section, value) => {
    const now  = Date.now();
    const list = (selfWrites.current.get(section) || []).filter(e => now - e.at < SELF_WRITE_TTL_MS);
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

  // ── Apply a remote row through the gated pipeline (AVE-314 / AVE-372) ──────
  // Shared by the Realtime UPDATE handler and refetchRow. Takes a raw Supabase
  // row (Realtime's payload.new, or the result of a fresh SELECT), normalizes
  // it, then applies each section on top of current local state subject to the
  // same two timing-independent guards used everywhere:
  //   1. per-section timestamp gate (skip sections this row didn't change), and
  //   2. value/self-echo suppression (skip echoes of our own writes).
  // Advances the per-section timestamp baseline to the row afterwards, and calls
  // onRemoteChange only when at least one section was actually applied. Reusing
  // this for the refetch (AVE-372) means a re-fetched row can never clobber an
  // in-flight local edit — the AVE-314 protections apply identically.
  const applyRemoteRow = useCallback((rawRow) => {
    const row = normalizeRow(rawRow);
    if (!row) return;
    const toApply = {};
    let applied = false;
    for (const section of ALL_SECTIONS) {
      const incoming = row[section];
      if (incoming == null) continue;
      if (!sectionChanged(row, section, lastSeenTs.current)) continue;
      const local = extractSection(stateRef.current, section);
      if (deepEqual(incoming, local)) { consumeSelfEcho(section, incoming); continue; }
      if (consumeSelfEcho(section, incoming)) continue;
      toApply[section] = incoming;
      applied = true;
    }
    lastSeenTs.current = { ...lastSeenTs.current, ...snapshotTimestamps(row) };
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
   */
  const refetchRow = useCallback(async () => {
    const id = campaignIdRef.current;
    if (!client || !id) return;
    const { data, error } = await client
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return;
    applyRemoteRow(data);
  }, [client, applyRemoteRow]);

  // ── Core subscribe / unsubscribe ─────────────────────────────────────────

  const subscribe = useCallback((id) => {
    if (!client || !id) return;

    // Clean up any existing channel first
    if (channelRef.current) {
      client.removeChannel(channelRef.current);
      channelRef.current = null;
    }

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
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')    setSyncStatus('idle');
        if (status === 'CHANNEL_ERROR') setSyncStatus('error');
      });

    channelRef.current = channel;
  }, [client, applyRemoteRow]);

  // ── Upsert helpers ────────────────────────────────────────────────────────

  /** Flush all queued section upserts. Called on reconnect / visibility restore. */
  const flushQueue = useCallback(async () => {
    if (!client || !campaignIdRef.current || pendingQueue.current.size === 0) return;

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
    // Record each queued write so its Realtime echo is recognized on flush
    // (AVE-314), same as the online upsertSection path.
    for (const [section, payload] of entries) noteSelfWrite(section, payload);
    const { error } = await mergeSections(client, campaignIdRef.current, entries);

    if (error) {
      // Leave the sections queued so the next flush retries them.
      setSyncError(error.message);
      setSyncStatus('error');
    } else {
      // Remove only the sections we successfully flushed; anything queued
      // since (e.g. a new offline edit) is preserved.
      for (const [section] of entries) pendingQueue.current.delete(section);
      setSyncStatus('idle');
      setSyncError(null);
    }
  }, [client, noteSelfWrite]);

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
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('syncing');
    // Remember what we sent so the inbound Realtime echo of this write can be
    // recognized and dropped even after local state moves on (AVE-314).
    noteSelfWrite(sectionName, sectionData);
    const { error } = await client.rpc('merge_section', {
      campaign_id:  campaignId,
      section_name: sectionName,
      payload:      sectionData,
    });

    if (error) {
      setSyncError(error.message);
      setSyncStatus('error');
      pendingQueue.current.set(sectionName, sectionData);
    } else {
      setSyncStatus('idle');
      setSyncError(null);
    }
  }, [client, campaignId, noteSelfWrite]);

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
        // inbound UPDATE can gate correctly (AVE-314).
        lastSeenTs.current = snapshotTimestamps(row);
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

    const id = code.trim().toUpperCase();
    const { data, error } = await client
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return { state: null, error: 'Campaign not found. Check the code and try again.' };
    }

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
    // UPDATEs can tell which sections genuinely changed (AVE-314).
    lastSeenTs.current = snapshotTimestamps(data);

    localStorage.setItem(CAMPAIGN_ID_KEY, id);
    setCampaignId(id);
    // Push the joined campaign state into local React state immediately.
    // Without this, the joining player keeps seeing their old local state
    // until the host's next Realtime UPDATE happens to trigger a re-render.
    onRemoteChange(sections);
    return { state: null, error: null };
  }, [client, onRemoteChange]);

  /**
   * Leave the current campaign.
   * Clears the local campaign ID and unsubscribes from Realtime.
   * Does NOT delete the campaign from Supabase.
   */
  const leaveCampaign = useCallback(() => {
    localStorage.removeItem(CAMPAIGN_ID_KEY);
    setCampaignId(null);
    pendingQueue.current.clear();
    setSyncStatus('idle');
    setSyncError(null);
  }, []);

  return {
    campaignId,
    syncStatus,   // 'idle' | 'syncing' | 'error' | 'offline'
    syncError,
    upsertSection,
    createCampaign,
    joinCampaign,
    leaveCampaign,
    isConfigured: !!client,
  };
}
