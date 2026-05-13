/**
 * gameReducers.js
 *
 * Pure state-transition functions extracted from useGameState.
 * Each function takes a state snapshot and returns a new state snapshot —
 * no React, no localStorage, no side-effects. This makes them trivially
 * unit-testable and keeps useGameState as a thin wiring layer.
 */

import { createInitialState, SATCHEL_EXPANDED_SIZE } from '../data/constants';
import { ALL_MATERIALS, ALL_ITEMS_WITH_CATEGORY, WEAPONS, ARMOR, ACCESSORIES, ITEMS } from '../data/materials';

export const ALL_EQUIPMENT    = new Set([...WEAPONS, ...ARMOR, ...ACCESSORIES, ...ITEMS]);
export const ALL_MATERIALS_SET = new Set(ALL_MATERIALS);

// ─── Logging ─────────────────────────────────────────────────────────────────

export function addLog(state, message) {
  const now  = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const entry = { time, message, id: Date.now() + Math.random() };
  return { ...state, log: [entry, ...state.log].slice(0, 100) };
}

// ─── Party navigation ─────────────────────────────────────────────────────────

export function reduceSetPartySlot(s, slotIdx, name) {
  const currentParty = s.activeParty ?? ['Alek', 'Grigory'];
  const newParty = [...currentParty];
  newParty[slotIdx] = name;

  const activeGuardName = s.guards[s.activeGuardIdx]?.name;
  const activeGuardSlot = currentParty.indexOf(activeGuardName);
  const newActiveGuardIdx = activeGuardSlot === slotIdx
    ? s.guards.findIndex(g => g.name === newParty[0])
    : s.activeGuardIdx;

  return { ...s, activeParty: newParty, activeGuardIdx: newActiveGuardIdx };
}

// ─── Party resources ──────────────────────────────────────────────────────────

export function reduceSetSil(s, delta) {
  const newVal = Math.max(0, s.sil + delta);
  return addLog({ ...s, sil: newVal },
    `Party Sil ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

export function reduceSetLux(s, delta) {
  const newVal = Math.max(0, s.lux + delta);
  return addLog({ ...s, lux: newVal },
    `Party Lux ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

// ─── Guard HP ─────────────────────────────────────────────────────────────────

export function reduceAdjustGuardHp(s, guardIdx, delta) {
  const g = s.guards[guardIdx];
  const newHp = Math.min(g.maxHp, Math.max(0, g.hp + delta));
  const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, hp: newHp } : g2);
  return addLog({ ...s, guards }, `${g.name} HP ${delta >= 0 ? '+' : ''}${delta} → ${newHp}`);
}

export function reduceAdjustGuardMaxHp(s, guardIdx, delta) {
  const g = s.guards[guardIdx];
  const newMax = Math.max(1, g.maxHp + delta);
  const newHp  = Math.min(g.hp, newMax);
  const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, maxHp: newMax, hp: newHp } : g2);
  return addLog({ ...s, guards }, `${g.name} max HP → ${newMax}`);
}

// ─── Guard equipment ──────────────────────────────────────────────────────────

export function reduceSetGuardEquipment(s, guardIdx, slot, value) {
  const g = s.guards[guardIdx];
  const guards = s.guards.map((g2, i) =>
    i === guardIdx ? { ...g2, equipment: { ...g2.equipment, [slot]: value } } : g2
  );
  const newState = { ...s, guards };

  if (value && ALL_EQUIPMENT.has(value)) {
    return addLog(newState, `${g.name} equipped ${value} (${slot})`);
  }
  if (!value) {
    const prev = g.equipment[slot];
    if (prev) return addLog(newState, `${g.name} unequipped ${slot}`);
  }
  return newState;
}

// ─── Guard satchel ────────────────────────────────────────────────────────────

