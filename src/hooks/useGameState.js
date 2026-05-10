import { useState, useCallback } from 'react';
import { createInitialState, SATCHEL_EXPANDED_SIZE } from '../data/constants';

const STORAGE_KEY = 'isofarian_companion_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);

    // Migrate stonebound slots format
    if (parsed.stonebound?.slots && !parsed.stonebound.locations) {
      parsed.stonebound = { max: parsed.stonebound.max, locations: [] };
    }

    // Migrate guards: strip removed fields, collapse purple chips
    if (parsed.guards) {
      parsed.guards = parsed.guards.map(g => {
        const { blueCubes, apGray, apTemp, tempDef, stones, ...rest } = g;
        const oldChips = rest.chips ?? {};
        const purpleCount =
          (oldChips.weaken ?? 0) +
          (oldChips.break  ?? 0) +
          (oldChips.freeze ?? 0) +
          (oldChips.poison ?? 0) +
          (oldChips.corrupt ?? 0);
        rest.chips = {
          black:  oldChips.black  ?? 8,
          green:  oldChips.green  ?? 0,
          red:    oldChips.red    ?? 0,
          purple: oldChips.purple ?? purpleCount,
        };
        return rest;
      });
    }

    // Migrate round / campaign fields out (keep them harmlessly if present,
    // but strip so state stays clean)
    const { round, campaign, ...cleanParsed } = parsed;

    // Ensure activeGuardIdx exists
    if (typeof cleanParsed.activeGuardIdx !== 'number') {
      cleanParsed.activeGuardIdx = 0;
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

  // Active guard
  const setActiveGuard = useCallback((idx) => setState(s => ({ ...s, activeGuardIdx: idx })), [setState]);

  // Party resources
  const setSil = useCallback((delta) => setState(s =>
    addLog({ ...s, sil: Math.max(0, s.sil + delta) },
      `Party Sil ${delta >= 0 ? '+' : ''}${delta} → ${Math.max(0, s.sil + delta)}`
    )
  ), [setState]);

  const setLux = useCallback((delta) => setState(s =>
    addLog({ ...s, lux: Math.max(0, s.lux + delta) },
      `Party Lux ${delta >= 0 ? '+' : ''}${delta} → ${Math.max(0, s.lux + delta)}`
    )
  ), [setState]);

  // Guard mutations
  const updateGuard = useCallback((guardIdx, field, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx ? { ...g, [field]: value } : g);
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
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, expandedSatchel: expanded } : g2);
    return addLog({ ...s, guards }, `${g.name} satchel ${expanded ? 'expanded' : 'standard'}`);
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

  const resetChips = useCallback((guardIdx) => setState(s => {
    const g = s.guards[guardIdx];
    const guards = s.guards.map((g2, i) => i === guardIdx
      ? { ...g2, chips: { ...g2.chips, black: g2.startingBlack } } : g2);
    return addLog({ ...s, guards }, `${g.name} chips reset · black → ${g.startingBlack}`);
  }), [setState]);

  const setStartingBlack = useCallback((guardIdx, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx
      ? { ...g, startingBlack: Math.max(0, value) } : g);
    return { ...s, guards };
  }), [setState]);

  const adjustBaseStat = useCallback((guardIdx, stat, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const key = stat === 'atk' ? 'baseAtk' : 'baseDef';
    const newVal = Math.max(0, (g[key] ?? 0) + delta);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, [key]: newVal } : g2);
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
    return addLog({ ...s, cities }, `${city.name} ${field} → ${newVal ? 'done' : 'undone'}`);
  }), [setState]);

  // Stash
  const adjustStash = useCallback((itemName, delta) => setState(s => {
    const current = s.stash[itemName] ?? 0;
    const newVal = Math.max(0, current + delta);
    const stash = { ...s.stash, [itemName]: newVal };
    if (newVal === 0) delete stash[itemName];
    return addLog({ ...s, stash }, `Stash ${itemName} ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`);
  }), [setState]);

  // Stonebound
  const setStoneboundMax = useCallback((value) => setState(s => ({
    ...s, stonebound: { ...s.stonebound, max: Math.max(0, value) },
  })), [setState]);

  const addStoneboundLocation = useCallback(() => setState(s => {
    const locations = [...s.stonebound.locations, { type: '', selection: '', count: 1 }];
    return { ...s, stonebound: { ...s.stonebound, locations } };
  }), [setState]);

  const removeStoneboundLocation = useCallback((idx) => setState(s => {
    const locations = s.stonebound.locations.filter((_, i) => i !== idx);
    return { ...s, stonebound: { ...s.stonebound, locations } };
  }), [setState]);

  const updateStoneboundLocation = useCallback((idx, field, value) => setState(s => {
    const locations = s.stonebound.locations.map((loc, i) =>
      i === idx ? { ...loc, [field]: value } : loc
    );
    return { ...s, stonebound: { ...s.stonebound, locations } };
  }), [setState]);

  // Save data
  const exportState = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `isofarian-save-${new Date().toISOString().slice(0, 10)}.json`;
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
    setSil, setLux,
    adjustGuardHp, adjustGuardMaxHp,
    setGuardEquipment, setGuardSatchelItem, toggleExpandedSatchel,
    adjustChip, resetChips, setStartingBlack,
    adjustBaseStat, updateGuard,
    setCityPrestige, toggleCityQuest,
    adjustStash,
    setStoneboundMax, addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
    exportState, importState, resetState,
  };
}
