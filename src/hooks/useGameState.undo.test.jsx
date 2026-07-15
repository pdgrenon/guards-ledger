// @vitest-environment jsdom
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

// AVE-578: undoing an edit still inside the 400ms debounce window used to fire
// the section's upsert TWICE — once from undoLastAction's immediate write and
// again when the original edit's debounce timer elapsed (reading the restored
// state). Two dispatches produce two Realtime echoes, but the self-write buffer
// notes one per dispatch, so the second echo slipped past echo suppression and
// could revert a newer local edit. undoLastAction now cancels the pending
// debounce for that section so exactly one write (and one note) happens.
describe('undo does not double-dispatch the pending debounced write (AVE-578)', () => {
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

  it('sends the resources section exactly once when an edit is undone within the debounce window', () => {
    const { result } = renderHook(() => useGameState());

    // Edit sil — schedules the 400ms debounced upsert for 'resources'.
    act(() => { result.current.setSil(5); });
    // Undo before the debounce fires — dispatches the restore write immediately
    // and must cancel the still-pending debounce so it doesn't fire a duplicate.
    act(() => { result.current.undoLastAction(); });

    // Let the (now-cancelled) debounce window elapse.
    act(() => { vi.advanceTimersByTime(500); });

    const resourceCalls = mockUpsertSection.mock.calls.filter(([s]) => s === 'resources');
    expect(resourceCalls.length).toBe(1);
  });

  it('still flushes a co-edited section whose edit was not undone', () => {
    const { result } = renderHook(() => useGameState());

    // Two sections edited within one debounce window: resources and stash.
    act(() => { result.current.setSil(5); });
    act(() => { result.current.adjustStash('Iron', 1); });
    // Undo reverts only the last action (stash); resources stays pending.
    act(() => { result.current.undoLastAction(); });

    act(() => { vi.advanceTimersByTime(500); });

    // resources must still be flushed by the surviving debounce timer.
    const resourceCalls = mockUpsertSection.mock.calls.filter(([s]) => s === 'resources');
    const stashCalls    = mockUpsertSection.mock.calls.filter(([s]) => s === 'stash');
    expect(resourceCalls.length).toBeGreaterThanOrEqual(1);
    // stash was undone within the window → dispatched exactly once (the undo).
    expect(stashCalls.length).toBe(1);
  });
});
