import { useState, useCallback } from 'react';
import { createInitialState } from '../data/constants';

const STORAGE_KEY = 'guards_ledger_v1';
const LEGACY_KEY = 'isofarian_companion_v1';

// Default values for every guard field — inlined to avoid any import issues.
const GUARD_FIELD_DEFAULTS = {
  hp: 20,
  maxHp: 20,
  apGray: 3,
  apTemp: 0,
  baseAtk: 2,
  baseDef: 1,
  tempDef: 0,
  expandedSatchel: false,
  satchel: Array(8).fill(null).map(() => ({ item: '', qty: 1 })),
  equipment: { weapon: '', armor: '', accessory: '', item: '' },
  stones: Array(4).fill(null).map(() => ({ state: 'ready', cooldownRound: null })),
  chips: { black: 8, green: 0, red: 0, weaken: 0, break: 0, freeze: 0, poison: 0, corrupt: 0 },
  startingBlack: 8,
};

function migrateGuard(g) {
  // blueCubes → tempDef
  if ('blueCubes' in g && !('tempDef' in g)) {
    const { blueCubes, ...rest } = g;
    g = { ...rest, tempDef: blueCubes };
  }

  // Fill in any missing fields with safe defaults so the UI never crashes
  // on undefined.map() or undefined.filter()
  const migrated = { ...g };
  for (const [key, defaultVal] of Object.entries(GUARD_FIELD_DEFAULTS)) {
    if (migrated[key] === undefined || migrated[key] === null) {
      migrated[key] = defaultVal;
    }
  }

  // Ensure nested equipment object has all four slots
  migrated.equipment = {
    weapon: '', armor: '', accessory: '', item: '',
    ...migrated.equipment,
  };

  // Ensure chips object has all expected keys
  migrated.chips = {
    black: 8, green: 0, red: 0,
    weaken: 0, break: 0, freeze: 0, poison: 0, corrupt: 0,
    ...migrated.chips,
  };

  // Ensure stones is a valid array (not null/undefined/non-array)
  if (!Array.isArray(migrated.stones) || migrated.stones.length === 0) {
    migrated.stones = Array(MAX_STONES).fill(null).map(() => ({ state: 'ready', cooldownRound: null }));
  }

  // Ensure satchel is a valid array
  if (!Array.isArray(migrated.satchel) || migrated.satchel.length === 0) {
    migrated.satchel = Array(8).fill(null).map(() => ({ item: '', qty: 1 }));
  }

  return migrated;
}

