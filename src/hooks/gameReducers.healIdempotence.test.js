/**
 * The healers' load-bearing invariant: healing a section the app itself
 * produced must be a deep-equal no-op.
 *
 * applyRemoteRow's echo suppression compares the RAW incoming value against
 * `extractSection(local)`. If a healer rewrites a value that a reducer can
 * legitimately produce, local and the campaign row hold different bytes for the
 * same logical state — so every echo of our own write reads as a genuine remote
 * change, and the divergence never resolves because the healer keeps rewriting
 * it (AVE-873 / AVE-922).
 *
 * This suite walks each reducer, then asserts the matching healer is a no-op on
 * its output — so a future reducer that leaves a field the healers disagree
 * with fails here rather than in a two-player session.
 */
import { describe, it, expect } from 'vitest';
import deepEqual from 'fast-deep-equal';
import { createInitialState } from '../data/constants';
import {
  healGuard,
  healResourcesSection,
  healCitiesSection,
  healPartySection,
  healStashSection,
  healCampaignSection,
  healEventToken,
  reduceSetGuardSatchelItem,
  reduceSetGuardEquipment,
  reduceAdjustGuardHp,
  reduceAdjustGuardMaxHp,
  reduceToggleExpandedSatchel,
  reduceAdjustStash,
  reduceAddStoneboundLocation,
  reduceUpdateStoneboundLocation,
  reduceRemoveStoneboundLocation,
  reduceSetEventToken,
  reduceSetCampaignLocation,
  reduceAddDynamicLocation,
  reduceAddPlan,
  reduceToggleEncounterComplete,
  reduceToggleBountyComplete,
  reduceTogglePuzzleQuestComplete,
  reduceSetFtIstraBuilding,
  reduceSetSil,
  reduceSetLux,
  reduceSetPartySlot,
} from './gameReducers';

function expectGuardHealNoop(state, guardIdx, what) {
  const guard = state.guards[guardIdx];
  expect(deepEqual(healGuard(guard), guard), `healGuard rewrote state produced by ${what}`).toBe(true);
}

function expectSectionHealNoops(s, what) {
  expect(deepEqual(healResourcesSection({ sil: s.sil, lux: s.lux }), { sil: s.sil, lux: s.lux }), what).toBe(true);
  expect(deepEqual(healCitiesSection({ cities: s.cities }), { cities: s.cities }), what).toBe(true);
  expect(deepEqual(healPartySection({ activeParty: s.activeParty }), { activeParty: s.activeParty }), what).toBe(true);
  expect(
    deepEqual(healStashSection({ stash: s.stash, stonebound: s.stonebound }), { stash: s.stash, stonebound: s.stonebound }),
    what,
  ).toBe(true);
  expect(deepEqual(healCampaignSection({ campaign: s.campaign }), { campaign: s.campaign }), what).toBe(true);
  for (let i = 0; i < 8; i++) expectGuardHealNoop(s, i, what);
}

