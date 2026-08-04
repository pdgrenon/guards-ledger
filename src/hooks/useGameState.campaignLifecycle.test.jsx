// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState, healState, migrateV1 } from './useGameState';
import { CAMPAIGN_ID_KEY } from './useSupabaseSync';
import { SATCHEL_EXPANDED_SIZE } from '../data/constants';
import demoSave from '../data/demoSave.json';

const mockUpsertSection = vi.fn();
const mockReplaceRow    = vi.fn(() => Promise.resolve({ error: null }));
const mockCreateCampaign = vi.fn(() => Promise.resolve({ id: 'NEW1', error: null }));

vi.mock('./useSupabaseSync', () => ({
  useSupabaseSync: () => ({
    upsertSection: mockUpsertSection,
    leaveCampaign: vi.fn(),
    joinCampaign: vi.fn(),
    createCampaign: mockCreateCampaign,
    replaceRow: mockReplaceRow,
    enqueuePendingSections: vi.fn(),
    campaignId: 'test-campaign',
    syncStatus: 'idle',
    syncError: null,
    isConfigured: true,
  }),
  guardColumn: (i) => `guard_${i}`,
  applyRemoteSection: vi.fn(),
  CAMPAIGN_ID_KEY: 'guards_ledger_campaign_id',
}));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CAMPAIGN_ID_KEY, 'test-campaign');
  mockUpsertSection.mockClear();
  mockReplaceRow.mockClear();
  mockCreateCampaign.mockClear();
});

describe('loadDemoData propagates to an active campaign (AVE-577)', () => {
  it('pushes the demo state as a full-row replacement so the campaign does not diverge', () => {
    const { result } = renderHook(() => useGameState());

    act(() => { result.current.loadDemoData(); });

    // Full-row replacement pushed to the shared campaign row (mirrors resetState).
    expect(mockReplaceRow).toHaveBeenCalledTimes(1);
    const pushed = mockReplaceRow.mock.calls[0][0];
    // The demo state, with onboarding marked seen.
    expect(pushed.settings.hasSeenOnboarding).toBe(true);
    expect(pushed.guards.length).toBe(8);
  });
});

// loadDemoData was the last whole-state replacement path still skipping
// healState — importState got it in AVE-365, resetState is healthy by
// construction. Without it, any shape drift in the hand-maintained demo save
// reached React state, localStorage, AND (via replaceRow) the shared campaign
// row, where the deep merge keeps it forever (AVE-927).
describe('loadDemoData heals the demo save before installing it (AVE-927)', () => {
  it('pads every guard satchel to 8 slots while keeping the demo items', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.loadDemoData(); });

    const guards = result.current.state.guards;
    expect(guards).toHaveLength(8);
    for (const g of guards) expect(g.satchel).toHaveLength(SATCHEL_EXPANDED_SIZE);
    // The demo's populated slots survive the padding (the AVE-521 guarantee).
    const carried = guards.flatMap(g => g.satchel.filter(s => s.item).map(s => s.item));
    expect(carried.length).toBeGreaterThan(0);
  });

  it('heals the cities to the full six, each with the legacy quest flags', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.loadDemoData(); });

    const cities = result.current.state.cities;
    expect(cities).toHaveLength(6);
    for (const c of cities) {
      expect(c).toHaveProperty('puzzleQuestDone');
      expect(c).toHaveProperty('bounty1Done');
      expect(c).toHaveProperty('bounty2Done');
    }
  });

  it('carries no retired keys — the fixture no longer ships them and heal invents none', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.loadDemoData(); });

    const { stonebound, campaign } = result.current.state;
    for (const loc of stonebound.locations) expect(loc).not.toHaveProperty('type');
    expect(campaign.locations).not.toHaveProperty('bounties');
  });

  it('pushes the same healed object to replaceRow that it puts in state', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.loadDemoData(); });

    const pushed = mockReplaceRow.mock.calls[0][0];
    for (const loc of pushed.stonebound.locations) expect(loc).not.toHaveProperty('type');
    expect(pushed.campaign.locations).not.toHaveProperty('bounties');
    expect(pushed.guards.every(g => g.satchel.length === SATCHEL_EXPANDED_SIZE)).toBe(true);
  });

  it('preserves the demo content through healing', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.loadDemoData(); });

    const { campaign, stonebound, settings } = result.current.state;
    expect(campaign.campaignId).toBe(2);
    expect(campaign.completedBounties).toHaveLength(7);
    expect(campaign.completedPuzzleQuests).toHaveLength(3);
    expect(stonebound.max).toBe(6);
    expect(stonebound.locations).toHaveLength(5);
    expect(settings.hasSeenOnboarding).toBe(true);
  });

  it('healState never rejects the shipped demo save', () => {
    // No `if (!healed)` branch exists in loadDemoData, deliberately — this is
    // what pins that. A future demo-save edit that broke it would fail here
    // instead of silently dropping the player into a blank ledger.
    expect(healState(migrateV1(demoSave))).not.toBeNull();
  });
});

describe('createCampaign clears the pending debounce (AVE-581)', () => {
  it('clears pending sections before delegating so a stale timer cannot no-op a pending edit', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useGameState());

      // Edit sil — schedules a 400ms debounced upsert for 'resources'.
      act(() => { result.current.setSil(5); });
      // Create a campaign before the debounce fires.
      act(() => { result.current.sync.createCampaign(); });

      // Delegated to the underlying sync.createCampaign.
      expect(mockCreateCampaign).toHaveBeenCalledTimes(1);

      // The still-pending debounce must have been cleared: no upsertSection
      // fires when its window elapses (it would have captured a null campaignId
      // and no-op'd anyway, but the pending set must not linger).
      mockUpsertSection.mockClear();
      act(() => { vi.advanceTimersByTime(500); });
      expect(mockUpsertSection).not.toHaveBeenCalled();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