function loadState() {
  try {
    // Try new key first
    let raw = localStorage.getItem(STORAGE_KEY);
    // Fall back to legacy key for users with existing saves
    if (!raw) raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return createInitialState();

    const parsed = JSON.parse(raw);

    // Migrate old stonebound slots format to per-location format
    if (parsed.stonebound?.slots && !parsed.stonebound.locations) {
      parsed.stonebound = { max: parsed.stonebound.max, locations: [] };
    }
    if (!parsed.stonebound) {
      parsed.stonebound = { max: 4, locations: [] };
    }

    // Migrate all guards, filling in any missing fields
    if (Array.isArray(parsed.guards)) {
      parsed.guards = parsed.guards.map(migrateGuard);
    }

    // Ensure top-level fields exist
    if (!Array.isArray(parsed.cities)) parsed.cities = createInitialState().cities;
    if (!parsed.stash || typeof parsed.stash !== 'object') parsed.stash = {};
    if (!Array.isArray(parsed.log)) parsed.log = [];
    if (typeof parsed.sil !== 'number') parsed.sil = 0;
    if (typeof parsed.lux !== 'number') parsed.lux = 0;
    if (typeof parsed.round !== 'number') parsed.round = 1;

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

function addLog(state, message) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const entry = { time, message, id: Date.now() + Math.random() };
  return { ...state, log: [entry, ...state.log].slice(0, 100) };
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

  // Party resources
  const setSil = useCallback((delta) => setState(s => addLog({ ...s, sil: Math.max(0, s.sil + delta) }, `Party Sil ${delta >= 0 ? '+' : ''}${delta} → ${Math.max(0, s.sil + delta)}`)), [setState]);
  const setLux = useCallback((delta) => setState(s => addLog({ ...s, lux: Math.max(0, s.lux + delta) }, `Party Lux ${delta >= 0 ? '+' : ''}${delta} → ${Math.max(0, s.lux + delta)}`)), [setState]);

  // Round management
  const endRound = useCallback(() => setState(s => {
    const nextRound = s.round + 1;
    const guards = s.guards.map(g => ({
      ...g,
      tempDef: 0,
      stones: g.stones.map(stone => {
        if (stone.state === 'cooling' && stone.cooldownRound !== null && nextRound > stone.cooldownRound) {
          return { state: 'ready', cooldownRound: null };
        }
        return stone;
      }),
    }));
    return addLog({ ...s, round: nextRound, guards }, `Round advanced to ${nextRound}`);
  }), [setState]);

  // Guard mutations
  const updateGuard = useCallback((guardIdx, field, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx
      ? { ...g, [field]: value } : g);
    return { ...s, guards };
  }), [setState]);

  const adjustGuardHp = useCallback((guardIdx, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const newHp = Math.min(g.maxHp, Math.max(0, g.hp + delta));
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, hp: newHp } : g2);
    return addLog({ ...s, guards }, `${g.name} HP ${delta >= 0 ? '+' : ''}${delta} → ${newHp}`);
  }), [setState]);

  const adjustGuardMaxHp = useCallback((guardIdx, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const newMax = Math.max(1, g.maxHp + delta);
    const newHp = Math.min(g.hp, newMax);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, maxHp: newMax, hp: newHp } : g2);
    return { ...s, guards };
  }), [setState]);

  const adjustGuardAp = useCallback((guardIdx, apType, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const key = apType === 'gray' ? 'apGray' : 'apTemp';
    const newVal = Math.min(5, Math.max(0, g[key] + delta));
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, [key]: newVal } : g2);
    return { ...s, guards };
  }), [setState]);

  const setGuardEquipment = useCallback((guardIdx, slot, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx
      ? { ...g, equipment: { ...g.equipment, [slot]: value } } : g);
    return { ...s, guards };
  }), [setState]);

  const setGuardSatchelItem = useCallback((guardIdx, slotIdx, field, value) => setState(s => {
    const guards = s.guards.map((g, i) => {
      if (i !== guardIdx) return g;
      const satchel = g.satchel.map((slot, si) => si === slotIdx ? { ...slot, [field]: value } : slot);
      return { ...g, satchel };
    });
    return { ...s, guards };
  }), [setState]);

  const toggleExpandedSatchel = useCallback((guardIdx) => setState(s => {
    const g = s.guards[guardIdx];
    const expanded = !g.expandedSatchel;
    const guards = s.guards.map((g2, i) => i === guardIdx
      ? { ...g2, expandedSatchel: expanded } : g2);
    return addLog({ ...s, guards }, `${g.name} expanded satchel ${expanded ? 'equipped' : 'removed'}`);
  }), [setState]);

  const useStone = useCallback((guardIdx, stoneIdx) => setState(s => {
    const g = s.guards[guardIdx];
    const stone = g.stones[stoneIdx];
    if (stone.state === 'cooling') {
      const guards = s.guards.map((g2, i) => {
        if (i !== guardIdx) return g2;
        const stones = g2.stones.map((st, si) =>
          si === stoneIdx ? { state: 'ready', cooldownRound: null } : st
        );
        return { ...g2, stones };
      });
      return addLog({ ...s, guards }, `${g.name} stone ${stoneIdx + 1} reset to ready`);
    }
    if (stone.state !== 'ready') return s;
    const cooldownRound = s.round + 1;
    const guards = s.guards.map((g2, i) => {
      if (i !== guardIdx) return g2;
      const stones = g2.stones.map((st, si) =>
        si === stoneIdx ? { state: 'cooling', cooldownRound } : st
      );
      return { ...g2, stones };
    });
    return addLog({ ...s, guards }, `${g.name} used stone ${stoneIdx + 1} · cooling until round ${cooldownRound + 1}`);
  }), [setState]);

  const adjustChip = useCallback((guardIdx, chipType, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const newVal = Math.max(0, (g.chips[chipType] ?? 0) + delta);
    const guards = s.guards.map((g2, i) => i === guardIdx
      ? { ...g2, chips: { ...g2.chips, [chipType]: newVal } } : g2);
    const msg = delta > 0
      ? `${g.name} +${delta} ${chipType} chip (×${newVal})`
      : `${g.name} −${Math.abs(delta)} ${chipType} chip (×${newVal})`;
    return addLog({ ...s, guards }, msg);
  }), [setState]);

  const endBattle = useCallback((guardIdx) => setState(s => {
    const g = s.guards[guardIdx];
    const guards = s.guards.map((g2, i) => i === guardIdx
      ? { ...g2, chips: { ...g2.chips, black: g2.startingBlack } } : g2);
    return addLog({ ...s, guards }, `${g.name} battle ended · black chips reset to ${g.startingBlack}`);
  }), [setState]);

  const setStartingBlack = useCallback((guardIdx, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx
      ? { ...g, startingBlack: Math.max(0, value) } : g);
    return { ...s, guards };
  }), [setState]);

  // Cities
  const setCityPrestige = useCallback((cityIdx, delta) => setState(s => {
    const cities = s.cities.map((c, i) => i === cityIdx
      ? { ...c, prestige: Math.min(3, Math.max(0, c.prestige + delta)) } : c);
    return addLog({ ...s, cities }, `${s.cities[cityIdx].name} prestige → ${Math.min(3, Math.max(0, s.cities[cityIdx].prestige + delta))}`);
  }), [setState]);

  const toggleCityQuest = useCallback((cityIdx, field) => setState(s => {
    const city = s.cities[cityIdx];
    const newVal = !city[field];
    const cities = s.cities.map((c, i) => i === cityIdx ? { ...c, [field]: newVal } : c);
    const newPrestige = [
      field === 'puzzleQuestDone' ? newVal : city.puzzleQuestDone,
      field === 'bounty1Done' ? newVal : city.bounty1Done,
      field === 'bounty2Done' ? newVal : city.bounty2Done,
    ].filter(Boolean).length;
    const label = field === 'puzzleQuestDone' ? 'puzzle quest' : field === 'bounty1Done' ? 'bounty 1' : 'bounty 2';
    return addLog({ ...s, cities }, `${city.name} ${label} ${newVal ? 'completed' : 'uncompleted'} · prestige ${newPrestige}/3`);
  }), [setState]);

  // Stash
  const adjustStash = useCallback((material, delta) => setState(s => {
    const current = s.stash[material] ?? 0;
    const next = Math.max(0, current + delta);
    const stash = { ...s.stash, [material]: next };
    return addLog({ ...s, stash }, `Stash ${material} ${delta >= 0 ? '+' : ''}${delta} → ${next}`);
  }), [setState]);

  // Stonebound
  const setStoneboundMax = useCallback((delta) => setState(s => {
    const newMax = Math.max(1, s.stonebound.max + delta);
    return { ...s, stonebound: { ...s.stonebound, max: newMax } };
  }), [setState]);

  const addStoneboundLocation = useCallback(() => setState(s => {
    const locations = [...(s.stonebound.locations ?? []), { type: '', selection: '', count: 1 }];
    return { ...s, stonebound: { ...s.stonebound, locations } };
  }), [setState]);

  const removeStoneboundLocation = useCallback((idx) => setState(s => {
    const locations = (s.stonebound.locations ?? []).filter((_, i) => i !== idx);
    return { ...s, stonebound: { ...s.stonebound, locations } };
  }), [setState]);

  const updateStoneboundLocation = useCallback((idx, field, value) => setState(s => {
    const locations = (s.stonebound.locations ?? []).map((loc, i) => {
      if (i !== idx) return loc;
      const updated = { ...loc, [field]: value };
      if (field === 'type') updated.selection = '';
      return updated;
    });
    return { ...s, stonebound: { ...s.stonebound, locations } };
  }), [setState]);

  const adjustTempDef = useCallback((guardIdx, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const newVal = Math.max(0, (g.tempDef ?? 0) + delta);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, tempDef: newVal } : g2);
    return { ...s, guards };
  }), [setState]);

  const adjustBaseStat = useCallback((guardIdx, stat, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const key = stat === 'atk' ? 'baseAtk' : 'baseDef';
    const newVal = Math.max(0, (g[key] ?? 0) + delta);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, [key]: newVal } : g2);
    return { ...s, guards };
  }), [setState]);

  const exportState = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
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
    setSil, setLux, endRound,
    adjustGuardHp, adjustGuardMaxHp, adjustGuardAp,
    setGuardEquipment, setGuardSatchelItem, toggleExpandedSatchel,
    useStone, adjustChip, endBattle, setStartingBlack,
    adjustTempDef, adjustBaseStat,
    updateGuard,
    setCityPrestige, toggleCityQuest,
    adjustStash,
    setStoneboundMax, addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
    exportState, importState, resetState,
  };
}
