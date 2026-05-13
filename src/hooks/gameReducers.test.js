/**
 * gameReducers.test.js
 *
 * Unit tests for all pure state-transition functions in gameReducers.js.
 * Tests run with Vitest in a jsdom environment (no browser, no React needed).
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, GUARDS, CITIES } from '../data/constants';
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
  cityPrestige,
  reduceToggleCityQuest,
  reduceAdjustStash,
  reduceSetStoneboundMax,
  reduceAddStoneboundLocation,
  reduceRemoveStoneboundLocation,
  reduceUpdateStoneboundLocation,
} from '../hooks/gameReducers';

// ─── Shared fixture ───────────────────────────────────────────────────────────

let s; // fresh state before each test
beforeEach(() => { s = createInitialState(); });

// ─── createInitialState ───────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('creates 8 guards in campaign order', () => {
    expect(s.guards).toHaveLength(8);
    expect(s.guards.map(g => g.name)).toEqual(GUARDS);
  });

  it('creates 6 cities', () => {
    expect(s.cities).toHaveLength(6);
    expect(s.cities.map(c => c.name)).toEqual(CITIES.map(c => c.name));
  });

  it('starts with Alek and Grigory as the active party', () => {
    expect(s.activeParty).toEqual(['Alek', 'Grigory']);
  });

  it('starts with sil and lux at 0', () => {
    expect(s.sil).toBe(0);
    expect(s.lux).toBe(0);
  });

  it('starts with an empty stash', () => {
    expect(s.stash).toEqual({});
  });

  it('starts with an empty log', () => {
    expect(s.log).toHaveLength(0);
  });

  it('every guard starts at full HP', () => {
    for (const g of s.guards) {
      expect(g.hp).toBe(g.maxHp);
      expect(g.maxHp).toBe(20);
    }
  });

  it('every guard starts with 8 black chips and 0 of the rest', () => {
    for (const g of s.guards) {
      expect(g.chips.black).toBe(8);
      expect(g.chips.green).toBe(0);
      expect(g.chips.red).toBe(0);
      expect(g.chips.purple).toBe(0);
    }
  });

  it('cities do not have a stored prestige field', () => {
    for (const c of s.cities) {
      expect(c).not.toHaveProperty('prestige');
    }
  });
});

// ─── addLog ───────────────────────────────────────────────────────────────────

describe('addLog', () => {
  it('prepends a log entry', () => {
    const next = addLog(s, 'test event');
    expect(next.log[0].message).toBe('test event');
  });

  it('trims log to 100 entries', () => {
    let state = s;
    for (let i = 0; i < 105; i++) state = addLog(state, `event ${i}`);
    expect(state.log).toHaveLength(100);
    // Most recent event is first
    expect(state.log[0].message).toBe('event 104');
  });

  it('does not mutate the original state', () => {
    addLog(s, 'test');
    expect(s.log).toHaveLength(0);
  });
});

// ─── Party slot ───────────────────────────────────────────────────────────────

describe('reduceSetPartySlot', () => {
  it('swaps a guard into the specified slot', () => {
    const next = reduceSetPartySlot(s, 0, 'Catherine');
    expect(next.activeParty[0]).toBe('Catherine');
    expect(next.activeParty[1]).toBe('Grigory');
  });

  it('resets the active guard view when the viewed guard is replaced', () => {
    // activeGuardIdx points to Alek (slot 0); replacing slot 0 → view moves to new slot 0 guard
    const next = reduceSetPartySlot(s, 0, 'Catherine');
    const expectedIdx = next.guards.findIndex(g => g.name === 'Catherine');
    expect(next.activeGuardIdx).toBe(expectedIdx);
  });

  it('does not change activeGuardIdx when a different slot is swapped', () => {
    const next = reduceSetPartySlot(s, 1, 'Catherine');
    expect(next.activeGuardIdx).toBe(s.activeGuardIdx);
  });
});

// ─── Party resources ──────────────────────────────────────────────────────────

describe('reduceSetSil', () => {
  it('increments Sil', () => {
    const next = reduceSetSil(s, 10);
    expect(next.sil).toBe(10);
  });

  it('clamps at 0', () => {
    const next = reduceSetSil(s, -999);
    expect(next.sil).toBe(0);
  });

  it('logs the change', () => {
    const next = reduceSetSil(s, 5);
    expect(next.log[0].message).toContain('Sil');
    expect(next.log[0].message).toContain('+5');
  });
});

describe('reduceSetLux', () => {
  it('increments Lux', () => {
    const next = reduceSetLux(s, 3);
    expect(next.lux).toBe(3);
  });

  it('clamps at 0', () => {
    const next = reduceSetLux(s, -999);
    expect(next.lux).toBe(0);
  });
});

// ─── Guard HP ─────────────────────────────────────────────────────────────────

describe('reduceAdjustGuardHp', () => {
  it('increases HP', () => {
    const lowHp = { ...s, guards: s.guards.map((g, i) => i === 0 ? { ...g, hp: 10 } : g) };
    const next  = reduceAdjustGuardHp(lowHp, 0, 5);
    expect(next.guards[0].hp).toBe(15);
  });

  it('decreases HP', () => {
    const next = reduceAdjustGuardHp(s, 0, -3);
    expect(next.guards[0].hp).toBe(17);
  });

  it('clamps HP at maxHp', () => {
    const next = reduceAdjustGuardHp(s, 0, 999);
    expect(next.guards[0].hp).toBe(s.guards[0].maxHp);
  });

  it('clamps HP at 0', () => {
    const next = reduceAdjustGuardHp(s, 0, -999);
    expect(next.guards[0].hp).toBe(0);
  });

  it('only mutates the targeted guard', () => {
    const next = reduceAdjustGuardHp(s, 0, -5);
    for (let i = 1; i < next.guards.length; i++) {
      expect(next.guards[i].hp).toBe(s.guards[i].hp);
    }
  });

  it('logs the change with guard name', () => {
    const next = reduceAdjustGuardHp(s, 0, -2);
    expect(next.log[0].message).toContain(s.guards[0].name);
    expect(next.log[0].message).toContain('HP');
  });

  it('does not mutate the original state', () => {
    reduceAdjustGuardHp(s, 0, -5);
    expect(s.guards[0].hp).toBe(20);
  });
});

describe('reduceAdjustGuardMaxHp', () => {
  it('increases maxHp', () => {
    const next = reduceAdjustGuardMaxHp(s, 0, 5);
    expect(next.guards[0].maxHp).toBe(25);
  });

  it('clamps maxHp at 1', () => {
    const next = reduceAdjustGuardMaxHp(s, 0, -999);
    expect(next.guards[0].maxHp).toBe(1);
  });

  it('reduces current HP when it exceeds the new maxHp', () => {
    const next = reduceAdjustGuardMaxHp(s, 0, -5);
    expect(next.guards[0].maxHp).toBe(15);
    expect(next.guards[0].hp).toBe(15);
  });

  it('does not increase current HP when maxHp is raised', () => {
    const lowHp = { ...s, guards: s.guards.map((g, i) => i === 0 ? { ...g, hp: 10 } : g) };
    const next  = reduceAdjustGuardMaxHp(lowHp, 0, 5);
    expect(next.guards[0].hp).toBe(10);
  });
});

// ─── Guard equipment ──────────────────────────────────────────────────────────

describe('reduceSetGuardEquipment', () => {
  it('sets a weapon slot', () => {
    const next = reduceSetGuardEquipment(s, 0, 'weapon', 'Jade Sword');
    expect(next.guards[0].equipment.weapon).toBe('Jade Sword');
  });

  it('logs equipping a known item', () => {
    const next = reduceSetGuardEquipment(s, 0, 'weapon', 'Jade Sword');
    expect(next.log[0].message).toContain('Jade Sword');
  });

  it('logs unequipping when value is cleared', () => {
    const equipped = reduceSetGuardEquipment(s, 0, 'weapon', 'Jade Sword');
    const cleared  = reduceSetGuardEquipment(equipped, 0, 'weapon', '');
    expect(cleared.log[0].message).toContain('unequipped');
  });
});

// ─── Guard satchel ────────────────────────────────────────────────────────────

describe('reduceSetGuardSatchelItem', () => {
  it('sets an item in a satchel slot', () => {
    const next = reduceSetGuardSatchelItem(s, 0, 0, 'item', 'Iron');
    expect(next.guards[0].satchel[0].item).toBe('Iron');
  });

  it('logs setting a known material', () => {
    const next = reduceSetGuardSatchelItem(s, 0, 0, 'item', 'Iron');
    expect(next.log[0].message).toContain('Iron');
  });

  it('logs clearing a slot', () => {
    const withItem = reduceSetGuardSatchelItem(s, 0, 0, 'item', 'Iron');
    const cleared  = reduceSetGuardSatchelItem(withItem, 0, 0, 'item', '');
    expect(cleared.log[0].message).toContain('cleared');
  });

  it('logs qty changes when a named item is in the slot', () => {
    const withItem = reduceSetGuardSatchelItem(s, 0, 0, 'item', 'Iron');
    const withQty  = reduceSetGuardSatchelItem(withItem, 0, 0, 'qty', 3);
    expect(withQty.log[0].message).toContain('×3');
  });

  it('does not affect other satchel slots', () => {
    const next = reduceSetGuardSatchelItem(s, 0, 2, 'item', 'Iron');
    expect(next.guards[0].satchel[0].item).toBe('');
    expect(next.guards[0].satchel[1].item).toBe('');
    expect(next.guards[0].satchel[2].item).toBe('Iron');
  });
});

// ─── Chips ────────────────────────────────────────────────────────────────────

describe('reduceAdjustChip', () => {
  it('increments a chip type', () => {
    const next = reduceAdjustChip(s, 0, 'black', 1);
    expect(next.guards[0].chips.black).toBe(9);
  });

  it('decrements a chip type', () => {
    const next = reduceAdjustChip(s, 0, 'black', -1);
    expect(next.guards[0].chips.black).toBe(7);
  });

  it('clamps at 0 (cannot go negative)', () => {
    const next = reduceAdjustChip(s, 0, 'green', -5);
    expect(next.guards[0].chips.green).toBe(0);
  });

  it('adjusts the correct chip type without affecting others', () => {
    const next = reduceAdjustChip(s, 0, 'red', 2);
    expect(next.guards[0].chips.red).toBe(2);
    expect(next.guards[0].chips.black).toBe(8);
    expect(next.guards[0].chips.green).toBe(0);
  });

  it('only mutates the targeted guard', () => {
    const next = reduceAdjustChip(s, 0, 'black', -1);
    expect(next.guards[1].chips.black).toBe(8);
  });

  it('logs increment with + prefix', () => {
    const next = reduceAdjustChip(s, 0, 'green', 1);
    expect(next.log[0].message).toContain('+1');
  });

  it('logs decrement with − prefix', () => {
    const next = reduceAdjustChip(s, 0, 'black', -1);
    expect(next.log[0].message).toMatch(/−1/);
  });
});

describe('reduceResetChips', () => {
  it('restores black chips to startingBlack', () => {
    const depleted = reduceAdjustChip(s, 0, 'black', -5);
    const reset    = reduceResetChips(depleted, 0);
    expect(reset.guards[0].chips.black).toBe(s.guards[0].startingBlack);
  });

  it('does not change non-black chips', () => {
    const withRed = reduceAdjustChip(s, 0, 'red', 3);
    const reset   = reduceResetChips(withRed, 0);
    expect(reset.guards[0].chips.red).toBe(3);
  });

  it('logs the reset', () => {
    const next = reduceResetChips(s, 0);
    expect(next.log[0].message).toContain('reset');
    expect(next.log[0].message).toContain('black');
  });

  it('only resets the targeted guard', () => {
    const depleted = reduceAdjustChip(s, 0, 'black', -5);
    const reset    = reduceResetChips(depleted, 0);
    expect(reset.guards[1].chips.black).toBe(8);
  });
});

// ─── Cities ───────────────────────────────────────────────────────────────────

describe('cityPrestige', () => {
  it('returns 0 when no quests are done', () => {
    expect(cityPrestige(s.cities[0])).toBe(0);
  });

  it('returns 1 when only puzzle quest is done', () => {
    expect(cityPrestige({ puzzleQuestDone: true, bounty1Done: false, bounty2Done: false })).toBe(1);
  });

  it('returns 3 when all quests are done', () => {
    expect(cityPrestige({ puzzleQuestDone: true, bounty1Done: true, bounty2Done: true })).toBe(3);
  });
});

describe('reduceToggleCityQuest', () => {
  it('marks a quest as completed', () => {
    const next = reduceToggleCityQuest(s, 0, 'puzzleQuestDone');
    expect(next.cities[0].puzzleQuestDone).toBe(true);
  });

  it('toggles a completed quest back to incomplete', () => {
    const done   = reduceToggleCityQuest(s, 0, 'puzzleQuestDone');
    const undone = reduceToggleCityQuest(done, 0, 'puzzleQuestDone');
    expect(undone.cities[0].puzzleQuestDone).toBe(false);
  });

  it('does not affect other cities', () => {
    const next = reduceToggleCityQuest(s, 0, 'bounty1Done');
    for (let i = 1; i < next.cities.length; i++) {
      expect(next.cities[i].bounty1Done).toBe(false);
    }
  });

  it('logs completion with city name and quest label', () => {
    const next = reduceToggleCityQuest(s, 0, 'puzzleQuestDone');
    expect(next.log[0].message).toContain(s.cities[0].name);
    expect(next.log[0].message).toContain('puzzle quest');
    expect(next.log[0].message).toContain('completed');
  });

  it('logs reopening', () => {
    const done = reduceToggleCityQuest(s, 0, 'bounty1Done');
    const next = reduceToggleCityQuest(done, 0, 'bounty1Done');
    expect(next.log[0].message).toContain('reopened');
  });

  it('prestige increments when a quest is completed', () => {
    const next = reduceToggleCityQuest(s, 0, 'puzzleQuestDone');
    expect(cityPrestige(next.cities[0])).toBe(1);
  });
});

// ─── Stash ────────────────────────────────────────────────────────────────────

describe('reduceAdjustStash', () => {
  it('adds an item to an empty stash', () => {
    const next = reduceAdjustStash(s, 'Iron', 3);
    expect(next.stash['Iron']).toBe(3);
  });

  it('increments an existing item', () => {
    const s3   = reduceAdjustStash(s, 'Iron', 3);
    const next = reduceAdjustStash(s3, 'Iron', 2);
    expect(next.stash['Iron']).toBe(5);
  });

  it('decrements an item', () => {
    const s3   = reduceAdjustStash(s, 'Iron', 3);
    const next = reduceAdjustStash(s3, 'Iron', -1);
    expect(next.stash['Iron']).toBe(2);
  });

  it('removes the key when quantity reaches 0', () => {
    const s1   = reduceAdjustStash(s, 'Iron', 1);
    const next = reduceAdjustStash(s1, 'Iron', -1);
    expect(Object.hasOwn(next.stash, 'Iron')).toBe(false);
  });

  it('clamps at 0 (cannot go negative)', () => {
    const next = reduceAdjustStash(s, 'Iron', -5);
    expect(Object.hasOwn(next.stash, 'Iron')).toBe(false);
  });

  it('tracks multiple items independently', () => {
    const s1 = reduceAdjustStash(s, 'Iron', 2);
    const s2 = reduceAdjustStash(s1, 'Silver', 4);
    expect(s2.stash['Iron']).toBe(2);
    expect(s2.stash['Silver']).toBe(4);
  });

  it('logs the change', () => {
    const next = reduceAdjustStash(s, 'Iron', 2);
    expect(next.log[0].message).toContain('Iron');
    expect(next.log[0].message).toContain('+2');
  });
});

// ─── Stonebound ───────────────────────────────────────────────────────────────

describe('reduceSetStoneboundMax', () => {
  it('increases the cube cap', () => {
    const next = reduceSetStoneboundMax(s, 2);
    expect(next.stonebound.max).toBe(6);
  });

  it('decreases the cube cap', () => {
    const next = reduceSetStoneboundMax(s, -1);
    expect(next.stonebound.max).toBe(3);
  });

  it('clamps at 0', () => {
    const next = reduceSetStoneboundMax(s, -999);
    expect(next.stonebound.max).toBe(0);
  });

  it('logs the change', () => {
    const next = reduceSetStoneboundMax(s, 1);
    expect(next.log[0].message).toContain('cube cap');
  });
});

describe('reduceAddStoneboundLocation', () => {
  it('adds a new empty location', () => {
    const next = reduceAddStoneboundLocation(s);
    expect(next.stonebound.locations).toHaveLength(1);
    expect(next.stonebound.locations[0]).toEqual({ type: '', selection: '', count: 1 });
  });

  it('can add multiple locations', () => {
    const s1 = reduceAddStoneboundLocation(s);
    const s2 = reduceAddStoneboundLocation(s1);
    expect(s2.stonebound.locations).toHaveLength(2);
  });

  it('logs the addition', () => {
    const next = reduceAddStoneboundLocation(s);
    expect(next.log[0].message).toContain('location added');
  });
});

describe('reduceRemoveStoneboundLocation', () => {
  it('removes the location at the given index', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const s2   = reduceAddStoneboundLocation(s1);
    const next = reduceRemoveStoneboundLocation(s2, 0);
    expect(next.stonebound.locations).toHaveLength(1);
  });

  it('logs removal with the selection name when present', () => {
    const s1 = reduceAddStoneboundLocation(s);
    const s2 = reduceUpdateStoneboundLocation(s1, 0, 'selection', 'Mir');
    const next = reduceRemoveStoneboundLocation(s2, 0);
    expect(next.log[0].message).toContain('Mir');
  });

  it('logs removal with "empty location" when no selection', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const next = reduceRemoveStoneboundLocation(s1, 0);
    expect(next.log[0].message).toContain('empty location');
  });
});

describe('reduceUpdateStoneboundLocation', () => {
  let s1;
  beforeEach(() => { s1 = reduceAddStoneboundLocation(s); });

  it('updates the selection field', () => {
    const next = reduceUpdateStoneboundLocation(s1, 0, 'selection', 'Mir');
    expect(next.stonebound.locations[0].selection).toBe('Mir');
  });

  it('logs a selection change', () => {
    const next = reduceUpdateStoneboundLocation(s1, 0, 'selection', 'Mir');
    expect(next.log[0].message).toContain('Mir');
  });

  it('updates the cube count', () => {
    const next = reduceUpdateStoneboundLocation(s1, 0, 'count', 3);
    expect(next.stonebound.locations[0].count).toBe(3);
  });

  it('logs a cube count change', () => {
    const next = reduceUpdateStoneboundLocation(s1, 0, 'count', 2);
    expect(next.log[0].message).toContain('cubes → 2');
  });

  it('does not affect other locations', () => {
    const s2   = reduceAddStoneboundLocation(s1);
    const next = reduceUpdateStoneboundLocation(s2, 0, 'selection', 'Mir');
    expect(next.stonebound.locations[1].selection).toBe('');
  });
});
