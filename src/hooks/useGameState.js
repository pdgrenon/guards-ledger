import demoSave from '../data/demoSave.json';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createInitialState,
  createInitialResources,
  createInitialCities,
  createInitialGuards,
  createInitialStash,
  createInitialCampaign,
} from '../data/constants';
import {
  addLog,
  reduceSetPartySlot,
  reduceSetSil,
  reduceSetLux,
  reduceAdjustGuardHp,
  reduceAdjustGuardMaxHp,
  reduceSetGuardEquipment,
  reduceSetGuardSatchelItem,
  reduceAdjustChip,
  reduceResetChips,
  reduceToggleCityQuest,
  reduceAdjustStash,
  reduceSetStoneboundMax,
  reduceAddStoneboundLocation,
  reduceRemoveStoneboundLocation,
  reduceUpdateStoneboundLocation,
  reduceSetEventToken,
  reduceResetEventToken,
  reduceSetCampaignLocation,
  reduceAddDynamicLocation,
  reduceUpdateDynamicLocation,
  reduceRemoveDynamicLocation,
  reduceAddPlan,
  reduceTogglePlan,
  reduceDeletePlan,
} from './gameReducers';
import { useSupabaseSync, guardColumn } from './useSupabaseSync';

// v2: state is split into sync sections (resources, cities, guards, stash, campaign).
// v1 saves (flat shape) are migrated automatically on first load.
const STORAGE_KEY    = 'guards_ledger_v2';
const STORAGE_KEY_V1 = 'guards_ledger_v1';

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateV1(v1) {
  return {
    sil:            v1.sil            ?? 0,
    lux:            v1.lux            ?? 0,
    cities:         v1.cities         ?? createInitialCities().cities,
    guards:         v1.guards         ?? createInitialGuards().guards,
    activeParty:    v1.activeParty    ?? createInitialGuards().activeParty,
    // activeGuardIdx is local-only UI state — always reset to default on load
    // so each player starts viewing the first guard in their own party.
    activeGuardIdx: createInitialGuards().activeGuardIdx,
    stash:          v1.stash          ?? createInitialStash().stash,
    stonebound:     v1.stonebound     ?? createInitialStash().stonebound,
    campaign:       v1.campaign       ?? createInitialCampaign().campaign,
    log:            v1.log            ?? [],
    settings:       v1.settings       ?? { initialized: true },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Always reset activeGuardIdx on load — it's local UI nav, not campaign state.
      // This cleans up any saves that persisted it before this fix.
      return { ...parsed, activeGuardIdx: createInitialGuards().activeGuardIdx };
    }

    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateV1(JSON.parse(rawV1));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return migrateV1(demoSave);
  } catch {
    return createInitialState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameState() {
    const [state, setRaw] = useState(loadState);
    const saveTimer = useRef(null);
    const upsertTimer = useRef(null);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    useEffect(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveState(state);
      }, 400);
      return () => clearTimeout(saveTimer.current);
    }, [state]);

    useEffect(() => {
      const flush = () => saveState(state);
      window.addEventListener('beforeunload', flush);
      return () => window.removeEventListener('beforeunload', flush);
    }, [state]);

    // ── Remote change handler (called by useSupabaseSync on Realtime event) ──
    // Merges remote state into local, preserving local-only keys.
    const handleRemoteChange = useCallback((remoteState) => {
      setRaw(prev => ({
        ...remoteState,
        log:            prev.log,            // local-only: session log
        settings:       prev.settings,       // local-only: app settings
        activeGuardIdx: prev.activeGuardIdx, // local-only: which guard tab each player is viewing
      }));
    }, []);

    const sync = useSupabaseSync(state, handleRemoteChange);

    // ── Core setState — persists locally and upserts the changed section(s) ──
    // sectionName: which Supabase column this change belongs to, or null for local-only.
    // Multiple distinct sections may be touched within one debounce window (e.g.
    // edits to two different guards); each is collected and flushed, so no
    // pending upsert is dropped.

      const pendingSections = useRef(new Set());

      const setState = useCallback((updater, sectionName = null) => {
        setRaw(prev => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          return next;
        });
        if (sectionName) {
          pendingSections.current.add(sectionName);
          if (upsertTimer.current) clearTimeout(upsertTimer.current);
          upsertTimer.current = setTimeout(() => {
            const sections = Array.from(pendingSections.current);
            pendingSections.current.clear();
            for (const section of sections) {
              sync.upsertSection(section, stateRef.current);
            }
          }, 400);
        }
      }, [sync]);

  // ── Active guard (local-only UI navigation — never synced) ──────────────
  // Each player independently controls which guard card they're viewing.
  // Passing null as the section name keeps this out of Supabase entirely.
  const setActiveGuard = useCallback((idx) =>
    setState(s => ({ ...s, activeGuardIdx: idx }), null), [setState]);

  // activeParty is shared party-level state in its own `party` section.
  // (activeGuardIdx is also touched by this reducer but is local-only.)
  const setPartySlot = useCallback((slotIdx, name) =>
    setState(s => reduceSetPartySlot(s, slotIdx, name), 'party'), [setState]);

  // ── Party resources ──────────────────────────────────────────────────────
  const setSil = useCallback((delta) =>
    setState(s => reduceSetSil(s, delta), 'resources'), [setState]);

  const setLux = useCallback((delta) =>
    setState(s => reduceSetLux(s, delta), 'resources'), [setState]);

  // ── Guard mutations ──────────────────────────────────────────────────────
  // Each guard syncs to its own column (guard_0 … guard_7), so concurrent edits
  // to different guards never overwrite each other.
  const adjustGuardHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardHp(s, guardIdx, delta), guardColumn(guardIdx)), [setState]);

  const adjustGuardMaxHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardMaxHp(s, guardIdx, delta), guardColumn(guardIdx)), [setState]);

  const setGuardEquipment = useCallback((guardIdx, slot, value) =>
    setState(s => reduceSetGuardEquipment(s, guardIdx, slot, value), guardColumn(guardIdx)), [setState]);

  const setGuardSatchelItem = useCallback((guardIdx, slotIdx, field, value) =>
    setState(s => reduceSetGuardSatchelItem(s, guardIdx, slotIdx, field, value), guardColumn(guardIdx)), [setState]);

  const toggleExpandedSatchel = useCallback((guardIdx) =>
    setState(s => {
      const expanded = !s.guards[guardIdx].expandedSatchel;
      const guards   = s.guards.map((g, i) => i === guardIdx ? { ...g, expandedSatchel: expanded } : g);
      return { ...s, guards };
    }, guardColumn(guardIdx)), [setState]);

  const adjustChip = useCallback((guardIdx, chipType, delta) =>
    setState(s => reduceAdjustChip(s, guardIdx, chipType, delta), guardColumn(guardIdx)), [setState]);

  const resetChips = useCallback((guardIdx) =>
    setState(s => reduceResetChips(s, guardIdx), guardColumn(guardIdx)), [setState]);

  const setStartingBlack = useCallback((guardIdx, value) =>
    setState(s => {
      const guards = s.guards.map((g, i) => i === guardIdx
        ? { ...g, startingBlack: Math.max(0, value) } : g);
      return { ...s, guards };
    }, guardColumn(guardIdx)), [setState]);

  // ── Cities ───────────────────────────────────────────────────────────────
  const toggleCityQuest = useCallback((cityIdx, field) =>
    setState(s => reduceToggleCityQuest(s, cityIdx, field), 'cities'), [setState]);

  // ── Stash ────────────────────────────────────────────────────────────────
  const adjustStash = useCallback((itemName, delta) =>
    setState(s => reduceAdjustStash(s, itemName, delta), 'stash'), [setState]);

  // ── Stonebound ───────────────────────────────────────────────────────────
  const setStoneboundMax = useCallback((delta) =>
    setState(s => reduceSetStoneboundMax(s, delta), 'stash'), [setState]);

  const addStoneboundLocation = useCallback(() =>
    setState(s => reduceAddStoneboundLocation(s), 'stash'), [setState]);

  const removeStoneboundLocation = useCallback((idx) =>
    setState(s => reduceRemoveStoneboundLocation(s, idx), 'stash'), [setState]);

  const updateStoneboundLocation = useCallback((idx, field, value) =>
    setState(s => reduceUpdateStoneboundLocation(s, idx, field, value), 'stash'), [setState]);

  // ── Campaign ─────────────────────────────────────────────────────────────
  const setEventToken = useCallback((region, delta) =>
    setState(s => reduceSetEventToken(s, region, delta), 'campaign'), [setState]);

  const resetEventToken = useCallback((region) =>
    setState(s => reduceResetEventToken(s, region), 'campaign'), [setState]);

  const setCampaignLocation = useCallback((key, value) =>
    setState(s => reduceSetCampaignLocation(s, key, value), 'campaign'), [setState]);

  const addDynamicLocation = useCallback((type) =>
    setState(s => reduceAddDynamicLocation(s, type), 'campaign'), [setState]);

  const updateDynamicLocation = useCallback((type, id, label) =>
    setState(s => reduceUpdateDynamicLocation(s, type, id, label), 'campaign'), [setState]);

  const removeDynamicLocation = useCallback((type, id) =>
    setState(s => reduceRemoveDynamicLocation(s, type, id), 'campaign'), [setState]);

  const addPlan = useCallback((text) =>
    setState(s => reduceAddPlan(s, text), 'campaign'), [setState]);

  const togglePlan = useCallback((id) =>
    setState(s => reduceTogglePlan(s, id), 'campaign'), [setState]);

  const deletePlan = useCallback((id) =>
    setState(s => reduceDeletePlan(s, id), 'campaign'), [setState]);

  // ── Save data ────────────────────────────────────────────────────────────
  const exportState = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `guards-ledger-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importState = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        // Accept both v1 (flat) and v2 saves
        setState(addLog(migrateV1(imported), 'Save file imported'), null);
      } catch {
        alert('Invalid save file.');
      }
    };
    reader.readAsText(file);
  }, [setState]);

  const resetState = useCallback(() => {
    if (window.confirm('Reset all game data? This cannot be undone.')) {
      setState(createInitialState(), null);
    }
  }, [setState]);

  return {
    state,
    sync, // expose sync handle so SettingsPanel can call createCampaign / joinCampaign / leaveCampaign
    setActiveGuard,
    setPartySlot,
    setSil, setLux,
    adjustGuardHp, adjustGuardMaxHp,
    setGuardEquipment, setGuardSatchelItem, toggleExpandedSatchel,
    adjustChip, resetChips, setStartingBlack,
    toggleCityQuest,
    adjustStash,
    setStoneboundMax, addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
    setEventToken, resetEventToken,
    setCampaignLocation,
    addDynamicLocation, updateDynamicLocation, removeDynamicLocation,
    addPlan, togglePlan, deletePlan,
    exportState, importState, resetState,
  };
}
