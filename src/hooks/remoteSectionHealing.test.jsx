// @vitest-environment jsdom
/**
 * remoteSectionHealing.test.jsx
 *
 * A section arriving from Supabase used to be spliced into React state raw.
 * Local loads run healState; the components dereference these fields without
 * guards *because* of that, so a malformed remote section threw on render and —
 * being persisted by the save effect a moment later — survived the reload the
 * ErrorBoundary offers (AVE-873).
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  applyRemoteSection,
  extractSection,
  ALL_SECTIONS,
} from './useSupabaseSync';
import { healRemoteSection } from './gameReducers';
import { createInitialState } from '../data/constants';
import { CampaignTab } from '../components/CampaignTab';
import { GuardPanel } from '../components/GuardPanel';

const h = React.createElement;
const base = () => createInitialState();

describe('healthy sections heal to a deep-equal no-op (AVE-873)', () => {
  // Load-bearing: applyRemoteRow suppresses echoes with
  // deepEqual(incoming, extractSection(local)). A healer that added, dropped or
  // renamed a key on healthy input would make every echo look like a genuine
  // remote change and reintroduce the AVE-314 clobbering.
  it.each(ALL_SECTIONS)('%s round-trips unchanged', (section) => {
    const s = base();
    const payload = extractSection(s, section);
    expect(healRemoteSection(section, payload)).toEqual(payload);
    const next = applyRemoteSection(s, section, payload);
    expect(extractSection(next, section)).toEqual(payload);
  });

  it('round-trips a section carrying real edits, not just initial state', () => {
    const s = base();
    s.sil = 42;
    s.campaign.plans = [{ id: 1, text: 'Buy rope', done: false }];
    s.campaign.completedBounties = [{ id: 'mir-c1-a-feud', deleted: false }];
    s.stash = { Iron: 3, Pine: 0 };
    s.guards[2].satchel[0] = { item: 'Iron', qty: 4 };

    for (const section of ['resources', 'campaign', 'stash', 'guard_2']) {
      const payload = extractSection(s, section);
      expect(healRemoteSection(section, payload)).toEqual(payload);
    }
  });
});

describe('malformed remote sections are healed, not applied raw (AVE-873)', () => {
  it('fills a campaign section missing every container', () => {
    const next = applyRemoteSection(base(), 'campaign', { campaign: { campaignId: 2 } });
    const c = next.campaign;
    expect(c.campaignId).toBe(2);
    expect(c.plans).toEqual([]);
    expect(c.ftIstraBuildings).toEqual({});
    expect(c.eventTokens).toEqual({ mountain: 0, forest: 0, plains: 0, sea: 0 });
    expect(c.locations).toEqual(expect.objectContaining({ party: '', caravan: '', mainQuest: '', boat: '' }));
    expect(c.completedEncounters).toEqual([]);
  });

  it('clamps an out-of-range campaignId', () => {
    expect(applyRemoteSection(base(), 'campaign', { campaign: { campaignId: 99 } }).campaign.campaignId).toBe(4);
    expect(applyRemoteSection(base(), 'campaign', { campaign: { campaignId: 0 } }).campaign.campaignId).toBe(1);
  });

  it('rebuilds a guard column that is an empty object', () => {
    const s = base();
    const next = applyRemoteSection(s, 'guard_3', {});
    const g = next.guards[3];
    expect(Object.keys(g.equipment).sort()).toEqual(['accessory', 'armor', 'item', 'weapon']);
    expect(g.satchel).toHaveLength(8);
    // Only the targeted guard is replaced — the others keep their identity.
    expect(next.guards[2]).toBe(s.guards[2]);
    expect(next.guards[4]).toBe(s.guards[4]);
  });

  it('clamps guard hp to maxHp', () => {
    const next = applyRemoteSection(base(), 'guard_3', { name: 'Yury', hp: 999, maxHp: 20 });
    expect(next.guards[3].hp).toBe(20);
  });

  it('coerces string / negative numbers in resources', () => {
    const next = applyRemoteSection(base(), 'resources', { sil: '7', lux: -3 });
    expect(next.sil).toBe(7);
    expect(next.lux).toBe(0);
  });

  it('coerces stash counts and rebuilds a malformed stonebound', () => {
    const next = applyRemoteSection(base(), 'stash', { stash: { Iron: '4' }, stonebound: {} });
    expect(next.stash.Iron).toBe(4);
    expect(typeof next.stonebound.max).toBe('number');
    expect(Array.isArray(next.stonebound.locations)).toBe(true);
  });

  it('falls back to a valid party when activeParty is the wrong shape', () => {
    const next = applyRemoteSection(base(), 'party', { activeParty: ['OnlyOne'] });
    expect(next.activeParty).toHaveLength(2);
  });

  it('never touches local-only keys', () => {
    const s = base();
    s.activeGuardIdx = 6;
    s.log = [{ id: 1, time: '10:00', message: 'local' }];
    const next = applyRemoteSection(s, 'campaign', { campaign: { campaignId: 3 } });
    expect(next.activeGuardIdx).toBe(6);
    expect(next.log).toBe(s.log);
  });

  it('is still a no-op for a null section', () => {
    const s = base();
    expect(applyRemoteSection(s, 'campaign', null)).toBe(s);
  });
});

describe('the healed sections actually render (AVE-873)', () => {
  const noop = () => {};

  it('CampaignTab renders a campaign section that arrived with no containers', () => {
    const state = applyRemoteSection(base(), 'campaign', { campaign: { campaignId: 2 } });
    expect(() => render(h(CampaignTab, {
      campaign: state.campaign,
      stash: state.stash,
      guards: state.guards,
      activeParty: state.activeParty,
      onSetEventToken: noop, onResetEventToken: noop, onSetCampaignLocation: noop,
      onAddDynamicLocation: noop, onUpdateDynamicLocation: noop, onRemoveDynamicLocation: noop,
      onAddPlan: noop, onTogglePlan: noop, onDeletePlan: noop,
      onSetCampaign: noop, onSetFtIstraBuilding: noop, onShowSource: noop,
    }))).not.toThrow();
    cleanup();
  });

  it('GuardPanel renders a guard column that arrived as an empty object', () => {
    const state = applyRemoteSection(base(), 'guard_3', {});
    expect(() => render(h(GuardPanel, {
      guard: state.guards[3],
      guardIdx: 3,
      actions: {
        adjustGuardHp: noop, adjustGuardMaxHp: noop, setGuardEquipment: noop,
        setGuardSatchelItem: noop, toggleExpandedSatchel: noop,
      },
    }))).not.toThrow();
    cleanup();
  });
});
