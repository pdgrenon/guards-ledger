// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';
import { CAMPAIGN_ID_KEY } from './useSupabaseSync';

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
