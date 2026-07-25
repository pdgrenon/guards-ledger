import { describe, it, expect } from 'vitest';
import {
  TRAINING_YARD_FIGHTS,
  SPIRIT_BOSSES,
  campaignGroupFromReq,
  encountersMatchFilter,
  groupEncounters,
} from './encounters';
import { CAMPAIGNS } from './constants';

const END_GAME_FIGHT = SPIRIT_BOSSES.find(f => f.id === 'c5-end-game');

function oldCampaignGroupFromReq(req) {
  if (!req || req === 'Any Campaign') return { id: 0, label: 'Any Campaign' };
  const match = req.match(/Campaign (\d)/);
  if (match) {
    const id = parseInt(match[1], 10);
    const found = CAMPAIGNS.find(c => c.id === id);
    if (found) return { id, label: found.label };
  }
  return { id: 0, label: 'Any Campaign' };
}

function oldGroupId(fight) {
  return oldCampaignGroupFromReq(fight.campaignReq).id;
}

describe('CAMPAIGNS', () => {
  it('still has exactly 4 entries', () => {
    expect(CAMPAIGNS).toHaveLength(4);
  });
});

describe('campaignGroupFromReq', () => {
  it("returns { id: 99, label: 'End Game' } for 'Complete Campaign 5'", () => {
    const result = campaignGroupFromReq('Complete Campaign 5');
    expect(result.id).toBe(99);
    expect(result.label).toBe('End Game');
  });

  it("returns { id: 0, label: 'Any Campaign' } for 'Any Campaign'", () => {
    expect(campaignGroupFromReq('Any Campaign')).toEqual({ id: 0, label: 'Any Campaign' });
  });

  it("returns { id: 3, label: 'Campaign 3' } for 'Campaign 3'", () => {
    expect(campaignGroupFromReq('Campaign 3')).toEqual({ id: 3, label: 'Campaign 3' });
  });

  it('returns the any-group for null', () => {
    expect(campaignGroupFromReq(null)).toEqual({ id: 0, label: 'Any Campaign' });
  });

  it('returns the any-group for undefined', () => {
    expect(campaignGroupFromReq(undefined)).toEqual({ id: 0, label: 'Any Campaign' });
  });

  it("handles 'Campaign 1 - Chapter 3 or later' style reqs", () => {
    const result = campaignGroupFromReq('Campaign 1 - Chapter 3 or later');
    expect(result).toEqual({ id: 1, label: 'Campaign 1' });
  });
});

describe('encountersMatchFilter', () => {
  it('hides the end game fight for campaigns 1, 2, and 3', () => {
    expect(encountersMatchFilter(END_GAME_FIGHT, 1)).toBe(false);
    expect(encountersMatchFilter(END_GAME_FIGHT, 2)).toBe(false);
    expect(encountersMatchFilter(END_GAME_FIGHT, 3)).toBe(false);
  });

  it('shows the end game fight for campaign 4', () => {
    expect(encountersMatchFilter(END_GAME_FIGHT, 4)).toBe(true);
  });

  it('shows the end game fight for campaign 0 (unfiltered)', () => {
    expect(encountersMatchFilter(END_GAME_FIGHT, 0)).toBe(true);
  });

  it('still shows any-campaign fights for all campaign ids', () => {
    const anyFight = TRAINING_YARD_FIGHTS.find(f => f.campaignReq === 'Any Campaign');
    for (const cid of [0, 1, 2, 3, 4]) {
      expect(encountersMatchFilter(anyFight, cid)).toBe(true);
    }
  });
});

describe('groupEncounters — end game gating', () => {
  it('contains no End Game group and no c5-end-game fight at campaign 1', () => {
    const grouped = groupEncounters(SPIRIT_BOSSES, 1);
    const endGameGroup = grouped.find(g => g.group.label === 'End Game');
    expect(endGameGroup).toBeUndefined();
    const allFightIds = grouped.flatMap(g => g.fights.map(f => f.id));
    expect(allFightIds).not.toContain('c5-end-game');
  });

  it('contains the End Game group ordered after Campaign 4 at campaign 4', () => {
    const grouped = groupEncounters(SPIRIT_BOSSES, 4);
    const endGameGroup = grouped.find(g => g.group.label === 'End Game');
    expect(endGameGroup).toBeDefined();
    expect(endGameGroup.group.id).toBe(99);
    expect(endGameGroup.fights.some(f => f.id === 'c5-end-game')).toBe(true);

    const groupLabels = grouped.map(g => g.group.label);
    const c4Idx = groupLabels.indexOf('Campaign 4');
    const endIdx = groupLabels.indexOf('End Game');
    expect(c4Idx).toBeLessThan(endIdx);
  });

  it('shows the End Game group at campaign 0 (unfiltered)', () => {
    const grouped = groupEncounters(SPIRIT_BOSSES, 0);
    const endGameGroup = grouped.find(g => g.group.label === 'End Game');
    expect(endGameGroup).toBeDefined();
  });
});

describe('groupEncounters — nothing else moved', () => {
  const ALL_FIGHTS = [...TRAINING_YARD_FIGHTS, ...SPIRIT_BOSSES];

  for (const campaignId of [1, 2, 3, 4]) {
    it(`fight group assignments unchanged for campaign ${campaignId} except end-game fight`, () => {
      const before = {};
      const after = {};

      for (const fight of ALL_FIGHTS) {
        const oldId = oldGroupId(fight);
        const oldShown = campaignId === 0 || oldId === 0 || oldId <= campaignId;
        if (oldShown) before[fight.id] = oldId;

        const newShown = encountersMatchFilter(fight, campaignId);
        if (newShown) after[fight.id] = campaignGroupFromReq(fight.campaignReq).id;
      }

      const bothShown = Object.keys(before).filter(id => id in after);

      for (const id of bothShown) {
        if (id === 'c5-end-game') {
          expect(after[id]).toBe(99);
          continue;
        }
        expect(after[id]).toBe(before[id]);
      }

      const endGameInBefore = 'c5-end-game' in before;
      const endGameInAfter = 'c5-end-game' in after;

      if (campaignId <= 3) {
        expect(endGameInBefore).toBe(true);
        expect(endGameInAfter).toBe(false);
      } else {
        expect(endGameInBefore).toBe(true);
        expect(endGameInAfter).toBe(true);
      }
    });
  }
});

describe('groupEncounters — order', () => {
  it('training yard fights at any campaign sort Any Campaign last', () => {
    const grouped = groupEncounters(TRAINING_YARD_FIGHTS, 1);
    const labels = grouped.map(g => g.group.label);
    const anyIdx = labels.indexOf('Any Campaign');
    expect(anyIdx).toBe(labels.length - 1);
  });

  it('spirit bosses at campaign 4 sort as 1, 2, 3, 4, End Game', () => {
    const grouped = groupEncounters(SPIRIT_BOSSES, 4);
    const labels = grouped.map(g => g.group.label);
    expect(labels).toEqual(['Campaign 1', 'Campaign 2', 'Campaign 3', 'Campaign 4', 'End Game']);
  });
});
