import { useState, useCallback } from 'react';
import { createInitialState, SATCHEL_EXPANDED_SIZE } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, ITEMS } from '../data/materials';

// Combined set of all valid equipment options — used to gate logging to finalised selections
const ALL_EQUIPMENT = new Set([...WEAPONS, ...ARMOR, ...ACCESSORIES, ...ITEMS]);
// Set for O(1) satchel item lookup
const ALL_MATERIALS_SET = new Set(ALL_MATERIALS);

const STORAGE_KEY = 'guards_ledger_v1';
const LEGACY_KEY  = 'isofarian_companion_v1';

function migrateGuard(g) {
  return {
    ...g,
    hp:              g.hp              ?? 20,
    maxHp:           g.maxHp           ?? 20,
    apGray:          g.apGray          ?? 0,
    apTemp:          g.apTemp          ?? 0,
    baseAtk:         g.baseAtk         ?? 0,
    baseDef:         g.baseDef         ?? 0,
    tempDef:         g.tempDef         ?? 0,
    expandedSatchel: g.expandedSatchel ?? false,
    satchel:         Array(8).fill(null).map((_, i) =>
                       g.satchel?.[i] ?? { item: '', qty: 1 }
                     ),
    equipment: {
      weapon:    g.equipment?.weapon    ?? '',
      armor:     g.equipment?.armor     ?? '',
      accessory: g.equipment?.accessory ?? '',
      item:      g.equipment?.item      ?? '',
    },
    stones: Array(4).fill(null).map((_, i) =>
               g.stones?.[i] ?? { state: 'ready', cooldownRound: null }
             ),
    chips: {
      black:  g.chips?.black  ?? 8,
      green:  g.chips?.green  ?? 0,
      red:    g.chips?.red    ?? 0,
      purple: g.chips?.purple ?? 0,
    },
    startingBlack: g.startingBlack ?? 8,
  };
}

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
    if (!Array.isArray(cleanParsed.cities))             cleanParsed.cities = createInitialState().cities;
    if (typeof cleanParsed.stash !== 'object' || Array.isArray(cleanParsed.stash)) cleanParsed.stash = {};
    if (!Array.isArray(cleanParsed.log))                cleanParsed.log = [];
    if (typeof cleanParsed.sil !== 'number')            cleanParsed.sil = 0;
    if (typeof cleanParsed.lux !== 'number')            cleanParsed.lux = 0;

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

  // Active guard — no log (UI navigation, not a game state change)
  const setActiveGuard = useCallback((idx) => setState(s => ({ ...s, activeGuardIdx: idx })), [setState]);

  // ── Party resources ──────────────────────────────────────────────────────
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

  // ── Guard mutations ──────────────────────────────────────────────────────

  // Generic field update — no log (internal use only)
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

  // Max HP change from settings — meaningful campaign event
  const adjustGuardMaxHp = useCallback((guardIdx, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const newMax = Math.max(1, g.maxHp + delta);
    const newHp = Math.min(g.hp, newMax);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, maxHp: newMax, hp: newHp } : g2);
    return addLog({ ...s, guards }, `${g.name} max HP → ${newMax}`);
  }), [setState]);

  // Equipment — log when a known item is equipped or a slot is cleared.
  // Autocomplete fires onChange on every keystroke; ALL_EQUIPMENT guards against partial strings.
  const setGuardEquipment = useCallback((guardIdx, slot, value) => setState(s => {
    const g = s.guards[guardIdx];
    const guards = s.guards.map((g2, i) => i === guardIdx
      ? { ...g2, equipment: { ...g2.equipment, [slot]: value } } : g2);
    const newState = { ...s, guards };
    if (value && ALL_EQUIPMENT.has(value)) {
      return addLog(newState, `${g.name} equipped ${value} (${slot})`);
    }
    if (!value) {
      const prev = g.equipment[slot];
      if (prev) return addLog(newState, `${g.name} unequipped ${slot}`);
    }
    return newState;
  }), [setState]);

  // Satchel — only log when an item name exactly matches a known material.
  // Autocomplete fires onChange on every keystroke; ALL_MATERIALS_SET guards against partial strings.
  const setGuardSatchelItem = useCallback((guardIdx, slotIdx, field, value) => setState(s => {
    const g = s.guards[guardIdx];
    const guards = s.guards.map((gi, i) => {
      if (i !== guardIdx) return gi;
      const satchel = gi.satchel.map((slot, si) => si === slotIdx ? { ...slot, [field]: value } : slot);
      return { ...gi, satchel };
    });
    const newState = { ...s, guards };
    if (field === 'item' && value && ALL_MATERIALS_SET.has(value)) {
      return addLog(newState, `${g.name} satchel slot ${slotIdx + 1} → ${value}`);
    }
    if (field === 'item' && !value) {
      const prev = g.satchel[slotIdx]?.item;
      if (prev) return addLog(newState, `${g.name} satchel slot ${slotIdx + 1} cleared`);
    }
    if (field === 'qty') {
      const item = g.satchel[slotIdx]?.item;
      if (item) return addLog(newState, `${g.name} ${item} ×${value}`);
    }
    return newState;
  }), [setState]);

  // Satchel expand/collapse — UI preference, not a game event; removed from log
  const toggleExpandedSatchel = useCallback((guardIdx) => setState(s => {
    const expanded = !s.guards[guardIdx].expandedSatchel;
    const guards = s.guards.map((g, i) => i === guardIdx ? { ...g, expandedSatchel: expanded } : g);
    return { ...s, guards };
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

  // Starting black chip count — settings change, no log needed
  const setStartingBlack = useCallback((guardIdx, value) => setState(s => {
    const guards = s.guards.map((g, i) => i === guardIdx
      ? { ...g, startingBlack: Math.max(0, value) } : g);
    return { ...s, guards };
  }), [setState]);

  // Base stats — kept for data model but no longer exposed in settings UI
  const adjustBaseStat = useCallback((guardIdx, stat, delta) => setState(s => {
    const g = s.guards[guardIdx];
    const key = stat === 'atk' ? 'baseAtk' : 'baseDef';
    const newVal = Math.max(0, (g[key] ?? 0) + delta);
    const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, [key]: newVal } : g2);
    return { ...s, guards };
  }), [setState]);

  // ── Cities ───────────────────────────────────────────────────────────────
  const toggleCityQuest = useCallback((cityIdx, field) => setState(s => {
    const city = s.cities[cityIdx];
    const newVal = !city[field];
    const cities = s.cities.map((c, i) => i === cityIdx ? { ...c, [field]: newVal } : c);
    const questLabel = field === 'puzzleQuestDone' ? 'puzzle quest'
      : field === 'bounty1Done' ? 'bounty 1'
      : 'bounty 2';
    return addLog({ ...s, cities },
      `${city.name} ${questLabel} ${newVal ? 'completed' : 'reopened'}`
    );
  }), [setState]);

  // ── Stash ────────────────────────────────────────────────────────────────
  const adjustStash = useCallback((itemName, delta) => setState(s => {
    const current = s.stash[itemName] ?? 0;
    const newVal = Math.max(0, current + delta);
    const stash = { ...s.stash, [itemName]: newVal };
    if (newVal === 0) delete stash[itemName];
    return addLog({ ...s, stash }, `Stash ${itemName} ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`);
  }), [setState]);

  // ── Stonebound ───────────────────────────────────────────────────────────

  // Cube cap change — log it; affects strategic planning
  const setStoneboundMax = useCallback((delta) => setState(s => {
    const newMax = Math.max(0, s.stonebound.max + delta);
    return addLog(
      { ...s, stonebound: { ...s.stonebound, max: newMax } },
      `Stonebound cube cap → ${newMax}`
    );
  }), [setState]);

  // Adding a location — log once; selection logged separately by updateStoneboundLocation
  const addStoneboundLocation = useCallback(() => setState(s => {
    const locations = [...s.stonebound.locations, { type: '', selection: '', count: 1 }];
    return addLog(
      { ...s, stonebound: { ...s.stonebound, locations } },
      'Stonebound location added'
    );
  }), [setState]);

  // Removing a location — log with whatever was selected so it's recoverable
  const removeStoneboundLocation = useCallback((idx) => setState(s => {
    const loc = s.stonebound.locations[idx];
    const locations = s.stonebound.locations.filter((_, i) => i !== idx);
    const label = loc.selection || 'empty location';
    return addLog(
      { ...s, stonebound: { ...s.stonebound, locations } },
      `Stonebound removed: ${label}`
    );
  }), [setState]);

  // Updating a location — log selection changes and cube count changes; skip type-only changes
  // (type is always set alongside selection in the new grouped-select UI)
  const updateStoneboundLocation = useCallback((idx, field, value) => setState(s => {
    const locations = s.stonebound.locations.map((loc, i) =>
      i === idx ? { ...loc, [field]: value } : loc
    );
    const newState = { ...s, stonebound: { ...s.stonebound, locations } };

    if (field === 'selection' && value) {
      return addLog(newState, `Stonebound location ${idx + 1} → ${value}`);
    }
    if (field === 'count') {
      const loc = s.stonebound.locations[idx];
      const label = loc.selection || `location ${idx + 1}`;
      return addLog(newState, `Stonebound ${label} cubes → ${value}`);
    }
    return newState;
  }), [setState]);

  // ── Save data ────────────────────────────────────────────────────────────
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
    setActiveGuard,
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
