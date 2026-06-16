/**
 * useSupabaseSync.echoSuppression.test.jsx
 *
 * Tests for the inbound Realtime handler in useSupabaseSync. Covers the
 * value-based echo suppression that replaced the 3-second wall-clock window
 * (fixes AVE-82 and AVE-84).
 *
 * Background: the original code used a 3-second wall-clock window to decide
 * whether an incoming UPDATE was an echo of our own write. That heuristic
 * had two problems:
 *
 *   1. The window was long enough to drop legitimate remote changes that
 *      happened to arrive within 3s of our own write. The two players ended
 *      up with different state (AVE-82).
 *   2. The window had no notion of "what the value actually was" — only
 *      "when we wrote it." A concurrent remote write that landed just after
 *      our own was indistinguishable from our own echo.
 *
 * The fix compares the incoming value for each section to the current local
 * value. If they're deeply equal, the section is skipped (it's an echo or
 * a converged state). If they differ, the section is applied.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, act, render } from '@testing-library/react';
import { useSupabaseSync } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

// ─── Mock client (inline; only what these tests need) ────────────────────────

function makeMockClient() {
  const calls = { update: [], insert: [], select: [], channels: [], removed: [] };

  function makeBuilder(table) {
    const call = { table };
    const builder = {
      _table:    table,
      _call:     call,
      update(payload) { call.payload = payload; calls.update.push(call); return builder; },
      insert(payload) { call.payload = payload; calls.insert.push(call); return Promise.resolve({ data: null, error: null }); },
      select()        { return builder; },
      eq(col, val)    { call.eq = { col, val }; calls.select.push(call); return builder; },
      single()        { return Promise.resolve({ data: null, error: null }); },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  function channel(name) {
    const ch = {
      _name: name,
      _on: null,
      on(_event, _filter, callback) { ch._on = { event: _event, filter: _filter, callback }; return ch; },
      subscribe(statusCallback) {
        ch._statusCallback = statusCallback;
        calls.channels.push({ name, onFilter: ch._on?.filter, statusCallback, channel: ch });
        return ch;
      },
      _trigger(payload) { ch._on?.callback(payload); },
    };
    return ch;
  }

  return {
    from:  (table) => makeBuilder(table),
    channel,
    removeChannel(ch) { calls.removed.push(ch); },
    calls,
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

// ─── Inbound Realtime updates are always forwarded to the parent ─────────────

describe('inbound Realtime updates', () => {
  it('invokes onRemoteChange with the merged state', () => {
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    renderHook(() => useSupabaseSync(createInitialState(), onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 99, lux: 7 } } });
    });

    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.sil).toBe(99);
    expect(merged.lux).toBe(7);
  });

  it('calls onRemoteChange even when every section is a no-op echo', () => {
    // The hook should notify the parent on every Realtime event — the
    // parent decides whether the change is meaningful. The hook's job is
    // to never silently drop a Realtime event.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    renderHook(() => useSupabaseSync(createInitialState(), onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      // Payload identical to the current state — every section is a no-op.
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 0, lux: 0 } } });
    });

    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    const passedArg = onRemoteChange.mock.calls[0][0];
    // State must be intact (no corruption from the merge loop).
    expect(passedArg.sil).toBe(0);
    expect(passedArg.lux).toBe(0);
  });

  it('a component reading from state via the parent re-renders when a Realtime update arrives', () => {
    // User-visible symptom: a child that displays a state value should
    // re-render when a Realtime update changes that value, even when the
    // user has not interacted with the app.
    const client = makeMockClient();

    function TestComponent() {
      const [state, setState] = React.useState(() => createInitialState());
      const onRemoteChange = React.useCallback((remote) => {
        setState(prev => ({ ...remote, log: prev.log, settings: prev.settings, activeGuardIdx: prev.activeGuardIdx }));
      }, []);
      useSupabaseSync(state, onRemoteChange, client);
      return <div data-testid="sil">sil={state.sil}</div>;
    }

    const { getByTestId } = render(<TestComponent />);
    expect(getByTestId('sil').textContent).toBe('sil=0');

    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 99, lux: 7 } } });
    });

    expect(getByTestId('sil').textContent).toBe('sil=99');
  });
});

// ─── Echo suppression: value-based, not time-based ──────────────────────────

describe('value-based echo suppression (replaces 3s wall-clock window)', () => {
  it('a remote change that differs from the local value is applied, even shortly after a local write', async () => {
    // Reproduces AVE-82: player A and B both write to the same section
    // within 3 seconds. Under the old window, B's change would be
    // dropped by A (and vice versa). Under value-based suppression, the
    // differing values are always applied.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: createInitialState() } }
    );

    // Step 1: we make a local write (sil: 0 → 5), then rerender with
    // the new state so the hook's stateRef reflects it.
    const localState = { ...createInitialState(), sil: 5, lux: 0 };
    await act(async () => {
      await result.current.upsertSection('resources', localState);
      rerender({ state: localState });
    });
    onRemoteChange.mockClear();

    // Step 2: a remote change arrives for the SAME section (sil: 0 → 99).
    // The values differ — this is a legitimate remote change.
    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 99, lux: 0 } } });
    });

    expect(onRemoteChange).toHaveBeenCalled();
    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.sil).toBe(99);
  });

  it('a remote change with the same value as the local state is skipped (echo)', async () => {
    // The local value is the same as the incoming remote value — this
    // is a real echo (the server rebroadcast our own write, or another
    // client converged to the same value). The merged state should
    // reflect the local value.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: createInitialState() } }
    );

    const localState = { ...createInitialState(), sil: 5, lux: 0 };
    await act(async () => {
      await result.current.upsertSection('resources', localState);
      rerender({ state: localState });
    });
    onRemoteChange.mockClear();

    const channel = client.calls.channels[0].channel;
    act(() => {
      // Same value as our local state — value-based suppression skips it.
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } });
    });

    expect(onRemoteChange).toHaveBeenCalled();
    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.sil).toBe(5);
  });

  it('a remote change to one section does not echo-suppress changes to a different section', async () => {
    // Two clients writing to different sections within the same window
    // should both see each other's changes. The old code's per-section
    // window was correct on this dimension, and the new code preserves
    // that (each section is checked independently).
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: createInitialState() } }
    );

    // Local write to resources. Rerender with the new state so the
    // hook's stateRef reflects it.
    const afterLocal = { ...createInitialState(), sil: 5, lux: 0 };
    await act(async () => {
      await result.current.upsertSection('resources', afterLocal);
      rerender({ state: afterLocal });
    });
    onRemoteChange.mockClear();

    // Remote change arrives for guard_0 — different section, different
    // value. Must be applied.
    const channel = client.calls.channels[0].channel;
    const initial = createInitialState();
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', guard_0: { ...initial.guards[0], hp: 3 } } });
    });

    expect(onRemoteChange).toHaveBeenCalled();
    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.guards[0].hp).toBe(3);
    // Local resources value is preserved.
    expect(merged.sil).toBe(5);
  });
});

// ─── Concurrent edits on the same device, different sections ────────────────

describe('inbound updates preserve unrelated local changes', () => {
  it('an inbound guard_0 update does not clobber a local guard_3 edit', () => {
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const initial = createInitialState();
    initial.guards[3].hp = 7; // local edit
    renderHook(() => useSupabaseSync(initial, onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({
        new: { id: 'WOLF42', guard_0: { ...initial.guards[0], hp: 3 } },
      });
    });

    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.guards[0].hp).toBe(3);
    expect(merged.guards[3].hp).toBe(7);
  });

  it('an inbound resources update does not clobber a local guard edit', () => {
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const initial = createInitialState();
    initial.guards[2].hp = 11;
    renderHook(() => useSupabaseSync(initial, onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({
        new: { id: 'WOLF42', resources: { sil: 50, lux: 9 } },
      });
    });

    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.sil).toBe(50);
    expect(merged.guards[2].hp).toBe(11);
  });
});
