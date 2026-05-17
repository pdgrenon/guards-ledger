import demoSave from '../data/demoSave.json';
import { useState, useCallback } from 'react';
import { createInitialState } from '../data/constants';
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

const STORAGE_KEY = 'guards_ledger_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return demoSave;
    const parsed = JSON.parse(raw);
    // Migration: add campaign key if missing (for saves created before this feature)
    if (!parsed.campaign) {
      parsed.campaign = createInitialState().campaign;
    }
    return parsed;
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

export function useGameState() {
  const [state, setRaw] = useState(loadState);

  const setState = useCallback((updater) => {
    setRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveState(next);
      return next;
    });
  }, []);

  // Active guard — no log (UI navigation, not a game state change)
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
        setState(addLog(imported, 'Save file imported'));
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
