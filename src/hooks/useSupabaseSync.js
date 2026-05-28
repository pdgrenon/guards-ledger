/**
 * useSupabaseSync.js
 *
 * Manages all Supabase sync for the Guards Ledger.
 *
 * Responsibilities:
 *   - Creating and joining campaigns (short alphanumeric code)
 *   - Subscribing to Realtime changes on the active campaign
 *   - Upsetting individual sections when local state changes
 *   - Queuing upserts while offline and flushing on reconnect
 *
 * Section mapping (matches Supabase columns):
 *   resources  ← { sil, lux }
 *   cities     ← { cities }
 *   guards     ← { guards, activeParty, activeGuardIdx }
 *   stash      ← { stash, stonebound }
 *   campaign   ← { campaign }
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

// Maps section name → state keys included in that section
const SECTION_KEYS = {
  resources: ['sil', 'lux'],
  cities:    ['cities'],
  guards:    ['guards', 'activeParty', 'activeGuardIdx'],
  stash:     ['stash', 'stonebound'],
  campaign:  ['campaign'],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random short campaign code like 'WOLF42'. */
function generateCampaignId() {
  const words   = ['WOLF','BEAR','HAWK','IRON','GOLD','SNOW','DARK','FIRE','VALE','DUSK'];
  const word    = words[Math.floor(Math.random() * words.length)];
  const digits  = Math.floor(10 + Math.random() * 90); // 10–99
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

/** Merge a remote section into local state (spread its keys at the top level). */
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
  // Using a Map means newer data for the same section overwrites older — we
  // never need to replay stale intermediate states.
  const pendingQueue = useRef(new Map());
  const isOnline     = useRef(navigator.onLine);
  const channelRef   = useRef(null);
  // Keep a ref to latest state so the reconnect handler can flush it
  const stateRef     = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Online / offline detection ────────────────────────────────────────────

  useEffect(() => {
    function handleOnline() {
      isOnline.current = true;
      if (campaignId) flushQueue();
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
  }, [campaignId]);

  // ── Realtime subscription ─────────────────────────────────────────────────

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
          // Apply each remote section on top of current local state.
          // Local-only keys (log, settings) are preserved untouched.
          let merged = stateRef.current;
          for (const section of Object.keys(SECTION_KEYS)) {
            merged = applyRemoteSection(merged, section, row[section]);
          }
          onRemoteChange(merged);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncStatus('idle');
        if (status === 'CHANNEL_ERROR') setSyncStatus('error');
      });

    channelRef.current = channel;
  }, [onRemoteChange]);

  // Subscribe / unsubscribe when campaignId changes
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

  /** Flush all queued section upserts. Called on reconnect. */
  async function flushQueue() {
    if (!supabase || !campaignId || pendingQueue.current.size === 0) return;

    // Build a single merged update from all queued sections
    const update = { id: campaignId };
    const now    = new Date().toISOString();
    for (const [section, data] of pendingQueue.current.entries()) {
      update[section]                        = data;
      update[`${section}_updated_at`]        = now;
    }
    pendingQueue.current.clear();

    setSyncStatus('syncing');
    const { error } = await supabase
      .from('campaigns')
      .update(update)
      .eq('id', campaignId);

    setSyncStatus(error ? 'error' : 'idle');
    if (error) setSyncError(error.message);
  }

  /**
   * Upsert a single section to Supabase.
   * If offline, queues it for later.
   *
   * @param {string} sectionName  One of: resources, cities, guards, stash, campaign
   * @param {object} currentState Full current state (section will be extracted)
   */
  const upsertSection = useCallback(async (sectionName, currentState) => {
    if (!supabase || !campaignId) return;

    const sectionData = extractSection(currentState, sectionName);

    if (!isOnline.current) {
      // Queue it — newer write for the same section replaces older
      pendingQueue.current.set(sectionName, sectionData);
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('syncing');
    const { error } = await supabase
      .from('campaigns')
      .update({
        [sectionName]:                    sectionData,
        [`${sectionName}_updated_at`]:    new Date().toISOString(),
      })
      .eq('id', campaignId);

    if (error) {
      setSyncError(error.message);
      setSyncStatus('error');
      // Queue it so it retries on reconnect
      pendingQueue.current.set(sectionName, sectionData);
    } else {
      setSyncStatus('idle');
      setSyncError(null);
    }
  }, [campaignId]);

  // ── Public actions ────────────────────────────────────────────────────────

  /**
   * Create a new campaign in Supabase and store the ID locally.
   * Inserts the full current state as the initial row.
   * Returns { id, error }.
   */
  const createCampaign = useCallback(async () => {
    if (!supabase) return { id: null, error: 'Supabase not configured' };

    // Try a few times in case of ID collision (extremely unlikely but tidy)
    for (let attempt = 0; attempt < 5; attempt++) {
      const id  = generateCampaignId();
      const row = buildFullRow(id, stateRef.current);

      const { error } = await supabase.from('campaigns').insert(row);
      if (!error) {
        localStorage.setItem(CAMPAIGN_ID_KEY, id);
        setCampaignId(id);
        return { id, error: null };
      }
      // 23505 = unique_violation (duplicate ID) — retry
      if (error.code !== '23505') {
        return { id: null, error: error.message };
      }
    }
    return { id: null, error: 'Could not generate a unique campaign ID. Try again.' };
  }, []);

  /**
   * Join an existing campaign by code.
   * Fetches the row and replaces local state, then subscribes.
   * Returns { state, error } where state is the full merged game state.
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

    // Merge all remote sections into current local state
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
