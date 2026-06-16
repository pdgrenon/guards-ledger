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
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Client is null when env vars are missing (solo/portfolio mode — sync is disabled).
const supabase = supabaseUrl && supabaseKey
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
 */
export function extractSection(state, sectionName) {
  if (isGuardColumn(sectionName)) {
    return state.guards[guardIndexFromColumn(sectionName)];
  }
  const keys = SECTION_KEYS[sectionName];
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object}   state          Current full game state (from useGameState)
 * @param {function} onRemoteChange Called with new full state when a remote update arrives
 */
export function useSupabaseSync(state, onRemoteChange) {
  const [campaignId,  setCampaignId]  = useState(() => localStorage.getItem(CAMPAIGN_ID_KEY));
  const [syncStatus,  setSyncStatus]  = useState('idle'); // 'idle' | 'syncing' | 'error' | 'offline'
  const [syncError,   setSyncError]   = useState(null);

  // Pending upserts queued while offline: Map<sectionName, sectionData>
  // Using a Map means newer data for the same section overwrites older.
  const pendingQueue  = useRef(new Map());
  const isOnline      = useRef(navigator.onLine);
  const channelRef    = useRef(null);
  // Per-section timestamp of our last write, so a Realtime echo of our own
  // upsert is ignored for that section only. Editing guard_0 must NOT cause us
  // to drop a concurrent guard_1 update from another player.
  const lastUpsertAt  = useRef(new Map());
  // Keep a ref to the latest state and campaignId so async callbacks
  // always see current values without stale closure issues.
  const stateRef      = useRef(state);
  const campaignIdRef = useRef(campaignId);
  useEffect(() => { stateRef.current      = state;      }, [state]);
  useEffect(() => { campaignIdRef.current = campaignId; }, [campaignId]);

  // ── Core subscribe / unsubscribe ─────────────────────────────────────────

  const subscribe = useCallback((id) => {
    if (!supabase || !id) return;

    // Clean up any existing channel first
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`campaign:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` },
        (payload) => {
            const row = normalizeRow(payload.new);
            if (!row) return;
            // Apply each remote section on top of current local state, skipping
            // any section we ourselves wrote within the last 3s (its echo).
            // Suppression is per-section so a concurrent edit to a different
            // guard/section is still applied. Keys outside any section
            // (log, settings, activeGuardIdx) are never present and never touched.
            const now = Date.now();
            let merged = stateRef.current;
            for (const section of ALL_SECTIONS) {
              if (now - (lastUpsertAt.current.get(section) ?? 0) < 3000) continue;
              merged = applyRemoteSection(merged, section, row[section]);
            }
            onRemoteChange(merged);
          }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')    setSyncStatus('idle');
        if (status === 'CHANNEL_ERROR') setSyncStatus('error');
      });

    channelRef.current = channel;
  }, [onRemoteChange]);

  // ── Upsert helpers ────────────────────────────────────────────────────────

  /** Flush all queued section upserts. Called on reconnect / visibility restore. */
  const flushQueue = useCallback(async () => {
    if (!supabase || !campaignIdRef.current || pendingQueue.current.size === 0) return;

    // Snapshot the queued sections, then write them in a single update. We do
    // not clear the queue up front: if the write fails the data stays queued
    // so a later flush can retry it instead of silently dropping the edits.
    const entries = Array.from(pendingQueue.current.entries());
    const update  = {};
    const now     = new Date().toISOString();
    for (const [section, data] of entries) {
      update[section]                 = data;
      update[`${section}_updated_at`] = now;
    }

    // Mark each section's own write so its Realtime echo is ignored (see subscribe).
    const flushedAt = Date.now();
    for (const [section] of entries) lastUpsertAt.current.set(section, flushedAt);
    setSyncStatus('syncing');
    const { error } = await supabase
      .from('campaigns')
      .update(update)
      .eq('id', campaignIdRef.current);

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
  }, []);

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
        if (id && supabase) {
          subscribe(id);
          // Also flush any queued upserts that accumulated while hidden
          flushQueue();
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [subscribe, flushQueue]);

  // ── Subscribe / unsubscribe when campaignId changes ───────────────────────

  useEffect(() => {
    if (campaignId) {
      subscribe(campaignId);
    } else if (channelRef.current) {
      supabase?.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    return () => {
      if (channelRef.current) {
        supabase?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [campaignId, subscribe]);

  /**
   * Upsert a single section to Supabase.
   * If offline, queues it for later.
   */
  const upsertSection = useCallback(async (sectionName, currentState) => {
    if (!supabase || !campaignId) return;

    const sectionData = extractSection(currentState, sectionName);

    if (!isOnline.current) {
      pendingQueue.current.set(sectionName, sectionData);
      setSyncStatus('offline');
      return;
    }

    lastUpsertAt.current.set(sectionName, Date.now());
    setSyncStatus('syncing');
    const { error } = await supabase
      .from('campaigns')
      .update({
        [sectionName]:                 sectionData,
        [`${sectionName}_updated_at`]: new Date().toISOString(),
      })
      .eq('id', campaignId);

    if (error) {
      setSyncError(error.message);
      setSyncStatus('error');
      pendingQueue.current.set(sectionName, sectionData);
    } else {
      setSyncStatus('idle');
      setSyncError(null);
    }
  }, [campaignId]);

  // ── Public actions ────────────────────────────────────────────────────────

  /**
   * Create a new campaign in Supabase and store the ID locally.
   * Returns { id, error }.
   */
  const createCampaign = useCallback(async () => {
    if (!supabase) return { id: null, error: 'Supabase not configured' };

    for (let attempt = 0; attempt < 5; attempt++) {
      const id  = generateCampaignId();
      const row = buildFullRow(id, stateRef.current);

      const { error } = await supabase.from('campaigns').insert(row);
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
  }, []);

  /**
   * Join an existing campaign by code.
   * Fetches the remote row and merges shared sections into local state.
   * activeGuardIdx is explicitly preserved from local state — each player
   * independently controls which guard tab they are viewing.
   * Returns { state, error }.
   */
  const joinCampaign = useCallback(async (code) => {
    if (!supabase) return { state: null, error: 'Supabase not configured' };

    const id = code.trim().toUpperCase();
    const { data, error } = await supabase
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
  }, [onRemoteChange]);

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
    isConfigured: !!supabase,
  };
}
