import { useState, useCallback } from 'react';
import { createInitialState } from '../data/constants';
import {
  migrateGuard,
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
} from './gameReducers';

const STORAGE_KEY = 'guards_ledger_v1';
const LEGACY_KEY  = 'isofarian_companion_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);

    if (parsed.stonebound?.slots && !parsed.stonebound.locations) {
      parsed.stonebound = { max: parsed.stonebound.max, locations: [] };
    }

    if (parsed.guards) {
      parsed.guards = parsed.guards.map(migrateGuard);
    }

    // Migration: if a saved game has fewer guards than the current roster
    // (e.g. an old 2-guard save being loaded with the 8-guard version),
    // append any missing guards with their default starting state.
    const fresh = createInitialState();
    if (Array.isArray(parsed.guards)) {
      const savedNames = new Set(parsed.guards.map(g => g.name));
      const missing = fresh.guards.filter(g => !savedNames.has(g.name));
      if (missing.length > 0) {
        parsed.guards = [...parsed.guards, ...missing];
      }
    }

    const { round, campaign, ...cleanParsed } = parsed;

    if (typeof cleanParsed.activeGuardIdx !== 'number') cleanParsed.activeGuardIdx = 0;
    if (!Array.isArray(cleanParsed.cities))             cleanParsed.cities = fresh.cities;
    if (typeof cleanParsed.stash !== 'object' || Array.isArray(cleanParsed.stash)) cleanParsed.stash = {};
    if (!Array.isArray(cleanParsed.log))                cleanParsed.log = [];
    if (typeof cleanParsed.sil !== 'number')            cleanParsed.sil = 0;
    if (typeof cleanParsed.lux !== 'number')            cleanParsed.lux = 0;

    // Migration: default activeParty for saves that predate the party system
    if (!Array.isArray(cleanParsed.activeParty) || cleanParsed.activeParty.length !== 2) {
      cleanParsed.activeParty = ['Alek', 'Grigory'];
    }

    return cleanParsed;
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

  // Generic field update — no log (internal use only)
  const updateGuard = useCallback((guardIdx, field, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx ? { ...g, [field]: value } : g);
    return { ...s, guards };
  }), [setState]);

  const adjustGuardHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardHp(s, guardIdx, delta)), [setState]);

  const adjustGuardMaxHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardMaxHp(s, guardIdx, delta)), [setState]);

  const setGuardEquipment = useCallback((guardIdx, slot, value) =>
    setState(s => reduceSetGuardEquipment(s, guardIdx, slot, value)), [setState]);

  const setGuardSatchelItem = useCallback((guardIdx, slotIdx, field, value) =>
    setState(s => reduceSetGuardSatchelItem(s, guardIdx, slotIdx, field, value)), [setState]);

  // Satchel expand/collapse — UI preference, not a game event; removed from log
  const toggleExpandedSatchel = useCallback((guardIdx) => setState(s => {
    const expanded = !s.guards[guardIdx].expandedSatchel;
    const guards   = s.guards.map((g, i) => i === guardIdx ? { ...g, expandedSatchel: expanded } : g);
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

  // Base stats — kept for data model but no longer exposed in settings UI
  const adjustBaseStat = useCallback((guardIdx, stat, delta) => setState(s => {
    const g   = s.guards[guardIdx];
    const key = stat === 'atk' ? 'baseAtk' : 'baseDef';
    const newVal = Math.max(0, (g[key] ?? 0) + delta);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, [key]: newVal } : g2);
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
    adjustBaseStat, updateGuard,
    toggleCityQuest,
    adjustStash,
    setStoneboundMax, addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
    exportState, importState, resetState,
  };
}
