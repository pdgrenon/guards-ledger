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

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Client is null when env vars are missing (solo/portfolio mode — sync is disabled).
const defaultSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ─── Constants ────────────────────────────────────────────────────────────────

const CAMPAIGN_ID_KEY = 'guards_ledger_campaign_id';

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

/** Generate a random short campaign code like 'WOLF42'. */
function generateCampaignId() {
  const words  = ['WOLF','BEAR','HAWK','IRON','GOLD','SNOW','DARK','FIRE','VALE','DUSK'];
  const word   = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(10 + Math.random() * 90); // 10–99
  return `${word}${digits}`;
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
 */
export function normalizeRow(row) {
  if (!row || row.guards === undefined || row.guard_0 !== undefined) return row;
  const out  = { ...row };
  const blob = row.guards || {};
  const arr  = Array.isArray(blob.guards) ? blob.guards : [];
  for (let i = 0; i < GUARD_COUNT; i++) {
    if (arr[i] !== undefined) out[guardColumn(i)] = arr[i];
  }
  if (out.party === undefined && blob.activeParty) {
    out.party = { activeParty: blob.activeParty };
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
            const row = normalizeRow(payload.new);
            if (!row) return;
            // Apply each remote section on top of current local state, but
            // skip sections whose incoming value already matches the local
            // value — those are echoes of our own writes (or of concurrent
            // writes that happened to converge). The earlier 3-second
            // wall-clock window was the wrong tool: a legitimate remote
            // change to a section we just wrote would be silently dropped
            // (the symptom in AVE-82). Value-equality is timing-independent
            // and correctly distinguishes "echo" from "real change."
            let merged = stateRef.current;
            for (const section of ALL_SECTIONS) {
              const incoming = row[section];
              if (incoming == null) continue;
              const local = extractSection(stateRef.current, section);
              if (deepEqual(incoming, local)) continue;
              merged = applyRemoteSection(merged, section, incoming);
            }
            onRemoteChange(merged);
          }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')    setSyncStatus('idle');
        if (status === 'CHANNEL_ERROR') setSyncStatus('error');
      });

    channelRef.current = channel;
  }, [client, onRemoteChange]);

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
  }, [client]);

  // ── Online / offline detection ────────────────────────────────────────────

  useEffect(() => {
    function handleOnline() {
      isOnline.current = true;
      const id = campaignIdRef.current;
      if (id) {
        subscribe(id);   // resubscribe in case the socket dropped while offline
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
  }, [subscribe, flushQueue]);

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
          // Also flush any queued upserts that accumulated while hidden
          flushQueue();
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [client, subscribe, flushQueue]);

  // ── Subscribe / unsubscribe when campaignId changes ───────────────────────

  useEffect(() => {
    if (campaignId) {
      subscribe(campaignId);
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
  }, [campaignId, client, subscribe]);

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
  }, [client, campaignId]);

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
    let merged = stateRef.current;
    for (const section of ALL_SECTIONS) {
      merged = applyRemoteSection(merged, section, row[section]);
    }

    localStorage.setItem(CAMPAIGN_ID_KEY, id);
    setCampaignId(id);
    // Push the joined campaign state into local React state immediately.
    // Without this, the joining player keeps seeing their old local state
    // until the host's next Realtime UPDATE happens to trigger a re-render.
    onRemoteChange(merged);
    return { state: merged, error: null };
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
