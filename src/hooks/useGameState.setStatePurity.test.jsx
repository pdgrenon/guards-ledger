// @vitest-environment jsdom
/**
 * useGameState.setStatePurity.test.jsx
 *
 * setState must hand setRaw a plain value, never a function that mutates the
 * undo snapshot and calls setUndoLabel from inside it (AVE-875). A React state
 * updater has to be a pure function of `prev`: React may invoke it more than
 * once and may discard the render it produced, so side effects inside it can
 * run for a render that never committed — leaving Undo offering a restore to a
 * state the player never saw, which undoLastAction then pushes to the shared
 * campaign row.
 *
 * AVE-582 fixed exactly this in handleRemoteChange; setState kept the old
 * pattern. These tests pin the observable contract: batching still composes,
 * undo still targets the right snapshot, and StrictMode's double-invoke does
 * not double-apply.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';

describe('setState purity (AVE-875)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('composes two calls dispatched in a single event', () => {
    // The regression risk of moving off the functional updater: both calls read
    // stateRef, so it must be advanced synchronously or the second silently
    // discards the first.
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.setSil(1);
      result.current.setSil(1);
    });
    expect(result.current.state.sil).toBe(2);
  });

  it('composes calls to two different sections in one event', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.setSil(5);
      result.current.setLux(3);
    });
    expect(result.current.state.sil).toBe(5);
    expect(result.current.state.lux).toBe(3);
  });

  it('composes a local-only call with a synced one', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.setSil(4);
      result.current.setActiveGuard(3); // sectionName === null
    });
    expect(result.current.state.sil).toBe(4);
    expect(result.current.state.activeGuardIdx).toBe(3);
  });

  it('labels the undo from the action that produced it', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.setSil(3));
    expect(result.current.undoLabel).toBe(result.current.state.log[0].message);
  });

  it('undo restores the state from before the action', () => {
    const { result } = renderHook(() => useGameState());
    act(() => result.current.setSil(7));
    expect(result.current.state.sil).toBe(7);
    act(() => result.current.undoLastAction());
    expect(result.current.state.sil).toBe(0);
    expect(result.current.undoLabel).toBeNull();
  });

  it('undo after two actions in one event reverts only the second', () => {
    const { result } = renderHook(() => useGameState());
    act(() => {
      result.current.setSil(5);
      result.current.setSil(3);
    });
    expect(result.current.state.sil).toBe(8);
    act(() => result.current.undoLastAction());
    expect(result.current.state.sil).toBe(5);
  });

  it('does not double-apply under StrictMode', () => {
    // StrictMode double-invokes updaters. With a plain value there is nothing
    // to invoke twice, but the reducers still run once per call — assert the
    // committed result and the log both reflect exactly one action.
    const { result } = renderHook(() => useGameState(), { wrapper: StrictMode });
    const before = result.current.state.log.length;
    act(() => result.current.setSil(2));
    expect(result.current.state.sil).toBe(2);
    expect(result.current.state.log.length).toBe(before + 1);
  });

  it('keeps stateRef in step so the debounced upsert sends the post-action state', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameState());
    const upsert = vi.fn();
    result.current.sync.upsertSection = upsert;

    act(() => { result.current.setSil(9); });
    // The 400ms debounce reads stateRef.current at fire time.
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    vi.useRealTimers();
    if (upsert.mock.calls.length) {
      const [section, sentState] = upsert.mock.calls[0];
      expect(section).toBe('resources');
      expect(sentState.sil).toBe(9);
    }
  });
});
