/**
 * gameReducers.test.js
 *
 * Unit tests for all pure state-transition functions in gameReducers.js.
 * Tests run with Vitest in a jsdom environment (no browser, no React needed).
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  createInitialResources,
  createInitialCities,
  createInitialGuards,
  createInitialStash,
  createInitialCampaign,
  GUARDS,
  CITIES,
} from '../data/constants';
import {
  addLog,
  compactTombstones,
  deriveUndoLabel,
  reduceSetPartySlot,
  reduceSetSil,
  reduceSetLux,
  reduceAdjustGuardHp,
  reduceAdjustGuardMaxHp,

  cityPrestige,
  isPuzzleQuestCompleted,
  reduceTogglePuzzleQuestComplete,
  reduceAdjustStash,
  reduceSetStoneboundMax,
  reduceAddStoneboundLocation,
  reduceRemoveStoneboundLocation,
  reduceUpdateStoneboundLocation,
  reduceToggleEncounterComplete,
  isEncounterCompleted,
  normalizeCompletedEncounters,
  reduceToggleBountyComplete,
  isBountyCompleted,
  reduceSetCampaign,

  reduceSetEventToken,
  reduceResetEventToken,
  reduceSetCampaignLocation,
  reduceAddDynamicLocation,
  reduceUpdateDynamicLocation,
  reduceRemoveDynamicLocation,
  reduceAddPlan,
  reduceTogglePlan,
  reduceDeletePlan,
} from '../hooks/gameReducers';
import { colorizeLogMessage } from '../utils/logUtils';
import { healState, migrateV1 } from '../hooks/useGameState';
import { groupEncounters } from '../data/encounters';
import { bountiesForCity } from '../data/bounties';
import { puzzleQuestForCity } from '../data/puzzleQuests';

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
    expect(s.log).toEqual([]);
  });

  it('starts with default stonebound', () => {
    expect(s.stonebound).toEqual({ max: 4, locations: [] });
  });

  it('starts with zeroed event tokens', () => {
    expect(s.campaign.eventTokens).toEqual({ mountain: 0, forest: 0, plains: 0, sea: 0 });
  });
});

// ─── Section factories ────────────────────────────────────────────────────────

describe('createInitialResources', () => {
  it('returns sil and lux at 0', () => {
    expect(createInitialResources()).toEqual({ sil: 0, lux: 0 });
  });
});

describe('createInitialCities', () => {
  it('returns 6 cities', () => {
    expect(createInitialCities().cities).toHaveLength(6);
  });
});

describe('createInitialGuards', () => {
  it('returns guards array, activeParty, and activeGuardIdx', () => {
    const g = createInitialGuards();
    expect(g.guards).toHaveLength(8);
    expect(g.activeParty).toEqual(['Alek', 'Grigory']);
    expect(g.activeGuardIdx).toBe(0);
  });
});

describe('createInitialStash', () => {
  it('returns empty stash and default stonebound', () => {
    const st = createInitialStash();
    expect(st.stash).toEqual({});
    expect(st.stonebound).toEqual({ max: 4, locations: [] });
  });
});

describe('createInitialCampaign', () => {
  it('returns campaign with zeroed event tokens', () => {
    const c = createInitialCampaign();
    expect(c.campaign.eventTokens).toEqual({ mountain: 0, forest: 0, plains: 0, sea: 0 });
  });

  it('returns campaign with empty plans', () => {
    expect(createInitialCampaign().campaign.plans).toEqual([]);
  });

  it('returns campaign with empty ftIstraBuildings map', () => {
    expect(createInitialCampaign().campaign.ftIstraBuildings).toEqual({});
  });

  it('returns campaign with empty completedEncounters', () => {
    expect(createInitialCampaign().campaign.completedEncounters).toEqual([]);
  });

  it('returns campaign with empty completedBounties', () => {
    expect(createInitialCampaign().campaign.completedBounties).toEqual([]);
  });
});

// ─── Ft. Istra building state ─────────────────────────────────────────────────

describe('ftIstraBuildings', () => {
  it('starts with empty map in initial state', () => {
    expect(s.campaign.ftIstraBuildings).toEqual({});
  });

  it('defaults unknown building to not_owned', () => {
    expect(s.campaign.ftIstraBuildings['Lumbermill'] ?? 'not_owned').toBe('not_owned');
  });

  it('transitions from not_owned to built via inline setState pattern', () => {
    const next = {
      ...s,
      campaign: {
        ...s.campaign,
        ftIstraBuildings: {
          ...s.campaign.ftIstraBuildings,
          Lumbermill: 'built',
        },
      },
    };
    expect(next.campaign.ftIstraBuildings['Lumbermill']).toBe('built');
  });

  it('transitions from built to upgraded', () => {
    const mid = {
      ...s,
      campaign: {
        ...s.campaign,
        ftIstraBuildings: { ...s.campaign.ftIstraBuildings, Lapidary: 'built' },
      },
    };
    const next = {
      ...mid,
      campaign: {
        ...mid.campaign,
        ftIstraBuildings: { ...mid.campaign.ftIstraBuildings, Lapidary: 'upgraded' },
      },
    };
    expect(next.campaign.ftIstraBuildings['Lapidary']).toBe('upgraded');
  });

  it('preserves other buildings when updating one', () => {
    const mid = {
      ...s,
      campaign: {
        ...s.campaign,
        ftIstraBuildings: {
          ...s.campaign.ftIstraBuildings,
          Lumbermill: 'built',
          Lapidary: 'built',
        },
      },
    };
    const next = {
      ...mid,
      campaign: {
        ...mid.campaign,
        ftIstraBuildings: { ...mid.campaign.ftIstraBuildings, Lapidary: 'upgraded' },
      },
    };
    expect(next.campaign.ftIstraBuildings['Lumbermill']).toBe('built');
    expect(next.campaign.ftIstraBuildings['Lapidary']).toBe('upgraded');
  });
});

// ─── Encounter completion ──────────────────────────────────────────────────────

describe('reduceToggleEncounterComplete', () => {
  it('adds an id-keyed element when the encounter is not completed', () => {
    const next = reduceToggleEncounterComplete({ campaign: { completedEncounters: [] } }, 'be-flexible');
    expect(next.campaign.completedEncounters).toEqual([{ id: 'be-flexible' }]);
    expect(isEncounterCompleted(next.campaign.completedEncounters, 'be-flexible')).toBe(true);
  });

  it('tombstones (does not drop) an encounter when un-completing it', () => {
    const next = reduceToggleEncounterComplete(
      { campaign: { completedEncounters: [{ id: 'be-flexible' }] } }, 'be-flexible'
    );
    // The element is kept and marked deleted so the change syncs through the
    // append/union-only server merge, instead of being silently restored.
    expect(next.campaign.completedEncounters).toEqual([{ id: 'be-flexible', deleted: true }]);
    expect(isEncounterCompleted(next.campaign.completedEncounters, 'be-flexible')).toBe(false);
  });

  it('re-completes a previously un-completed encounter by clearing the tombstone', () => {
    const state = { campaign: { completedEncounters: [{ id: 'be-flexible', deleted: true }] } };
    const next = reduceToggleEncounterComplete(state, 'be-flexible');
    expect(next.campaign.completedEncounters).toEqual([{ id: 'be-flexible' }]);
    expect(isEncounterCompleted(next.campaign.completedEncounters, 'be-flexible')).toBe(true);
  });

  it('preserves other completed encounters when toggling one', () => {
    const state = { campaign: { completedEncounters: [{ id: 'be-flexible' }, { id: 'ice-cold' }] } };
    const next = reduceToggleEncounterComplete(state, 'ice-cold');
    expect(next.campaign.completedEncounters).toEqual([{ id: 'be-flexible' }, { id: 'ice-cold', deleted: true }]);
  });

  it('preserves other completed encounters when adding one', () => {
    const state = { campaign: { completedEncounters: [{ id: 'be-flexible' }] } };
    const next = reduceToggleEncounterComplete(state, 'ice-cold');
    expect(next.campaign.completedEncounters).toEqual([{ id: 'be-flexible' }, { id: 'ice-cold' }]);
  });
});

describe('isEncounterCompleted', () => {
  it('is true for a present, non-tombstoned element', () => {
    expect(isEncounterCompleted([{ id: 'a' }], 'a')).toBe(true);
  });
  it('is false for a tombstoned element', () => {
    expect(isEncounterCompleted([{ id: 'a', deleted: true }], 'a')).toBe(false);
  });
  it('is false for an absent element', () => {
    expect(isEncounterCompleted([{ id: 'a' }], 'b')).toBe(false);
  });
  it('tolerates a null/undefined list', () => {
    expect(isEncounterCompleted(undefined, 'a')).toBe(false);
  });
});

describe('reduceToggleBountyComplete', () => {
  it('marks a bounty complete by adding its id', () => {
    const next = reduceToggleBountyComplete({ campaign: { completedBounties: [] } }, 'mir-c1-stone-idols');
    expect(next.campaign.completedBounties).toEqual([{ id: 'mir-c1-stone-idols' }]);
    expect(isBountyCompleted(next.campaign.completedBounties, 'mir-c1-stone-idols')).toBe(true);
  });

  it('tombstones (does not drop) a bounty when un-completing it', () => {
    const next = reduceToggleBountyComplete(
      { campaign: { completedBounties: [{ id: 'mir-c1-stone-idols' }] } }, 'mir-c1-stone-idols'
    );
    expect(next.campaign.completedBounties).toEqual([{ id: 'mir-c1-stone-idols', deleted: true }]);
    expect(isBountyCompleted(next.campaign.completedBounties, 'mir-c1-stone-idols')).toBe(false);
  });

  it('re-completes a previously un-completed bounty by clearing the tombstone', () => {
    const state = { campaign: { completedBounties: [{ id: 'mir-c1-stone-idols', deleted: true }] } };
    const next = reduceToggleBountyComplete(state, 'mir-c1-stone-idols');
    expect(next.campaign.completedBounties).toEqual([{ id: 'mir-c1-stone-idols' }]);
  });

  it('preserves other campaigns’ completed bounties when toggling one', () => {
    // Completing a campaign-2 bounty must not disturb the campaign-1 record —
    // the guarantee that switching campaigns and back preserves reputation.
    const state = { campaign: { completedBounties: [{ id: 'mir-c1-stone-idols' }] } };
    const next = reduceToggleBountyComplete(state, 'mir-c2-lurking-in-the-shadows');
    expect(next.campaign.completedBounties).toEqual([
      { id: 'mir-c1-stone-idols' },
      { id: 'mir-c2-lurking-in-the-shadows' },
    ]);
    expect(isBountyCompleted(next.campaign.completedBounties, 'mir-c1-stone-idols')).toBe(true);
  });
});

describe('isBountyCompleted', () => {
  it('is true for a present, non-tombstoned element', () => {
    expect(isBountyCompleted([{ id: 'a' }], 'a')).toBe(true);
  });
  it('is false for a tombstoned element', () => {
    expect(isBountyCompleted([{ id: 'a', deleted: true }], 'a')).toBe(false);
  });
  it('tolerates a null/undefined list', () => {
    expect(isBountyCompleted(undefined, 'a')).toBe(false);
  });
});

describe('normalizeCompletedEncounters', () => {
  it('converts a pre-AVE-287 string array to id-keyed objects', () => {
    expect(normalizeCompletedEncounters(['a', 'b'])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
  it('leaves already-normalized objects intact (including tombstones)', () => {
    expect(normalizeCompletedEncounters([{ id: 'a' }, { id: 'b', deleted: true }]))
      .toEqual([{ id: 'a' }, { id: 'b', deleted: true }]);
  });
  it('drops malformed entries and non-arrays', () => {
    expect(normalizeCompletedEncounters([{ nope: 1 }, null, 5])).toEqual([]);
    expect(normalizeCompletedEncounters(undefined)).toEqual([]);
  });
  it('dedupes same-id entries, keeping the first occurrence (AVE-370 repair)', () => {
    // The buggy legacy puzzle-quest migration appended a live duplicate next
    // to a tombstone on every load. The first entry is the user's real toggle.
    expect(normalizeCompletedEncounters([{ id: 'a', deleted: true }, { id: 'a' }, { id: 'b' }]))
      .toEqual([{ id: 'a', deleted: true }, { id: 'b' }]);
  });
});

// ─── addLog ───────────────────────────────────────────────────────────────────

describe('addLog', () => {
  it('prepends a log entry', () => {
    const next = addLog(s, 'test message');
    expect(next.log[0].message).toBe('test message');
  });

  it('caps log at 100 entries', () => {
    let state = s;
    for (let i = 0; i < 105; i++) state = addLog(state, `entry ${i}`);
    expect(state.log).toHaveLength(100);
  });
});

// ─── Party navigation ─────────────────────────────────────────────────────────

describe('reduceSetPartySlot', () => {
  it('replaces a guard in the active party', () => {
    const next = reduceSetPartySlot(s, 1, 'Catherine');
    expect(next.activeParty[1]).toBe('Catherine');
  });

  it('keeps the other party slot unchanged', () => {
    const next = reduceSetPartySlot(s, 1, 'Catherine');
    expect(next.activeParty[0]).toBe('Alek');
  });

  it('preserves activeGuardIdx when a non-viewed slot is swapped', () => {
    // activeGuardIdx=0 → viewing Grigory (guards[0]), who is in party slot 1.
    // Swapping slot 0 (Alek) does not affect the viewed guard.
    const next = reduceSetPartySlot(s, 0, 'Catherine');
    expect(next.activeGuardIdx).toBe(s.activeGuardIdx);
  });

  it('updates activeGuardIdx when the viewed guard is replaced', () => {
    // activeGuardIdx=0 → viewing Grigory (guards[0]), who is in party slot 1.
    // Replacing slot 1 replaces the viewed guard → activeGuardIdx should move
    // to the guard now in the changed slot (newParty[1] = Catherine, guards index 2).
    const next        = reduceSetPartySlot(s, 1, 'Catherine');
    const expectedIdx = next.guards.findIndex(g => g.name === next.activeParty[1]);
    expect(next.activeGuardIdx).toBe(expectedIdx);
  });

  it('resets the active guard view when the viewed guard is replaced', () => {
    // Same as above — confirms the view lands on a guard still in the party.
    const next         = reduceSetPartySlot(s, 1, 'Catherine');
    const viewedGuard  = next.guards[next.activeGuardIdx]?.name;
    expect(next.activeParty).toContain(viewedGuard);
  });

  it('does not change activeGuardIdx when a different slot is swapped', () => {
    // Replacing slot 0 (Alek) leaves Grigory (guards[0]) as the viewed guard.
    const next = reduceSetPartySlot(s, 0, 'Catherine');
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

  it('clamps at 0', () => {
    const next = reduceAdjustGuardHp(s, 0, -999);
    expect(next.guards[0].hp).toBe(0);
  });

  it('clamps at maxHp', () => {
    const next = reduceAdjustGuardHp(s, 0, 999);
    expect(next.guards[0].hp).toBe(s.guards[0].maxHp);
  });

  it('only mutates the targeted guard', () => {
    const next = reduceAdjustGuardHp(s, 0, -5);
    expect(next.guards[1].hp).toBe(s.guards[1].hp);
  });

  it('logs the change', () => {
    const next = reduceAdjustGuardHp(s, 0, -3);
    expect(next.log[0].message).toContain(s.guards[0].name);
    expect(next.log[0].message).toContain('HP');
  });
});

describe('reduceAdjustGuardMaxHp', () => {
  it('increases max HP', () => {
    const next = reduceAdjustGuardMaxHp(s, 0, 5);
    expect(next.guards[0].maxHp).toBe(25);
  });

  it('clamps maxHp at 1', () => {
    const next = reduceAdjustGuardMaxHp(s, 0, -999);
    expect(next.guards[0].maxHp).toBe(1);
  });

  it('reduces current HP to new max when max drops below current', () => {
    const next = reduceAdjustGuardMaxHp(s, 0, -5);
    expect(next.guards[0].hp).toBeLessThanOrEqual(next.guards[0].maxHp);
  });
});

// ─── Campaign / Chapter ────────────────────────────────────────────────────────

describe('reduceSetCampaign', () => {
  it('sets the campaign', () => {
    const next = reduceSetCampaign(s, 2);
    expect(next.campaign.campaignId).toBe(2);
  });

  it('allows switching campaigns', () => {
    const withC = reduceSetCampaign(s, 3);
    const next  = reduceSetCampaign(withC, 1);
    expect(next.campaign.campaignId).toBe(1);
  });
});

// ─── Cities ───────────────────────────────────────────────────────────────────

describe('cityPrestige', () => {
  it('returns 0 when nothing is done', () => {
    expect(cityPrestige(s.cities[0], 1, [], [])).toBe(0);
  });

  it('returns 1 when only the puzzle quest is done', () => {
    const quest = puzzleQuestForCity('Mir', 1);
    expect(cityPrestige({ name: 'Mir' }, 1, [], [{ id: quest.id }])).toBe(1);
  });

  it('counts completed campaign bounties toward reputation', () => {
    const mir = s.cities.find(c => c.name === 'Mir');
    const [b1, b2] = bountiesForCity('Mir', 1);
    const completed = [{ id: b1.id }, { id: b2.id }];
    // both campaign-1 bounties done, puzzle not done → 2
    expect(cityPrestige(mir, 1, completed, [])).toBe(2);
    // plus puzzle quest → 3 (max)
    const quest = puzzleQuestForCity('Mir', 1);
    expect(cityPrestige(mir, 1, completed, [{ id: quest.id }])).toBe(3);
  });

  it('is campaign-scoped: a campaign 1 bounty does not raise campaign 2 reputation', () => {
    const mir = s.cities.find(c => c.name === 'Mir');
    const [b1] = bountiesForCity('Mir', 1);
    const completed = [{ id: b1.id }];
    expect(cityPrestige(mir, 1, completed, [])).toBe(1); // visible in campaign 1
    expect(cityPrestige(mir, 2, completed, [])).toBe(0); // not in campaign 2
    // …and switching back to campaign 1 still reflects it (derivation is pure)
    expect(cityPrestige(mir, 1, completed, [])).toBe(1);
  });

  it('ignores tombstoned (un-completed) bounties', () => {
    const mir = s.cities.find(c => c.name === 'Mir');
    const [b1] = bountiesForCity('Mir', 1);
    expect(cityPrestige(mir, 1, [{ id: b1.id, deleted: true }], [])).toBe(0);
  });

  it('is campaign-scoped for the puzzle quest too', () => {
    const mir = s.cities.find(c => c.name === 'Mir');
    const questC1 = puzzleQuestForCity('Mir', 1);
    expect(cityPrestige(mir, 1, [], [{ id: questC1.id }])).toBe(1);
    expect(cityPrestige(mir, 2, [], [{ id: questC1.id }])).toBe(0);
  });

  it('ignores tombstoned (un-completed) puzzle quests', () => {
    const mir = s.cities.find(c => c.name === 'Mir');
    const quest = puzzleQuestForCity('Mir', 1);
    expect(cityPrestige(mir, 1, [], [{ id: quest.id, deleted: true }])).toBe(0);
  });
});

describe('reduceTogglePuzzleQuestComplete', () => {
  const questId = puzzleQuestForCity('Mir', 1).id;

  it('marks a puzzle quest as completed', () => {
    const next = reduceTogglePuzzleQuestComplete(s, questId);
    expect(isPuzzleQuestCompleted(next.campaign.completedPuzzleQuests, questId)).toBe(true);
  });

  it('toggles a completed quest back to incomplete via tombstone', () => {
    const done   = reduceTogglePuzzleQuestComplete(s, questId);
    const undone = reduceTogglePuzzleQuestComplete(done, questId);
    expect(isPuzzleQuestCompleted(undone.campaign.completedPuzzleQuests, questId)).toBe(false);
  });

  it('prestige increments when a puzzle quest is completed', () => {
    const next = reduceTogglePuzzleQuestComplete(s, questId);
    const mir  = next.cities.find(c => c.name === 'Mir');
    expect(cityPrestige(mir, 1, [], next.campaign.completedPuzzleQuests)).toBe(1);
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

  it('keeps a 0-count tombstone when quantity reaches 0 (AVE-369)', () => {
    // Deleting the key never propagates through the server's field-level
    // merge (keys absent from the payload are preserved), so the write's own
    // Realtime echo resurrected the item. A 0 entry syncs like any value.
    const s1   = reduceAdjustStash(s, 'Iron', 1);
    const next = reduceAdjustStash(s1, 'Iron', -1);
    expect(next.stash['Iron']).toBe(0);
  });

  it('clamps at 0 without materializing a key for an absent item', () => {
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
  it('adds a new empty location with a numeric id', () => {
    const next = reduceAddStoneboundLocation(s);
    expect(next.stonebound.locations).toHaveLength(1);
    expect(next.stonebound.locations[0]).toEqual(
      expect.objectContaining({ type: '', selection: '', count: 1 })
    );
    expect(typeof next.stonebound.locations[0].id).toBe('number');
  });

  it('assigns unique ids to each location', () => {
    const s1 = reduceAddStoneboundLocation(s);
    const s2 = reduceAddStoneboundLocation(s1);
    expect(s2.stonebound.locations[0].id).not.toBe(s2.stonebound.locations[1].id);
  });

  it('can add multiple locations', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const s2   = reduceAddStoneboundLocation(s1);
    expect(s2.stonebound.locations).toHaveLength(2);
  });

  it('logs the addition', () => {
    const next = reduceAddStoneboundLocation(s);
    expect(next.log[0].message).toContain('location added');
  });
});

describe('reduceRemoveStoneboundLocation', () => {
  it('tombstones the location with the given id (keeps it, marks deleted)', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const s2   = reduceAddStoneboundLocation(s1);
    const id   = s2.stonebound.locations[0].id;
    const next = reduceRemoveStoneboundLocation(s2, id);
    // Kept in the array so the delete syncs through the append-only merge.
    expect(next.stonebound.locations).toHaveLength(2);
    const target = next.stonebound.locations.find(l => l.id === id);
    expect(target.deleted).toBe(true);
    // Other locations are left untouched.
    expect(next.stonebound.locations.find(l => l.id !== id).deleted).toBeUndefined();
  });

  it('logs removal with the selection name when present', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const id   = s1.stonebound.locations[0].id;
    const s2   = reduceUpdateStoneboundLocation(s1, id, 'selection', 'Mir');
    const next = reduceRemoveStoneboundLocation(s2, id);
    expect(next.log[0].message).toContain('Mir');
  });

  it('logs removal with "empty location" when no selection', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const id   = s1.stonebound.locations[0].id;
    const next = reduceRemoveStoneboundLocation(s1, id);
    expect(next.log[0].message).toContain('empty location');
  });
});

describe('reduceUpdateStoneboundLocation', () => {
  let s1, id;
  beforeEach(() => {
    s1 = reduceAddStoneboundLocation(s);
    id = s1.stonebound.locations[0].id;
  });

  it('updates the selection field', () => {
    const next = reduceUpdateStoneboundLocation(s1, id, 'selection', 'Mir');
    expect(next.stonebound.locations[0].selection).toBe('Mir');
  });

  it('logs a selection change', () => {
    const next = reduceUpdateStoneboundLocation(s1, id, 'selection', 'Mir');
    expect(next.log[0].message).toContain('Mir');
  });

  it('updates the cube count', () => {
    const next = reduceUpdateStoneboundLocation(s1, id, 'count', 3);
    expect(next.stonebound.locations[0].count).toBe(3);
  });

  it('logs a cube count change', () => {
    const next = reduceUpdateStoneboundLocation(s1, id, 'count', 2);
    expect(next.log[0].message).toContain('cubes → 2');
  });

  it('does not affect other locations', () => {
    const s2    = reduceAddStoneboundLocation(s1);
    const id2   = s2.stonebound.locations[0].id;
    const next  = reduceUpdateStoneboundLocation(s2, id2, 'selection', 'Mir');
    expect(next.stonebound.locations[1].selection).toBe('');
  });

  it('finds the target by id even when array order changes', () => {
    const s2    = reduceAddStoneboundLocation(s1);
    const id0   = s2.stonebound.locations[0].id;
    const swapped = {
      ...s2,
      stonebound: {
        ...s2.stonebound,
        locations: [s2.stonebound.locations[1], s2.stonebound.locations[0]],
      },
    };
    const next = reduceUpdateStoneboundLocation(swapped, id0, 'selection', 'Mir');
    expect(next.stonebound.locations[0].selection).toBe('');
    expect(next.stonebound.locations[1].selection).toBe('Mir');
  });
});

// ─── colorizeLogMessage (XSS prevention) ─────────────────────────────────────

describe('colorizeLogMessage', () => {
  it('returns a single string when no names match', () => {
    const result = colorizeLogMessage('some random text');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('some random text');
    expect(typeof result[0]).toBe('string');
  });

  it('wraps guard names in colored spans', () => {
    const result = colorizeLogMessage('Alek gained 5 HP');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('');
    expect(result[1].type).toBe('span');
    expect(result[1].props.className).toBe('log-name-gold');
    expect(result[1].props.children).toBe('Alek');
    expect(result[2]).toBe(' gained 5 HP');
  });

  it('wraps Party and Stash in strong tags', () => {
    const result = colorizeLogMessage('Party sold item to Stash');
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('');
    expect(result[1].type).toBe('strong');
    expect(result[1].props.children).toBe('Party');
    expect(result[2]).toBe(' sold item to ');
    expect(result[3].type).toBe('strong');
    expect(result[3].props.children).toBe('Stash');
    expect(result[4]).toBe('');
  });

  it('highlights all guard names in a message', () => {
    const result = colorizeLogMessage('Alek and Grigory fought');
    expect(result).toHaveLength(5);
    expect(result[1].props.children).toBe('Alek');
    expect(result[1].props.className).toBe('log-name-gold');
    expect(result[3].props.children).toBe('Grigory');
    expect(result[3].props.className).toBe('log-name-amber');
  });

  it('returns untampered user input as plain strings (XSS prevention)', () => {
    const xss = '<img src=x onerror=alert(1)>';
    const result = colorizeLogMessage(xss);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(xss);
    expect(typeof result[0]).toBe('string');
  });

  it('wraps Stonebound in a strong tag', () => {
    const result = colorizeLogMessage('Stonebound cube cap → 4');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('');
    expect(result[1].type).toBe('strong');
    expect(result[1].props.children).toBe('Stonebound');
    expect(result[2]).toBe(' cube cap → 4');
  });

  it('wraps city names in strong tags', () => {
    const result = colorizeLogMessage('Mir puzzle quest completed');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('');
    expect(result[1].type).toBe('strong');
    expect(result[1].props.children).toBe('Mir');
    expect(result[2]).toBe(' puzzle quest completed');
  });

  it('wraps multiple city names alongside guard names', () => {
    const result = colorizeLogMessage('Alek traveled to Razdor from Mir');
    expect(result).toHaveLength(7);
    expect(result[1].props.children).toBe('Alek');
    expect(result[3].props.children).toBe('Razdor');
    expect(result[3].type).toBe('strong');
    expect(result[5].props.children).toBe('Mir');
    expect(result[5].type).toBe('strong');
  });

  it('leaves HTML-looking user text as plain strings when next to a name', () => {
    const result = colorizeLogMessage('Alek found <script>bad()</script>');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('');
    expect(result[1].props.children).toBe('Alek');
    expect(result[2]).toBe(' found <script>bad()</script>');
    expect(typeof result[2]).toBe('string');
  });
});

// ─── groupEncounters (regression — unsorted input) ──────────────────────────

describe('groupEncounters', () => {
  it('merges non-adjacent fights with the same campaign into one group', () => {
    const fights = [
      { id: 'a', name: 'A', campaignReq: 'Campaign 1' },
      { id: 'b', name: 'B', campaignReq: 'Campaign 3' },
      { id: 'c', name: 'C', campaignReq: 'Campaign 1' },
      { id: 'd', name: 'D', campaignReq: 'Campaign 2' },
    ];
    const groups = groupEncounters(fights, 0);
    expect(groups).toHaveLength(3);
    const c1 = groups.find(g => g.group.id === 1);
    expect(c1.fights.map(f => f.id)).toEqual(['a', 'c']);
  });

  it('produces no duplicate group headers for unsorted data', () => {
    const fights = [
      { id: 'a', name: 'A', campaignReq: 'Any Campaign' },
      { id: 'b', name: 'B', campaignReq: 'Campaign 1' },
      { id: 'c', name: 'C', campaignReq: 'Campaign 3' },
      { id: 'd', name: 'D', campaignReq: 'Any Campaign' },
      { id: 'e', name: 'E', campaignReq: 'Campaign 1' },
    ];
    const groups = groupEncounters(fights, 0);
    const ids = groups.map(g => g.group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array when no fights match the filter', () => {
    const fights = [
      { id: 'a', name: 'A', campaignReq: 'Campaign 2' },
    ];
    const groups = groupEncounters(fights, 1);
    expect(groups).toEqual([]);
  });

  it('handles Any Campaign req', () => {
    const fights = [
      { id: 'a', name: 'A', campaignReq: 'Any Campaign' },
      { id: 'b', name: 'B', campaignReq: 'Campaign 1' },
    ];
    const groups = groupEncounters(fights, 0);
    expect(groups).toHaveLength(2);
    expect(groups[groups.length - 1].group.label).toBe('Any Campaign');
  });

  it('includes all campaigns up to and including the active filter', () => {
    const fights = [
      { id: 'c1a', name: 'C1A', campaignReq: 'Campaign 1' },
      { id: 'c2a', name: 'C2A', campaignReq: 'Campaign 2' },
      { id: 'c3a', name: 'C3A', campaignReq: 'Campaign 3' },
    ];
    const groups = groupEncounters(fights, 2);
    const ids = groups.map(g => g.group.id);
    expect(ids).toEqual([1, 2]);
  });

  it('excludes campaigns beyond the active filter', () => {
    const fights = [
      { id: 'c1a', name: 'C1A', campaignReq: 'Campaign 1' },
      { id: 'c3a', name: 'C3A', campaignReq: 'Campaign 3' },
    ];
    const groups = groupEncounters(fights, 1);
    const ids = groups.map(g => g.group.id);
    expect(ids).toEqual([1]);
  });
});

// ─── Campaign event tokens ─────────────────────────────────────────────────────

describe('reduceSetEventToken', () => {
  it('clamps to a maximum of 3', () => {
    const s2 = {
      ...s,
      campaign: {
        ...s.campaign,
        eventTokens: { ...s.campaign.eventTokens, mountain: 2 },
      },
    };
    const next = reduceSetEventToken(s2, 'mountain', 5);
    expect(next.campaign.eventTokens.mountain).toBe(3);
  });

  it('clamps to a minimum of 0', () => {
    const next = reduceSetEventToken(s, 'mountain', -5);
    expect(next.campaign.eventTokens.mountain).toBe(0);
  });

  it('returns a new eventTokens object reference', () => {
    const prev = s.campaign.eventTokens;
    const next = reduceSetEventToken(s, 'mountain', 1);
    expect(next.campaign.eventTokens).not.toBe(prev);
  });

  it('logs a triggered message when crossing from below 3 to exactly 3', () => {
    const s2 = {
      ...s,
      campaign: {
        ...s.campaign,
        eventTokens: { ...s.campaign.eventTokens, mountain: 2 },
      },
    };
    const next = reduceSetEventToken(s2, 'mountain', 1);
    expect(next.log[0].message).toContain('event triggered');
  });

  it('logs a normal increment message when not triggered', () => {
    const next = reduceSetEventToken(s, 'mountain', 1);
    expect(next.log[0].message).toContain('+1');
  });
});

describe('reduceResetEventToken', () => {
  it('resets the named region to 0', () => {
    const s2 = {
      ...s,
      campaign: {
        ...s.campaign,
        eventTokens: { ...s.campaign.eventTokens, mountain: 3 },
      },
    };
    const next = reduceResetEventToken(s2, 'mountain');
    expect(next.campaign.eventTokens.mountain).toBe(0);
  });

  it('leaves other regions untouched', () => {
    const s2 = {
      ...s,
      campaign: {
        ...s.campaign,
        eventTokens: { ...s.campaign.eventTokens, mountain: 3, forest: 2 },
      },
    };
    const next = reduceResetEventToken(s2, 'mountain');
    expect(next.campaign.eventTokens.forest).toBe(2);
    expect(next.campaign.eventTokens.plains).toBe(0);
    expect(next.campaign.eventTokens.sea).toBe(0);
  });
});

// ─── Campaign locations ────────────────────────────────────────────────────────

describe('reduceSetCampaignLocation', () => {
  it('sets the given location key', () => {
    const next = reduceSetCampaignLocation(s, 'party', 'Forest');
    expect(next.campaign.locations.party).toBe('Forest');
  });

  it('leaves other location keys untouched', () => {
    const next = reduceSetCampaignLocation(s, 'party', 'Forest');
    expect(next.campaign.locations.caravan).toBe('');
    expect(next.campaign.locations.mainQuest).toBe('');
  });

  it('does not log', () => {
    const next = reduceSetCampaignLocation(s, 'party', 'Forest');
    expect(next.log.length).toBe(s.log.length);
  });
});

describe('reduceAddDynamicLocation', () => {
  it('appends an entry with id and empty label to sideQuests', () => {
    const next = reduceAddDynamicLocation(s, 'sideQuests');
    expect(next.campaign.locations.sideQuests).toHaveLength(1);
    expect(next.campaign.locations.sideQuests[0]).toEqual(
      expect.objectContaining({ label: '' })
    );
    expect(typeof next.campaign.locations.sideQuests[0].id).toBe('number');
  });

  it('assigns unique ids across multiple calls', () => {
    const s1 = reduceAddDynamicLocation(s, 'sideQuests');
    const s2 = reduceAddDynamicLocation(s1, 'sideQuests');
    expect(s2.campaign.locations.sideQuests[0].id).not.toBe(
      s2.campaign.locations.sideQuests[1].id
    );
  });

  it('does not log', () => {
    const next = reduceAddDynamicLocation(s, 'sideQuests');
    expect(next.log.length).toBe(s.log.length);
  });
});

describe('reduceUpdateDynamicLocation', () => {
  let s1, id;
  beforeEach(() => {
    s1 = reduceAddDynamicLocation(s, 'sideQuests');
    id = s1.campaign.locations.sideQuests[0].id;
  });

  it('updates the label of the matching entry', () => {
    const next = reduceUpdateDynamicLocation(s1, 'sideQuests', id, 'Thief Camp');
    expect(next.campaign.locations.sideQuests[0].label).toBe('Thief Camp');
  });

  it('leaves other entries in the same array untouched', () => {
    const s2 = reduceAddDynamicLocation(s1, 'sideQuests');
    const otherId = s2.campaign.locations.sideQuests[0].id;
    const next = reduceUpdateDynamicLocation(s2, 'sideQuests', otherId, 'Thief Camp');
    expect(next.campaign.locations.sideQuests[1].label).toBe('');
  });

  it('no-ops safely when id does not match any entry', () => {
    const next = reduceUpdateDynamicLocation(s1, 'sideQuests', 99999, 'Ghost Town');
    expect(next.campaign.locations.sideQuests).toHaveLength(1);
    expect(next.campaign.locations.sideQuests[0].label).toBe('');
  });

  it('does not log', () => {
    const next = reduceUpdateDynamicLocation(s1, 'sideQuests', id, 'Thief Camp');
    expect(next.log.length).toBe(s.log.length);
  });
});

describe('reduceRemoveDynamicLocation', () => {
  let s1, id;
  beforeEach(() => {
    s1 = reduceAddDynamicLocation(s, 'sideQuests');
    id = s1.campaign.locations.sideQuests[0].id;
  });

  it('tombstones the entry matching id (keeps it, marks deleted)', () => {
    const next = reduceRemoveDynamicLocation(s1, 'sideQuests', id);
    expect(next.campaign.locations.sideQuests).toHaveLength(1);
    expect(next.campaign.locations.sideQuests[0].deleted).toBe(true);
  });

  it('leaves other entries untouched when removing one', () => {
    const s2 = reduceAddDynamicLocation(s1, 'sideQuests');
    const next = reduceRemoveDynamicLocation(s2, 'sideQuests', id);
    expect(next.campaign.locations.sideQuests).toHaveLength(2);
    const other = next.campaign.locations.sideQuests.find(e => e.id !== id);
    expect(other.deleted).toBeUndefined();
  });

  it('leaves the array unchanged if id does not match', () => {
    const next = reduceRemoveDynamicLocation(s1, 'sideQuests', 99999);
    expect(next.campaign.locations.sideQuests).toHaveLength(1);
  });

  it('does not log', () => {
    const next = reduceRemoveDynamicLocation(s1, 'sideQuests', id);
    expect(next.log.length).toBe(s.log.length);
  });
});

// ─── Plans ─────────────────────────────────────────────────────────────────────

describe('reduceAddPlan', () => {
  it('appends a new plan with done: false and trimmed text', () => {
    const next = reduceAddPlan(s, ' Defeat the boss ');
    expect(next.campaign.plans).toHaveLength(1);
    expect(next.campaign.plans[0]).toEqual(
      expect.objectContaining({ text: 'Defeat the boss', done: false })
    );
    expect(typeof next.campaign.plans[0].id).toBe('number');
  });

  it('trims whitespace from text before storing', () => {
    const next = reduceAddPlan(s, '  Rescue the villagers  ');
    expect(next.campaign.plans[0].text).toBe('Rescue the villagers');
  });

  it('is a no-op when text is empty', () => {
    const next = reduceAddPlan(s, '');
    expect(next.campaign.plans).toHaveLength(0);
  });

  it('is a no-op when text is all whitespace', () => {
    const next = reduceAddPlan(s, '   ');
    expect(next.campaign.plans).toHaveLength(0);
  });

  it('returns the same reference when text is empty (no-op)', () => {
    const next = reduceAddPlan(s, '');
    expect(next).toBe(s);
  });
});

describe('reduceTogglePlan', () => {
  let s1, id;
  beforeEach(() => {
    s1 = reduceAddPlan(s, 'Test plan');
    id = s1.campaign.plans[0].id;
  });

  it('flips done from false to true', () => {
    const next = reduceTogglePlan(s1, id);
    expect(next.campaign.plans[0].done).toBe(true);
  });

  it('flips done back to false on second toggle', () => {
    const s2 = reduceTogglePlan(s1, id);
    const s3 = reduceTogglePlan(s2, id);
    expect(s3.campaign.plans[0].done).toBe(false);
  });

  it('leaves other plans untouched', () => {
    const s2 = reduceAddPlan(s1, 'New Plan');
    const s3 = reduceTogglePlan(s2, id);
    expect(s3.campaign.plans[1].done).toBe(false);
  });
});

describe('reduceDeletePlan', () => {
  it('tombstones the plan matching id (keeps it, marks deleted)', () => {
    const s1 = reduceAddPlan(s, 'Plan A');
    const id = s1.campaign.plans[0].id;
    const next = reduceDeletePlan(s1, id);
    // Kept in the array so the delete syncs through the append-only merge.
    expect(next.campaign.plans).toHaveLength(1);
    expect(next.campaign.plans[0].deleted).toBe(true);
  });

  it('leaves other plans untouched when removing one', () => {
    const s1 = reduceAddPlan(s, 'Plan A');
    const s2 = reduceAddPlan(s1, 'Plan B');
    const id = s2.campaign.plans[0].id;
    const next = reduceDeletePlan(s2, id);
    expect(next.campaign.plans).toHaveLength(2);
    const other = next.campaign.plans.find(p => p.id !== id);
    expect(other.deleted).toBeUndefined();
  });

  it('leaves the array content unchanged if id does not match', () => {
    const s1 = reduceAddPlan(s, 'Plan A');
    const next = reduceDeletePlan(s1, 99999);
    expect(next.campaign.plans).toHaveLength(1);
    expect(next.campaign.plans[0].deleted).toBeUndefined();
  });
});

// ─── Tombstone compaction (solo-mode GC) ────────────────────────────────────

describe('compactTombstones', () => {
  it('removes tombstoned stonebound locations', () => {
    const state = {
      ...s,
      stonebound: {
        max: 4,
        locations: [
          { id: 1, selection: 'Mir', count: 1 },
          { id: 2, selection: 'Razdor', count: 2, deleted: true },
          { id: 3, selection: 'Silny', count: 1 },
        ],
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.stonebound.locations).toHaveLength(2);
    expect(compacted.stonebound.locations.find(l => l.id === 2)).toBeUndefined();
  });

  it('removes zero-count stash tombstones (AVE-369)', () => {
    const state = { ...s, stash: { Iron: 2, Silver: 0, 'My Custom Thing': 0 } };
    const compacted = compactTombstones(state);
    expect(compacted.stash).toEqual({ Iron: 2 });
  });

  it('leaves a stash without zero counts untouched (same reference)', () => {
    const state = { ...s, stash: { Iron: 2 } };
    expect(compactTombstones(state).stash).toBe(state.stash);
  });

  it('removes tombstoned campaign plans', () => {
    const state = {
      ...s,
      campaign: {
        ...s.campaign,
        plans: [
          { id: 1, text: 'Plan A', done: false },
          { id: 2, text: 'Plan B', done: true, deleted: true },
          { id: 3, text: 'Plan C', done: false },
        ],
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.campaign.plans).toHaveLength(2);
    expect(compacted.campaign.plans.find(p => p.id === 2)).toBeUndefined();
  });

  it('removes tombstoned completed encounters', () => {
    const state = {
      ...s,
      campaign: {
        ...s.campaign,
        completedEncounters: [
          { id: 'enc-1' },
          { id: 'enc-2', deleted: true },
          { id: 'enc-3' },
        ],
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.campaign.completedEncounters).toHaveLength(2);
    expect(compacted.campaign.completedEncounters.find(e => e.id === 'enc-2')).toBeUndefined();
  });

  it('removes tombstoned completed bounties', () => {
    const state = {
      ...s,
      campaign: {
        ...s.campaign,
        completedBounties: [
          { id: 'b-1' },
          { id: 'b-2', deleted: true },
        ],
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.campaign.completedBounties).toHaveLength(1);
    expect(compacted.campaign.completedBounties.find(b => b.id === 'b-2')).toBeUndefined();
  });

  it('removes tombstoned entries from dynamic location arrays (sideQuests)', () => {
    const state = {
      ...s,
      campaign: {
        ...s.campaign,
        locations: {
          ...s.campaign.locations,
          sideQuests: [
            { id: 1, label: 'Thief Camp' },
            { id: 2, label: 'Haunted Cave', deleted: true },
          ],
        },
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.campaign.locations.sideQuests).toHaveLength(1);
    expect(compacted.campaign.locations.sideQuests.find(q => q.id === 2)).toBeUndefined();
  });

  it('preserves non-array location keys', () => {
    const state = {
      ...s,
      campaign: {
        ...s.campaign,
        locations: {
          party: 'Forest',
          caravan: '',
          sideQuests: [{ id: 1, label: 'Thief Camp', deleted: true }],
        },
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.campaign.locations.party).toBe('Forest');
    expect(compacted.campaign.locations.caravan).toBe('');
  });

  it('returns the same reference when there are no tombstones', () => {
    const state = {
      ...s,
      stonebound: { max: 4, locations: [{ id: 1, selection: 'Mir', count: 1 }] },
      campaign: {
        ...s.campaign,
        plans: [{ id: 1, text: 'Plan A', done: false }],
        completedEncounters: [{ id: 'enc-1' }],
        completedBounties: [{ id: 'b-1' }],
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted).toBe(state);
  });

  it('handles empty arrays without error', () => {
    const compacted = compactTombstones(s);
    expect(compacted.stonebound.locations).toEqual([]);
    expect(compacted.campaign.plans).toEqual([]);
    expect(compacted.campaign.completedEncounters).toEqual([]);
    expect(compacted.campaign.completedBounties).toEqual([]);
  });

  it('handles null/undefined stonebound', () => {
    const state = { ...s, stonebound: undefined };
    const compacted = compactTombstones(state);
    expect(compacted.stonebound).toBeUndefined();
  });

  it('handles null/undefined campaign', () => {
    const state = { ...s, campaign: undefined };
    const compacted = compactTombstones(state);
    expect(compacted.campaign).toBeUndefined();
  });

  it('removes tombstones from all array types simultaneously', () => {
    const state = {
      ...s,
      stonebound: {
        max: 4,
        locations: [
          { id: 1, selection: 'Mir', count: 1 },
          { id: 2, selection: 'Razdor', count: 2, deleted: true },
        ],
      },
      campaign: {
        ...s.campaign,
        plans: [
          { id: 1, text: 'A', done: false },
          { id: 2, text: 'B', done: true, deleted: true },
        ],
        completedEncounters: [
          { id: 'e1' },
          { id: 'e2', deleted: true },
        ],
        completedBounties: [
          { id: 'b1' },
          { id: 'b2', deleted: true },
        ],
        locations: {
          ...s.campaign.locations,
          sideQuests: [
            { id: 1, label: 'x' },
            { id: 2, label: 'y', deleted: true },
          ],
        },
      },
    };
    const compacted = compactTombstones(state);
    expect(compacted.stonebound.locations).toHaveLength(1);
    expect(compacted.campaign.plans).toHaveLength(1);
    expect(compacted.campaign.completedEncounters).toHaveLength(1);
    expect(compacted.campaign.completedBounties).toHaveLength(1);
    expect(compacted.campaign.locations.sideQuests).toHaveLength(1);
  });
});

// ─── deriveUndoLabel ───────────────────────────────────────────────────────────

describe('deriveUndoLabel', () => {
  it('returns the log message when a new log entry was added', () => {
    const prev = s;
    const next = addLog(s, 'Grigory HP +1 → 5');
    expect(deriveUndoLabel(prev, next, 'guard_0')).toBe('Grigory HP +1 → 5');
  });

  it('falls back to guard name section label when no new log entry', () => {
    const next = reduceSetCampaignLocation(s, 'fort', 'Fort Istra');
    expect(deriveUndoLabel(s, next, 'campaign')).toBe('Campaign update');
  });

  it('uses guard name in fallback for guard sections', () => {
    const next = { ...s, guards: s.guards.map((g, i) => i === 0 ? { ...g, hp: g.hp + 1 } : g) };
    expect(deriveUndoLabel(s, next, 'guard_0')).toBe('Grigory update');
  });

  it('uses generic label for unknown section names', () => {
    expect(deriveUndoLabel(s, s, 'unknown_section')).toBe('State update');
  });

  it('returns null when prev.log[0] is present but next has same log head', () => {
    const prev = addLog(s, 'Some action');
    const next = { ...prev, sil: 99 };
    expect(deriveUndoLabel(prev, next, 'resources')).toBe('Resources update');
  });
});

// ─── healState / migrateV1 (import pipeline) ───────────────────────────────────

describe('healState(migrateV1(...))', () => {
  it('fills missing ftIstraBuildings on imported saves', () => {
    const save = {
      sil: 5, lux: 3,
      guards: s.guards,
      activeParty: s.activeParty,
      campaign: { someOldKey: 'value' },
    };
    const healed = healState(migrateV1(save));
    expect(healed.campaign.ftIstraBuildings).toEqual({});
  });

  it('fills missing eventTokens on imported saves', () => {
    const save = {
      sil: 5, lux: 3,
      guards: s.guards,
      activeParty: s.activeParty,
      campaign: { completedEncounters: ['Fort_Istra_Tutorial'] },
    };
    const healed = healState(migrateV1(save));
    expect(healed.campaign.eventTokens).toEqual({ mountain: 0, forest: 0, plains: 0, sea: 0 });
  });

  it('fills missing locations on imported saves', () => {
    const save = {
      sil: 5, lux: 3,
      guards: s.guards,
      activeParty: s.activeParty,
      campaign: {},
    };
    const healed = healState(migrateV1(save));
    expect(healed.campaign.locations).toBeDefined();
    expect(healed.campaign.locations.party).toBe('');
  });

  it('fills missing plans on imported saves', () => {
    const save = {
      sil: 5, lux: 3,
      guards: s.guards,
      activeParty: s.activeParty,
    };
    const healed = healState(migrateV1(save));
    expect(healed.campaign.plans).toEqual([]);
  });

  it('returns null for non-object input', () => {
    expect(healState(null)).toBeNull();
    expect(healState('string')).toBeNull();
    expect(healState(42)).toBeNull();
  });

  it('passes through a valid v2 state unchanged', () => {
    const healed = healState(migrateV1(s));
    expect(healed.sil).toBe(s.sil);
    expect(healed.lux).toBe(s.lux);
    expect(healed.guards).toHaveLength(8);
    expect(healed.campaign.ftIstraBuildings).toEqual(s.campaign.ftIstraBuildings);
  });
});

// ─── Legacy puzzleQuestDone migration (AVE-370) ──────────────────────────────
//
// The legacy flag must migrate exactly once. It used to re-run on every load:
// un-completing a migrated quest resurrected it on the next reload (and
// appended a duplicate entry each time), and the flag re-fired under whatever
// campaign was active, leaking completion into other campaigns.

describe('legacy puzzleQuestDone migration (AVE-370)', () => {
  function stateWithLegacyFlag(campaignId = 1) {
    const state = createInitialState();
    state.cities = state.cities.map(c =>
      c.name === 'Mir' ? { ...c, puzzleQuestDone: true } : c
    );
    state.campaign.campaignId = campaignId;
    return state;
  }

  it('migrates the flag into completedPuzzleQuests and clears it', () => {
    const healed = healState(stateWithLegacyFlag(1));
    expect(isPuzzleQuestCompleted(healed.campaign.completedPuzzleQuests, 'mir-c1-puzzle')).toBe(true);
    expect(healed.cities.find(c => c.name === 'Mir').puzzleQuestDone).toBe(false);
  });

  it('an un-completed quest stays un-completed across reloads', () => {
    // load → un-check in the UI → reload (healState runs again on the save)
    let loaded = healState(stateWithLegacyFlag(1));
    loaded = reduceTogglePuzzleQuestComplete(loaded, 'mir-c1-puzzle');
    const reloaded = healState(JSON.parse(JSON.stringify(loaded)));
    expect(isPuzzleQuestCompleted(reloaded.campaign.completedPuzzleQuests, 'mir-c1-puzzle')).toBe(false);
    // …and no duplicate entries accumulate.
    const mirEntries = reloaded.campaign.completedPuzzleQuests.filter(q => q.id === 'mir-c1-puzzle');
    expect(mirEntries).toHaveLength(1);
  });

  it('does not leak the flag into a different campaign', () => {
    // Save last used under campaign 2 — a campaign-1-era flag must not
    // complete campaign 2's quest… but with no prior entry at all, the
    // one-shot migration applies it to the active campaign (best guess).
    // The critical case: once ANY entry exists for the city, reloading
    // under another campaign adds nothing.
    let loaded = healState(stateWithLegacyFlag(1));
    expect(isPuzzleQuestCompleted(loaded.campaign.completedPuzzleQuests, 'mir-c1-puzzle')).toBe(true);

    // Simulate the flag reappearing (e.g. legacy cities value from an
    // unmigrated remote row) while the save now sits on campaign 2.
    loaded = {
      ...loaded,
      cities: loaded.cities.map(c => c.name === 'Mir' ? { ...c, puzzleQuestDone: true } : c),
      campaign: { ...loaded.campaign, campaignId: 2 },
    };
    const reloaded = healState(JSON.parse(JSON.stringify(loaded)));
    expect(isPuzzleQuestCompleted(reloaded.campaign.completedPuzzleQuests, 'mir-c2-puzzle')).toBe(false);
    // Campaign 1's completion is untouched.
    expect(isPuzzleQuestCompleted(reloaded.campaign.completedPuzzleQuests, 'mir-c1-puzzle')).toBe(true);
  });

  it('migrateV1 applies the same one-shot migration to old saves and imports', () => {
    const v1 = {
      cities: createInitialCities().cities.map(c =>
        c.name === 'Ryba' ? { ...c, puzzleQuestDone: true } : c
      ),
      campaign: { campaignId: 3 },
    };
    const migrated = migrateV1(v1);
    expect(isPuzzleQuestCompleted(migrated.campaign.completedPuzzleQuests, 'ryba-c3-puzzle')).toBe(true);
    expect(migrated.cities.find(c => c.name === 'Ryba').puzzleQuestDone).toBe(false);
  });
});
