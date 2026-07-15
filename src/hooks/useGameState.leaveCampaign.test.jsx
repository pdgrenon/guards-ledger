// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';
import { CAMPAIGN_ID_KEY } from './useSupabaseSync';

const mockUpsertSection = vi.fn();
const mockLeaveCampaign = vi.fn();

vi.mock('./useSupabaseSync', () => ({
  useSupabaseSync: () => ({
    upsertSection: mockUpsertSection,
    leaveCampaign: mockLeaveCampaign,
    enqueuePendingSections: vi.fn(),
    replaceRow: vi.fn(),
    campaignId: 'test-campaign',
    syncStatus: 'idle',
    syncError: null,
    createCampaign: vi.fn(),
    joinCampaign: vi.fn(),
    isConfigured: true,
  }),
  guardColumn: (i) => `guard_${i}`,
  applyRemoteSection: vi.fn(),
  CAMPAIGN_ID_KEY: 'guards_ledger_campaign_id',
}));

describe('leaveCampaign flushes pending sync before compacting (AVE-525)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(CAMPAIGN_ID_KEY, 'test-campaign');
    mockUpsertSection.mockClear();
    mockLeaveCampaign.mockClear();
  });

  it('flushes pending upsert with tombstones still present before compacting and leaving', () => {
    const { result } = renderHook(() => useGameState());

    const planText = 'Test plan for deletion';
    act(() => { result.current.addPlan(planText); });

    const planId = result.current.state.campaign.plans[0].id;

    mockUpsertSection.mockClear();

    act(() => { result.current.deletePlan(planId); });
    act(() => { result.current.sync.leaveCampaign(); });

    const campaignCalls = mockUpsertSection.mock.calls.filter(
      ([section]) => section === 'campaign'
    );
    expect(campaignCalls.length).toBeGreaterThanOrEqual(1);

    const lastCampaignCall = campaignCalls[campaignCalls.length - 1];
    const payload = lastCampaignCall[1];
    const deletedPlan = payload.campaign.plans.find(p => p.id === planId);
    expect(deletedPlan).toBeDefined();
    expect(deletedPlan.deleted).toBe(true);

    expect(mockLeaveCampaign).toHaveBeenCalledTimes(1);
  });
});