describe('healers are a no-op on reducer output', () => {
  it('holds for a freshly initialized state', () => {
    expectSectionHealNoops(createInitialState(), 'createInitialState');
  });

  it('holds after clearing a satchel slot that held a multi-stack', () => {
    // The regression: clearing the item used to leave the old qty behind, but
    // healGuard forces qty back to 1 whenever the item is empty. The campaign
    // row kept qty 4 while every local load healed to 1, so that guard's
    // section differed from the server on every boot/foreground refetch.
    let s = createInitialState();
    s = reduceSetGuardSatchelItem(s, 0, 0, 'item', 'Iron');
    s = reduceSetGuardSatchelItem(s, 0, 0, 'qty', 4);
    expect(s.guards[0].satchel[0]).toEqual({ item: 'Iron', qty: 4 });

    s = reduceSetGuardSatchelItem(s, 0, 0, 'item', '');
    expect(s.guards[0].satchel[0]).toEqual({ item: '', qty: 1 });
    expectGuardHealNoop(s, 0, 'clearing a satchel slot');
  });

  it('holds after every guard mutation', () => {
    let s = createInitialState();
    s = reduceAdjustGuardHp(s, 2, -7);
    s = reduceAdjustGuardMaxHp(s, 2, 3);
    s = reduceSetGuardEquipment(s, 2, 'weapon', 'Iron Short Sword');
    s = reduceSetGuardEquipment(s, 2, 'weapon', '');
    s = reduceToggleExpandedSatchel(s, 2);
    s = reduceSetGuardSatchelItem(s, 2, 5, 'item', 'Pine');
    s = reduceSetGuardSatchelItem(s, 2, 5, 'qty', 3);
    s = reduceSetGuardSatchelItem(s, 2, 5, 'item', '');
    expectSectionHealNoops(s, 'guard mutations');
  });

  it('holds after stash / stonebound mutations, including tombstones', () => {
    let s = createInitialState();
    s = reduceAdjustStash(s, 'Iron', 5);
    s = reduceAdjustStash(s, 'Iron', -5);          // 0-count map tombstone
    s = reduceAdjustStash(s, 'Home-brewed tonic', 2); // custom item
    s = reduceAddStoneboundLocation(s);
    const locId = s.stonebound.locations[0].id;
    s = reduceUpdateStoneboundLocation(s, locId, 'selection', 'Mir');
    s = reduceUpdateStoneboundLocation(s, locId, 'count', 3);
    s = reduceAddStoneboundLocation(s);
    s = reduceRemoveStoneboundLocation(s, s.stonebound.locations[1].id); // tombstone
    expectSectionHealNoops(s, 'stash/stonebound mutations');
  });

  it('holds after campaign mutations', () => {
    let s = createInitialState();
    s = reduceSetEventToken(s, 'sea', 2);
    s = reduceSetCampaignLocation(s, 'mainQuest', 'The Frozen Pass');
    s = reduceAddDynamicLocation(s, 'sideQuests');
    s = reduceAddPlan(s, 'Buy a boat');
    s = reduceToggleEncounterComplete(s, 'ty-1');
    s = reduceToggleEncounterComplete(s, 'ty-1');   // un-complete → tombstone
    s = reduceToggleBountyComplete(s, 'mir-c1-the-clayhorn-poachers');
    s = reduceTogglePuzzleQuestComplete(s, 'mir-c1-puzzle');
    s = reduceSetFtIstraBuilding(s, 'Blacksmith', 'built');
    expectSectionHealNoops(s, 'campaign mutations');
  });

  it('holds after resource and party mutations', () => {
    let s = createInitialState();
    s = reduceSetSil(s, 40);
    s = reduceSetLux(s, 3);
    s = reduceSetPartySlot(s, 0, 'Vera');
    expectSectionHealNoops(s, 'resource/party mutations');
  });
});

describe('healEventToken', () => {
  it('leaves every in-range value untouched', () => {
    for (const v of [0, 1, 2, 3]) expect(healEventToken(v)).toBe(v);
  });

  it('clamps values the UI cannot represent', () => {
    // EventTokensCard renders exactly three pips, treats >= 3 as triggered, and
    // disables the decrement button at 0. An out-of-range value from a damaged
    // save or an unmigrated remote row rendered a permanently triggered region.
    expect(healEventToken(99)).toBe(3);
    expect(healEventToken(-5)).toBe(0);
    expect(healEventToken(2.7)).toBe(2);
  });

  it('falls back to 0 for non-numbers', () => {
    for (const v of [undefined, null, 'two', NaN, Infinity, {}]) {
      expect(healEventToken(v)).toBe(0);
    }
  });

  it('is applied by healCampaignSection', () => {
    const { campaign } = healCampaignSection({
      campaign: { eventTokens: { mountain: 99, forest: -5, plains: 1, sea: 3 } },
    });
    expect(campaign.eventTokens).toEqual({ mountain: 3, forest: 0, plains: 1, sea: 3 });
  });
});
