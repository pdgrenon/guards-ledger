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
  reduceSetPartySlot,
  reduceSetSil,
  reduceSetLux,
  reduceAdjustGuardHp,
  reduceAdjustGuardMaxHp,

  cityPrestige,
  reduceToggleCityQuest,
  reduceAdjustStash,
  reduceSetStoneboundMax,
  reduceAddStoneboundLocation,
  reduceRemoveStoneboundLocation,
  reduceUpdateStoneboundLocation,
  reduceToggleEncounterComplete,
  reduceSetCampaign,
} from '../hooks/gameReducers';
import { colorizeLogMessage } from '../utils/logUtils';

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
  it('adds an encounter id when it is not completed', () => {
    const next = reduceToggleEncounterComplete({ campaign: { completedEncounters: [] } }, 'be-flexible');
    expect(next.campaign.completedEncounters).toEqual(['be-flexible']);
  });

  it('removes an encounter id when it is already completed', () => {
    const next = reduceToggleEncounterComplete({ campaign: { completedEncounters: ['be-flexible'] } }, 'be-flexible');
    expect(next.campaign.completedEncounters).toEqual([]);
  });

  it('preserves other completed encounters when toggling one', () => {
    const state = { campaign: { completedEncounters: ['be-flexible', 'ice-cold'] } };
    const next = reduceToggleEncounterComplete(state, 'ice-cold');
    expect(next.campaign.completedEncounters).toEqual(['be-flexible']);
  });

  it('preserves other completed encounters when adding one', () => {
    const state = { campaign: { completedEncounters: ['be-flexible'] } };
    const next = reduceToggleEncounterComplete(state, 'ice-cold');
    expect(next.campaign.completedEncounters).toEqual(['be-flexible', 'ice-cold']);
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
    // to the first guard in the new party (newParty[0] = Alek, guards index 1).
    const next        = reduceSetPartySlot(s, 1, 'Catherine');
    const expectedIdx = next.guards.findIndex(g => g.name === next.activeParty[0]);
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
  it('removes the location with the given id', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const s2   = reduceAddStoneboundLocation(s1);
    const id   = s2.stonebound.locations[0].id;
    const next = reduceRemoveStoneboundLocation(s2, id);
    expect(next.stonebound.locations).toHaveLength(1);
    expect(next.stonebound.locations[0].id).not.toBe(id);
  });

  it('logs removal with the selection name when present', () => {
    const s1   = reduceAddStoneboundLocation(s);
    const id   = s1.stonebound.locations[0].id;
    const s2   = reduceUpdateStoneboundLocation(s1, 0, 'selection', 'Mir');
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

  it('leaves HTML-looking user text as plain strings when next to a name', () => {
    const result = colorizeLogMessage('Alek found <script>bad()</script>');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('');
    expect(result[1].props.children).toBe('Alek');
    expect(result[2]).toBe(' found <script>bad()</script>');
    expect(typeof result[2]).toBe('string');
  });
});
