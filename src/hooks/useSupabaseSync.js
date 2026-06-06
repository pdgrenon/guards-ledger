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
 *   resources  ← { sil, lux }
 *   cities     ← { cities }
 *   guards     ← { guards, activeParty }
 *   stash      ← { stash, stonebound }
 *   campaign   ← { campaign }
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

// Maps section name → state keys written to / read from that Supabase column.
// activeGuardIdx is deliberately absent: it is local-only UI navigation state.
const SECTION_KEYS = {
  resources: ['sil', 'lux'],
  cities:    ['cities'],
  guards:    ['guards', 'activeParty'],
  stash:     ['stash', 'stonebound'],
  campaign:  ['campaign'],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random short campaign code like 'WOLF42'. */
function generateCampaignId() {
  const words  = ['WOLF','BEAR','HAWK','IRON','GOLD','SNOW','DARK','FIRE','VALE','DUSK'];
  const word   = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(10 + Math.random() * 90); // 10–99
  return `${word}${digits}`;
}

/** Extract just the keys belonging to a named section from full state. */
function extractSection(state, sectionName) {
  const keys = SECTION_KEYS[sectionName];
  return Object.fromEntries(keys.map(k => [k, state[k]]));
}

/** Build the full Supabase row payload from state (all five sections). */
function buildFullRow(campaignId, state) {
  const now = new Date().toISOString();
  return {
    id:                   campaignId,
    resources:            extractSection(state, 'resources'),
    cities:               extractSection(state, 'cities'),
    guards:               extractSection(state, 'guards'),
    stash:                extractSection(state, 'stash'),
    campaign:             extractSection(state, 'campaign'),
    resources_updated_at: now,
    cities_updated_at:    now,
    guards_updated_at:    now,
    stash_updated_at:     now,
    campaign_updated_at:  now,
  };
}

/**
 * Merge a remote section into local state (spread its keys at the top level).
 * Keys not listed in SECTION_KEYS (e.g. activeGuardIdx) are never touched.
 */
function applyRemoteSection(localState, sectionName, remoteSection) {
  if (!remoteSection) return localState;
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
  const sessionId     = useRef(`${Date.now()}-${Math.random()}`);
  const lastUpsertAt  = useRef(0);
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
            const row = payload.new;
            if (!row) return;
            // Ignore echoes of our own upserts (within a 3s window)
            if (Date.now() - lastUpsertAt.current < 3000) return;
            // Apply each remote section on top of current local state.
            // Keys outside SECTION_KEYS (log, settings, activeGuardIdx) are
            // never present in remoteSection and therefore never overwritten.
            let merged = stateRef.current;
            for (const section of Object.keys(SECTION_KEYS)) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe]);

  // ── Subscribe / unsubscribe when campaignId changes ───────────────────────

  useEffect(() => {
    if (campaignId) {
      subscribe(campaignId);
    } else {
      if (channelRef.current) {
        supabase?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setSyncStatus('idle');
    }
    return () => {
      if (channelRef.current) {
        supabase?.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [campaignId, subscribe]);

  // ── Upsert helpers ────────────────────────────────────────────────────────

  /** Flush all queued section upserts. Called on reconnect / visibility restore. */
  async function flushQueue() {
    if (!supabase || !campaignIdRef.current || pendingQueue.current.size === 0) return;

    const update = { id: campaignIdRef.current };
    const now    = new Date().toISOString();
    for (const [section, data] of pendingQueue.current.entries()) {
      update[section]                 = data;
      update[`${section}_updated_at`] = now;
    }
    pendingQueue.current.clear();

    setSyncStatus(error ? 'error' : 'idle');
    if (error) setSyncError(error.message);
  }

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

    lastUpsertAt.current = Date.now();
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

    // Apply each synced section from the remote row.
    // SECTION_KEYS no longer includes activeGuardIdx, so it is never touched
    // here — the joining player keeps their own guard view.
    let merged = stateRef.current;
    for (const section of Object.keys(SECTION_KEYS)) {
      merged = applyRemoteSection(merged, section, data[section]);
    }

    localStorage.setItem(CAMPAIGN_ID_KEY, id);
    setCampaignId(id);
    return { state: merged, error: null };
  }, []);

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
