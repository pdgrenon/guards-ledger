import demoSave from '../data/demoSave.json';
import { useState, useCallback } from 'react';
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

// v2: state is split into sync sections (resources, cities, guards, stash, campaign).
// v1 saves (flat shape) are migrated automatically on first load.
const STORAGE_KEY = 'guards_ledger_v2';
const STORAGE_KEY_V1 = 'guards_ledger_v1';

// ─── Migration ────────────────────────────────────────────────────────────────
// Converts a flat v1 save to the v2 sectioned shape.
// All fields are spread at the top level in both versions —
// the "sections" are a conceptual grouping, not a nesting change —
// so migration is mostly just filling in any missing keys.

function migrateV1(v1) {
  return {
    // resources
    sil: v1.sil ?? 0,
    lux: v1.lux ?? 0,
    // cities
    cities: v1.cities ?? createInitialCities().cities,
    // guards
    guards:         v1.guards         ?? createInitialGuards().guards,
    activeParty:    v1.activeParty    ?? createInitialGuards().activeParty,
    activeGuardIdx: v1.activeGuardIdx ?? createInitialGuards().activeGuardIdx,
    // stash
    stash:      v1.stash      ?? createInitialStash().stash,
    stonebound: v1.stonebound ?? createInitialStash().stonebound,
    // campaign
    campaign: v1.campaign ?? createInitialCampaign().campaign,
    // local-only
    log:      v1.log      ?? [],
    settings: v1.settings ?? { initialized: true },
  };
}

function loadState() {
  try {
    // Try v2 save first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);

    // Fall back to v1 save and migrate
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateV1(JSON.parse(rawV1));
      // Persist migrated state under new key so migration only runs once
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    // No save at all — use demo save (also in v1 flat shape, migrate it)
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

  const setState = useCallback((updater) => {
    setRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(next);
      return next;
    });
  }, []);

  // ── Active guard (UI navigation, no log) ────────────────────────────────
  const setActiveGuard = useCallback((idx) =>
    setState(s => ({ ...s, activeGuardIdx: idx })), [setState]);

  const setPartySlot = useCallback((slotIdx, name) =>
    setState(s => reduceSetPartySlot(s, slotIdx, name)), [setState]);

  // ── Party resources ──────────────────────────────────────────────────────
  const setSil = useCallback((delta) =>
    setState(s => reduceSetSil(s, delta)), [setState]);

  const setLux = useCallback((delta) =>
    setState(s => reduceSetLux(s, delta)), [setState]);

  // ── Guard mutations ──────────────────────────────────────────────────────
  const adjustGuardHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardHp(s, guardIdx, delta)), [setState]);

  const adjustGuardMaxHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardMaxHp(s, guardIdx, delta)), [setState]);

  const setGuardEquipment = useCallback((guardIdx, slot, value) =>
    setState(s => reduceSetGuardEquipment(s, guardIdx, slot, value)), [setState]);

  const setGuardSatchelItem = useCallback((guardIdx, slotIdx, field, value) =>
    setState(s => reduceSetGuardSatchelItem(s, guardIdx, slotIdx, field, value)), [setState]);

  // Satchel expand/collapse — UI preference, not a game event; no log
  const toggleExpandedSatchel = useCallback((guardIdx) => setState(s => {
    const expanded = !s.guards[guardIdx].expandedSatchel;
    const guards   = s.guards.map((g, i) => i === guardIdx
      ? { ...g, expandedSatchel: expanded } : g);
    return { ...s, guards };
  }), [setState]);

  const adjustChip = useCallback((guardIdx, chipType, delta) =>
    setState(s => reduceAdjustChip(s, guardIdx, chipType, delta)), [setState]);

  const resetChips = useCallback((guardIdx) =>
    setState(s => reduceResetChips(s, guardIdx)), [setState]);

  // Starting black chip count — settings change, no log needed
  const setStartingBlack = useCallback((guardIdx, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx
      ? { ...g, startingBlack: Math.max(0, value) } : g);
    return { ...s, guards };
  }), [setState]);

  // ── Cities ───────────────────────────────────────────────────────────────
  const toggleCityQuest = useCallback((cityIdx, field) =>
    setState(s => reduceToggleCityQuest(s, cityIdx, field)), [setState]);

  // ── Stash ────────────────────────────────────────────────────────────────
  const adjustStash = useCallback((itemName, delta) =>
    setState(s => reduceAdjustStash(s, itemName, delta)), [setState]);

  // ── Stonebound ───────────────────────────────────────────────────────────
  const setStoneboundMax = useCallback((delta) =>
    setState(s => reduceSetStoneboundMax(s, delta)), [setState]);

  const addStoneboundLocation = useCallback(() =>
    setState(s => reduceAddStoneboundLocation(s)), [setState]);

  const removeStoneboundLocation = useCallback((idx) =>
    setState(s => reduceRemoveStoneboundLocation(s, idx)), [setState]);

  const updateStoneboundLocation = useCallback((idx, field, value) =>
    setState(s => reduceUpdateStoneboundLocation(s, idx, field, value)), [setState]);

  // ── Campaign ─────────────────────────────────────────────────────────────
  const setEventToken = useCallback((region, delta) =>
    setState(s => reduceSetEventToken(s, region, delta)), [setState]);

  const resetEventToken = useCallback((region) =>
    setState(s => reduceResetEventToken(s, region)), [setState]);

  // Location changes are frequent free-text edits — no log to avoid noise
  const setCampaignLocation = useCallback((key, value) =>
    setState(s => reduceSetCampaignLocation(s, key, value)), [setState]);

  const addDynamicLocation = useCallback((type) =>
    setState(s => reduceAddDynamicLocation(s, type)), [setState]);

  const updateDynamicLocation = useCallback((type, id, label) =>
    setState(s => reduceUpdateDynamicLocation(s, type, id, label)), [setState]);

  const removeDynamicLocation = useCallback((type, id) =>
    setState(s => reduceRemoveDynamicLocation(s, type, id)), [setState]);

  const addPlan = useCallback((text) =>
    setState(s => reduceAddPlan(s, text)), [setState]);

  const togglePlan = useCallback((id) =>
    setState(s => reduceTogglePlan(s, id)), [setState]);

  const deletePlan = useCallback((id) =>
    setState(s => reduceDeletePlan(s, id)), [setState]);

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
        // Accept both v1 (flat) and v2 saves by running through migration
        setState(addLog(migrateV1(imported), 'Save file imported'));
      } catch {
        alert('Invalid save file.');
      }
    };
    reader.readAsText(file);
  }, [setState]);

  const resetState = useCallback(() => {
    if (window.confirm('Reset all game data? This cannot be undone.')) {
      setState(createInitialState());
    }
  }, [setState]);

  return {
    state,
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
