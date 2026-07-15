// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';

const mockJoinCampaign = vi.fn();
const mockUpsertSection = vi.fn();
let capturedOnRemoteChange = null;

vi.mock('./useSupabaseSync', () => ({
  useSupabaseSync: (state, onRemoteChange) => {
    capturedOnRemoteChange = onRemoteChange;
    mockJoinCampaign.mockImplementation(async () => {
      capturedOnRemoteChange({ resources: { sil: 50, lux: 10 } });
      return { state: null, error: null };
    });
    return {
      campaignId: null,
      syncStatus: 'idle',
      upsertSection: mockUpsertSection,
      enqueuePendingSections: vi.fn(),
      createCampaign: vi.fn(),
      joinCampaign: mockJoinCampaign,
      leaveCampaign: vi.fn().mockResolvedValue({ error: null }),
      replaceRow: vi.fn().mockResolvedValue({ error: null }),
      isConfigured: true,
    };
  },
  guardColumn: (idx) => `guard_${idx}`,
  applyRemoteSection: (localState, sectionName, remoteSection) => {
    if (remoteSection == null) return localState;
    if (/^guard_\d+$/.test(sectionName)) {
      const idx = Number(sectionName.slice('guard_'.length));
      const guards = localState.guards.map((g, i) => i === idx ? remoteSection : g);
      return { ...localState, guards };
    }
    return { ...localState, ...remoteSection };
  },
}));

describe('useGameState join campaign clears pending state (AVE-529)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockJoinCampaign.mockClear();
    mockUpsertSection.mockClear();
    capturedOnRemoteChange = null;
  });

  it('clears pending sections and applies remote state on join', async () => {
    const { result } = renderHook(() => useGameState());

    act(() => result.current.setSil(99));

    await act(async () => {
      await result.current.sync.joinCampaign('TEST-CODE');
    });

    expect(result.current.state.sil).toBe(50);
    expect(result.current.state.lux).toBe(10);
  });

  it('does not fire upsertSection for the pending section after join', async () => {
    const { result } = renderHook(() => useGameState());

    act(() => result.current.setSil(99));

    expect(mockUpsertSection).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.sync.joinCampaign('TEST-CODE');
    });

    expect(mockUpsertSection).not.toHaveBeenCalledWith('resources', expect.anything());
  });

  it('clears the undo snapshot and label before joining', async () => {
    const { result } = renderHook(() => useGameState());

    act(() => result.current.setSil(99));

    expect(result.current.undoLabel).toBeTruthy();

    await act(async () => {
      await result.current.sync.joinCampaign('TEST-CODE');
    });

    expect(result.current.undoLabel).toBeNull();
  });
});
