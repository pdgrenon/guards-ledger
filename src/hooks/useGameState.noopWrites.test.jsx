// @vitest-environment jsdom
/**
 * useGameState.noopWrites.test.jsx
 *
 * Every "set"-style reducer returns its input state unchanged when the write
 * would change nothing (reduceSetCampaign, reduceSetFtIstraBuilding,
 * reduceSetCampaignLocation, reduceUpdateDynamicLocation,
 * reduceUpdateStoneboundLocation — AVE-536). That guard used to stop only at the
 * log entry: `setState` still overwrote the undo snapshot, relabelled the Undo
 * button, and dispatched a Supabase write for the section.
 *
 * The reachable symptom is a tap on an already-selected control — the active
 * Campaign button in CampaignProgressCard, or the active state pill on a Ft.
 * Istra BuildingCard. Both are plain buttons that fire on every tap, so a player
 * confirming which campaign they are on silently threw away their pending undo
 * (replacing it with a snapshot of the state they are already in, labelled by
 * deriveUndoLabel's generic "Campaign update" fallback, since no log entry was
 * added to name it) and put a redundant write on the wire.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';
import { CAMPAIGN_ID_KEY } from './useSupabaseSync';

const mockUpsertSection = vi.fn();

vi.mock('./useSupabaseSync', () => ({
  useSupabaseSync: () => ({
    upsertSection: mockUpsertSection,
    leaveCampaign: vi.fn(),
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

function campaignWrites() {
  return mockUpsertSection.mock.calls.filter(([s]) => s === 'campaign');
}

describe('a no-op reducer result is not treated as an action (AVE-536)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem(CAMPAIGN_ID_KEY, 'test-campaign');
    mockUpsertSection.mockClear();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('keeps the pending undo when the already-active campaign is re-selected', () => {
    const { result } = renderHook(() => useGameState());

    act(() => { result.current.setSil(5); });
    const realUndo = result.current.undoLabel;
    expect(realUndo).toContain('Sil');

    // state.campaign.campaignId starts at 1 — this is the tap on the button
    // that is already active.
    act(() => { result.current.setCampaign(1); });

    expect(result.current.undoLabel).toBe(realUndo);
  });

  it('dispatches no sync write when the already-active campaign is re-selected', () => {
    const { result } = renderHook(() => useGameState());

    act(() => { result.current.setCampaign(1); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(campaignWrites()).toHaveLength(0);
  });

  it('dispatches no sync write when a building is set to the state it is already in', () => {
    const { result } = renderHook(() => useGameState());

    // An absent ftIstraBuildings key reads as 'not_owned' everywhere, so this is
    // the already-active pill on a building nobody has touched.
    act(() => { result.current.setFtIstraBuilding('Lumbermill', 'not_owned'); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(campaignWrites()).toHaveLength(0);
    expect(result.current.undoLabel).toBe(null);
  });

  it('still records the undo and the write for a real change', () => {
    const { result } = renderHook(() => useGameState());

    act(() => { result.current.setCampaign(2); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(result.current.state.campaign.campaignId).toBe(2);
    expect(result.current.undoLabel).toContain('Campaign 2');
    expect(campaignWrites()).toHaveLength(1);
  });

  it('leaves the undo snapshot usable after a no-op tap', () => {
    const { result } = renderHook(() => useGameState());

    act(() => { result.current.setSil(5); });
    expect(result.current.state.sil).toBe(5);

    act(() => { result.current.setCampaign(1); });   // no-op tap in between
    act(() => { result.current.undoLastAction(); });

    // The undo still restores the pre-Sil state rather than the state the
    // no-op snapshotted (which was already sil: 5).
    expect(result.current.state.sil).toBe(0);
  });
});
