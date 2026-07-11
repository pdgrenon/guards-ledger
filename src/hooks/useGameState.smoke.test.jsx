// @vitest-environment jsdom
/**
 * useGameState.smoke.test.jsx
 *
 * Guardrail against total-app-crash regressions. useGameState wires together
 * many refs, effects and callbacks whose declaration ORDER matters: a const
 * referenced before its declaration is a temporal-dead-zone ReferenceError that
 * throws during the very first render and white-screens the entire app.
 *
 * None of the pure-reducer or sync-helper unit tests catch that class of bug —
 * they never mount the hook. This test does the one thing they don't: actually
 * render useGameState and drive one action through it. Two such TDZ crashes
 * (`sync` and `flushPendingSync` used before declaration, introduced in
 * AVE-377) shipped to main precisely because nothing exercised this path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';

describe('useGameState smoke', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mounts without throwing and produces valid initial state', () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state).toBeTruthy();
    expect(Array.isArray(result.current.state.guards)).toBe(true);
    expect(result.current.state.guards).toHaveLength(8);
  });

  it('applies a basic action after mount', () => {
    const { result } = renderHook(() => useGameState());
    const before = result.current.state.sil;
    act(() => result.current.setSil(3));
    expect(result.current.state.sil).toBe(before + 3);
  });
});

describe('useGameState save-failure surfacing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sets saveError when a localStorage write is rejected instead of failing silently', () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.saveError).toBeNull();

    // Simulate quota exhaustion / blocked storage on the next persist.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    act(() => { result.current.setSil(1); });
    act(() => { vi.advanceTimersByTime(400); }); // let the save debounce fire

    expect(result.current.saveError).toBeTruthy();

    // Recovering storage clears the banner on the next successful save.
    spy.mockRestore();
    act(() => { result.current.setSil(1); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current.saveError).toBeNull();
  });
});