export function reduceSetGuardSatchelItem(s, guardIdx, slotIdx, field, value) {
  const g = s.guards[guardIdx];
  const guards = s.guards.map((gi, i) => {
    if (i !== guardIdx) return gi;
    const satchel = gi.satchel.map((slot, si) =>
      si === slotIdx ? { ...slot, [field]: value } : slot
    );
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
}

// ─── Guard chips ──────────────────────────────────────────────────────────────

export function reduceAdjustChip(s, guardIdx, chipType, delta) {
  const g = s.guards[guardIdx];
  const newVal = Math.max(0, (g.chips[chipType] ?? 0) + delta);
  const guards = s.guards.map((g2, i) =>
    i === guardIdx ? { ...g2, chips: { ...g2.chips, [chipType]: newVal } } : g2
  );
  const msg = delta > 0
    ? `${g.name} +${delta} ${chipType} chip (×${newVal})`
    : `${g.name} −${Math.abs(delta)} ${chipType} chip (×${newVal})`;
  return addLog({ ...s, guards }, msg);
}

export function reduceResetChips(s, guardIdx) {
  const g = s.guards[guardIdx];
  const guards = s.guards.map((g2, i) =>
    i === guardIdx ? { ...g2, chips: { ...g2.chips, black: g2.startingBlack } } : g2
  );
  return addLog({ ...s, guards }, `${g.name} chips reset · black → ${g.startingBlack}`);
}

// ─── Cities ───────────────────────────────────────────────────────────────────

// Prestige is always derived from the three quest booleans — never stored.
export function cityPrestige(city) {
  return [city.puzzleQuestDone, city.bounty1Done, city.bounty2Done].filter(Boolean).length;
}

export function reduceToggleCityQuest(s, cityIdx, field) {
  const city   = s.cities[cityIdx];
  const newVal = !city[field];
  const cities = s.cities.map((c, i) => i === cityIdx ? { ...c, [field]: newVal } : c);
  const questLabel =
    field === 'puzzleQuestDone' ? 'puzzle quest' :
    field === 'bounty1Done'     ? 'bounty 1' :
                                  'bounty 2';
  return addLog({ ...s, cities },
    `${city.name} ${questLabel} ${newVal ? 'completed' : 'reopened'}`
  );
}

// ─── Stash ────────────────────────────────────────────────────────────────────

export function reduceAdjustStash(s, itemName, delta) {
  const current = s.stash[itemName] ?? 0;
  const newVal  = Math.max(0, current + delta);
  const stash   = { ...s.stash, [itemName]: newVal };
  if (newVal === 0) delete stash[itemName];
  return addLog({ ...s, stash },
    `Stash ${itemName} ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

// ─── Stonebound ───────────────────────────────────────────────────────────────

export function reduceSetStoneboundMax(s, delta) {
  const newMax = Math.max(0, s.stonebound.max + delta);
  return addLog(
    { ...s, stonebound: { ...s.stonebound, max: newMax } },
    `Stonebound cube cap → ${newMax}`
  );
}

export function reduceAddStoneboundLocation(s) {
  const locations = [...s.stonebound.locations, { type: '', selection: '', count: 1 }];
  return addLog(
    { ...s, stonebound: { ...s.stonebound, locations } },
    'Stonebound location added'
  );
}

export function reduceRemoveStoneboundLocation(s, idx) {
  const loc       = s.stonebound.locations[idx];
  const locations = s.stonebound.locations.filter((_, i) => i !== idx);
  const label     = loc.selection || 'empty location';
  return addLog(
    { ...s, stonebound: { ...s.stonebound, locations } },
    `Stonebound removed: ${label}`
  );
}

export function reduceUpdateStoneboundLocation(s, idx, field, value) {
  const locations = s.stonebound.locations.map((loc, i) =>
    i === idx ? { ...loc, [field]: value } : loc
  );
  const newState = { ...s, stonebound: { ...s.stonebound, locations } };

  if (field === 'selection' && value) {
    return addLog(newState, `Stonebound location ${idx + 1} → ${value}`);
  }
  if (field === 'count') {
    const loc   = s.stonebound.locations[idx];
    const label = loc.selection || `location ${idx + 1}`;
    return addLog(newState, `Stonebound ${label} cubes → ${value}`);
  }
  return newState;
}
