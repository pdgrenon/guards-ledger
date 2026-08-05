// @vitest-environment jsdom
/**
 * useGameState.persistence.test.jsx — AVE-936
 *
 * The local save runs on a 400ms debounce. Only `beforeunload` used to flush
 * it, and mobile browsers routinely discard a backgrounded tab — or kill a
 * swiped-away standalone PWA — without ever firing that event. The hidden path
 * called flushPendingSync only, whose enqueuePendingSections returns
 * immediately when no campaign is active, so in solo mode hiding the tab did
 * nothing durable at all and the last edit was simply lost.
 *
 * These tests deliberately never advance past the debounce: the whole point is
 * that the write happens because of the lifecycle event, not because the timer
 * eventually fired.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameState } from './useGameState';

const STORAGE_KEY = 'guards_ledger_v2';

function setVisibility(value) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
}

function savedSil() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).sil : null;
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
  // visibilityState is a shared document property — leaking 'hidden' would
  // change the hidden-path branch for every later test file.
  setVisibility('visible');
  localStorage.clear();
});

describe('useGameState — last-chance persistence (AVE-936)', () => {
  it('writes local state when the tab is hidden, before the save debounce fires', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.setSil(7); });

    // Precondition: the debounce has NOT elapsed, so nothing is saved yet.
    expect(savedSil()).toBe(null);

    setVisibility('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(savedSil()).toBe(7);
  });

  it('writes local state on pagehide', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.setSil(4); });
    expect(savedSil()).toBe(null);

    act(() => { window.dispatchEvent(new Event('pagehide')); });

    expect(savedSil()).toBe(4);
  });

  it('still writes local state on beforeunload', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.setSil(5); });

    act(() => { window.dispatchEvent(new Event('beforeunload')); });

    expect(savedSil()).toBe(5);
  });

  it('does not write when visibilitychange fires while still visible', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.setSil(3); });

    setVisibility('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(savedSil()).toBe(null);
  });

  it('persists the newest value when several edits land in one debounce window', () => {
    const { result } = renderHook(() => useGameState());
    act(() => { result.current.setSil(2); });
    act(() => { result.current.setSil(3); });

    setVisibility('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(savedSil()).toBe(5);
  });

  it('removes every listener on unmount', () => {
    const { result, unmount } = renderHook(() => useGameState());
    act(() => { result.current.setSil(9); });
    unmount();
    localStorage.clear();

    act(() => { window.dispatchEvent(new Event('pagehide')); });
    setVisibility('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(localStorage.getItem(STORAGE_KEY)).toBe(null);
  });
});
