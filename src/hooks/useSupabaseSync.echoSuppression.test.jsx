// @vitest-environment jsdom
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
import { useSupabaseSync, applyRemoteSection } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

// ─── Mock client (inline; only what these tests need) ────────────────────────

function makeMockClient() {
  const calls = { update: [], insert: [], select: [], rpc: [], channels: [], removed: [] };

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
    rpc(name, params) {
      calls.rpc.push({ name, params });
      return Promise.resolve({ data: null, error: null });
    },
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
    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.resources.sil).toBe(99);
    expect(sections.resources.lux).toBe(7);
  });

  it('does NOT call onRemoteChange when every section is a no-op echo (AVE-371)', () => {
    // Most Realtime events are echoes of our own writes with every section
    // skipped. Forwarding those to the parent made useGameState wipe its
    // undo snapshot within a second of every local action while a campaign
    // was active, and forced a full re-render per echo. The parent is only
    // notified when a section was actually applied.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    renderHook(() => useSupabaseSync(createInitialState(), onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      // Payload identical to the current state — every section is a no-op.
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 0, lux: 0 } } });
    });

    expect(onRemoteChange).not.toHaveBeenCalled();
  });

  it('a component reading from state via the parent re-renders when a Realtime update arrives', () => {
    // User-visible symptom: a child that displays a state value should
    // re-render when a Realtime update changes that value, even when the
    // user has not interacted with the app.
    const client = makeMockClient();

    function TestComponent() {
      const [state, setState] = React.useState(() => createInitialState());
      const onRemoteChange = React.useCallback((sections) => {
        setState(prev => {
          let merged = prev;
          for (const [section, value] of Object.entries(sections)) {
            merged = applyRemoteSection(merged, section, value);
          }
          return { ...merged, log: prev.log, settings: prev.settings, activeGuardIdx: prev.activeGuardIdx };
        });
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
    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.resources.sil).toBe(99);
  });

  it('a remote change with the same value as the local state is skipped (echo)', async () => {
    // The local value is the same as the incoming remote value — this
    // is a real echo (the server rebroadcast our own write, or another
    // client converged to the same value). Nothing is applied, so the
    // parent is not notified at all (AVE-371) — local state stands.
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

    expect(onRemoteChange).not.toHaveBeenCalled();
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
    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.guard_0.hp).toBe(3);
    // Only the changed section is in the map — resources was not in the payload.
    expect(sections.resources).toBeUndefined();
  });
});

// ─── Self-write echoes of earlier edits (AVE-314) ───────────────────────────

describe('self-write echo suppression while actively editing (AVE-314)', () => {
  // Helper: clone state with guard_0 satchel slot 0 set to `item`.
  function withGuard0Item(item) {
    const s = createInitialState();
    const satchel = s.guards[0].satchel.map((slot, i) => i === 0 ? { ...slot, item } : slot);
    s.guards = s.guards.map((g, i) => i === 0 ? { ...g, satchel } : g);
    return s;
  }

  it('drops the echo of an earlier keystroke after local has moved on', async () => {
    // The exact typing race: we send "Silver" (debounced), keep typing to
    // "Silverwood", then the Realtime echo of "Silver" arrives. It no longer
    // equals local — but it's our own write, so it must NOT be applied
    // (applying it would snap the input back to "Silver").
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: withGuard0Item('Silver') } }
    );

    // We sent "Silver" and are still on "Silver" locally at send time.
    const silver = withGuard0Item('Silver');
    await act(async () => {
      await result.current.upsertSection('guard_0', silver);
      rerender({ state: silver });
    });

    // Local advances to "Silverwood" (more keystrokes) before the echo lands.
    const silverwood = withGuard0Item('Silverwood');
    rerender({ state: silverwood });
    onRemoteChange.mockClear();

    // The server echoes our earlier "Silver" write.
    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', guard_0: silver.guards[0] } });
    });

    // The stale echo was dropped — nothing applied, parent not notified,
    // so local state ("Silverwood") stands untouched (AVE-371).
    expect(onRemoteChange).not.toHaveBeenCalled();
  });

  it('drops the echo that would revert a cleared (deleted) slot', async () => {
    // Deletion symptom: we clear a slot (item: ''), the echo of the prior
    // non-empty value must not restore it.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: withGuard0Item('Silver') } }
    );

    // We first sent "Silver" (its echo is still in flight), then clear it.
    const silver  = withGuard0Item('Silver');
    const cleared = withGuard0Item('');
    await act(async () => {
      await result.current.upsertSection('guard_0', silver);
      rerender({ state: silver });
      await result.current.upsertSection('guard_0', cleared);
      rerender({ state: cleared });
    });
    onRemoteChange.mockClear();

    // The stale echo of the earlier "Silver" write now arrives.
    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', guard_0: silver.guards[0] } });
    });

    // The slot stays cleared — the echo was dropped without notifying the
    // parent (AVE-371), so the deletion persists.
    expect(onRemoteChange).not.toHaveBeenCalled();
  });

  it('still applies a genuine remote edit to the same guard (not a self-echo)', async () => {
    // The suppression must be value-precise: another player's change to the
    // same guard, carrying a value we never wrote, is applied normally — no
    // regression to blanket per-section suppression (AVE-82 safety).
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: withGuard0Item('Silver') } }
    );

    const silver = withGuard0Item('Silver');
    await act(async () => {
      await result.current.upsertSection('guard_0', silver);
      rerender({ state: silver });
    });
    onRemoteChange.mockClear();

    // Remote change to guard_0 carrying a value we never sent.
    const channel = client.calls.channels[0].channel;
    const remote = withGuard0Item('Gold');
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', guard_0: remote.guards[0] } });
    });

    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.guard_0.satchel[0].item).toBe('Gold');
  });

  it('consumes each self-write once, so a later identical remote value is applied', async () => {
    // We send "Silver", its echo arrives and is consumed. If another player
    // later independently sets the slot to "Silver" again, that is a real
    // change (relative to a since-cleared local) and must come through.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: withGuard0Item('Silver') } }
    );

    const silver = withGuard0Item('Silver');
    await act(async () => {
      await result.current.upsertSection('guard_0', silver);
      rerender({ state: silver });
    });

    const channel = client.calls.channels[0].channel;
    // First echo of our own "Silver" write — dropped, local stays "Silver".
    act(() => { channel._trigger({ new: { id: 'WOLF42', guard_0: silver.guards[0] } }); });

    // We then clear locally.
    const cleared = withGuard0Item('');
    rerender({ state: cleared });
    onRemoteChange.mockClear();

    // Another player sets "Silver" again — the self-write entry was already
    // consumed, so this genuine change is applied.
    act(() => { channel._trigger({ new: { id: 'WOLF42', guard_0: silver.guards[0] } }); });

    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.guard_0.satchel[0].item).toBe('Silver');
  });
});

// ─── Two-player sibling-section clobber (AVE-314) ───────────────────────────

describe('another player\'s edit does not clobber my in-flight edit (AVE-314)', () => {
  function withGuard0Item(item) {
    const s = createInitialState();
    const satchel = s.guards[0].satchel.map((slot, i) => i === 0 ? { ...slot, item } : slot);
    s.guards = s.guards.map((g, i) => i === 0 ? { ...g, satchel } : g);
    return s;
  }

  it('applies the changed guard but leaves my typed-into guard alone', () => {
    // Realtime delivers the FULL row on every UPDATE. When the other player
    // edits guard_3, the payload also carries guard_0 — with an UNCHANGED
    // timestamp — holding the server's stale value. My guard_0 keystrokes are
    // still in flight, so that stale value must NOT overwrite them.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();

    // Start on an empty guard_0 (server also has empty guard_0 at t0).
    const initial = withGuard0Item('');
    const { rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: initial } }
    );

    const channel = client.calls.channels[0].channel;

    // UPDATE #1 establishes the timestamp baseline: guard_0 @ t0, guard_3 @ t0.
    act(() => {
      channel._trigger({ new: {
        id: 'WOLF42',
        guard_0: initial.guards[0], guard_0_updated_at: 't0',
        guard_3: initial.guards[3], guard_3_updated_at: 't0',
      } });
    });
    onRemoteChange.mockClear();

    // I type into guard_0 locally. This is NOT yet synced, so the server still
    // holds the empty guard_0 at t0.
    const typing = withGuard0Item('Silverwoo');
    rerender({ state: typing });

    // UPDATE #2: the OTHER player edits guard_3 (hp 5). The payload carries the
    // server's stale empty guard_0 with its timestamp still t0 (unchanged).
    act(() => {
      channel._trigger({ new: {
        id: 'WOLF42',
        guard_0: initial.guards[0], guard_0_updated_at: 't0', // stale, unchanged
        guard_3: { ...initial.guards[3], hp: 5 }, guard_3_updated_at: 't1', // changed
      } });
    });

    const sections = onRemoteChange.mock.calls[0][0];
    // The other player's guard_3 change is applied — it's in the sections map.
    expect(sections.guard_3.hp).toBe(5);
    // guard_0 timestamp didn't advance (stale filler), so it's NOT in the sections map.
    expect(sections.guard_0).toBeUndefined();
  });

  it('still applies a genuine remote edit to the same guard once its timestamp advances', () => {
    // Gating must not deafen us to real changes: when guard_0's timestamp does
    // advance (the other player really did edit guard_0), it is applied.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();

    const initial = withGuard0Item('');
    renderHook(() => useSupabaseSync(initial, onRemoteChange, client));
    const channel = client.calls.channels[0].channel;

    act(() => {
      channel._trigger({ new: {
        id: 'WOLF42',
        guard_0: initial.guards[0], guard_0_updated_at: 't0',
      } });
    });
    onRemoteChange.mockClear();

    // The other player sets guard_0 to "Gold"; timestamp advances to t1.
    const remote = withGuard0Item('Gold');
    act(() => {
      channel._trigger({ new: {
        id: 'WOLF42',
        guard_0: remote.guards[0], guard_0_updated_at: 't1',
      } });
    });

    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.guard_0.satchel[0].item).toBe('Gold');
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

    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.guard_0.hp).toBe(3);
    // guard_3 was not in the payload, so it's not in the sections map.
    expect(sections.guard_3).toBeUndefined();
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

    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.resources.sil).toBe(50);
    // guards are not in the resources sections map entry.
    expect(sections.guard_2).toBeUndefined();
  });
});

// ─── Realtime race: back-to-back UPDATEs (AVE-375) ───────────────────────────

describe('back-to-back Realtime UPDATEs (AVE-375)', () => {
  it('delivers sections from both events when two UPDATEs fire before a re-render', () => {
    // This simulates the race condition where two Realtime UPDATEs arrive
    // synchronously before React has a chance to re-render. Under the old code,
    // the second UPDATE read a stale stateRef.current (missing the first
    // UPDATE's applied sections) and the computed merged state dropped them.
    // Under the new code, each UPDATE independently passes its changed sections
    // to onRemoteChange; the merge happens inside the parent's setRaw updater
    // against the true latest state, so no section is lost.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    renderHook(() => useSupabaseSync(createInitialState(), onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      // Two back-to-back UPDATEs — no re-render between them.
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 99, lux: 7 } } });
      channel._trigger({ new: { id: 'WOLF42', guard_0: { ...createInitialState().guards[0], hp: 3 } } });
    });

    // Both events must have been forwarded to the parent.
    expect(onRemoteChange).toHaveBeenCalledTimes(2);

    const firstSections  = onRemoteChange.mock.calls[0][0];
    const secondSections = onRemoteChange.mock.calls[1][0];

    // First UPDATE: resources changed.
    expect(firstSections.resources?.sil).toBe(99);
    expect(firstSections.resources?.lux).toBe(7);
    // guard_0 was not in the first payload.
    expect(firstSections.guard_0).toBeUndefined();

    // Second UPDATE: guard_0 changed.
    expect(secondSections.guard_0?.hp).toBe(3);
    // resources was not in the second payload.
    expect(secondSections.resources).toBeUndefined();
  });

  it('both sections survive through onRemoteChange when the same section changes twice', () => {
    // Two players editing the same section rapidly. Both changes flow through
    // as separate onRemoteChange calls, ensuring neither is dropped.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const initial = createInitialState();
    renderHook(() => useSupabaseSync(initial, onRemoteChange, client));

    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 50, lux: 0 } } });
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 100, lux: 10 } } });
    });

    expect(onRemoteChange).toHaveBeenCalledTimes(2);

    const firstSections  = onRemoteChange.mock.calls[0][0];
    const secondSections = onRemoteChange.mock.calls[1][0];

    expect(firstSections.resources.sil).toBe(50);
    expect(secondSections.resources.sil).toBe(100);
    expect(secondSections.resources.lux).toBe(10);
  });

  it('local keystroke interleaved with an UPDATE affecting a different section — keystroke not clobbered', () => {
    // Simulates: user types into guard_0, a remote UPDATE for guard_3 arrives.
    // The local guard_0 edit must survive (no clobber).
    const client = makeMockClient();
    const onRemoteChange = vi.fn();

    // Initial state: guard_0 has empty satchel slot 0.
    function makeState(slot0Item) {
      const s = createInitialState();
      const satchel = s.guards[0].satchel.map((slot, i) =>
        i === 0 ? { ...slot, item: slot0Item } : slot
      );
      return { ...s, guards: s.guards.map((g, i) => i === 0 ? { ...g, satchel } : g) };
    }

    const typing = makeState('Silverwoo');
    const { rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: makeState('') } }
    );

    // User types into guard_0 locally (simulates keystroke between Realtime events).
    rerender({ state: typing });

    // Remote UPDATE for a different section (guard_3) arrives.
    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', guard_3: { ...createInitialState().guards[3], hp: 9 } } });
    });

    // The remote guard_3 change should be forwarded…
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.guard_3?.hp).toBe(9);
    // …and guard_0 is NOT in the sections map (different section, so the local
    // edit is wholly untouched — the timestamp gate on the stale server value
    // also contributes, but more fundamentally the sections map only contains
    // what the UPDATE actually changed).
    expect(sections.guard_0).toBeUndefined();
  });
});

// ─── Duplicate self-write buffer entries (AVE-528) ──────────────────────────

describe('duplicate self-write buffer entries (AVE-528)', () => {
  it('notes each dispatch separately so every echo is consumed and a later genuine remote change is applied', async () => {
    // One note per dispatch (AVE-528 follow-up / AVE-578): two upsertSection
    // calls with the same value take TWO self-write notes and produce TWO
    // Realtime echoes. Each echo consumes one note; once both are drained a
    // subsequent genuine remote change carrying the same value is applied, not
    // swallowed by a leftover note. (The old deep-equal skip took only one note
    // for the two sends, which under-counted the echoes — see the AVE-578
    // regression test below.)
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: createInitialState() } }
    );

    // Two dispatches of the identical value → two notes.
    const withSil5 = { ...createInitialState(), sil: 5, lux: 0 };
    await act(async () => {
      await result.current.upsertSection('resources', withSil5);
      rerender({ state: withSil5 });
    });
    await act(async () => {
      await result.current.upsertSection('resources', withSil5);
    });
    onRemoteChange.mockClear();

    // Both echoes arrive (one per dispatch); local is still sil=5, so each is
    // value-equal and consumes one note.
    const channel = client.calls.channels[0].channel;
    act(() => { channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } }); });
    act(() => { channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } }); });
    expect(onRemoteChange).not.toHaveBeenCalled(); // both echoes dropped

    // Local state moves on (clears resources back to 0/0).
    const cleared = createInitialState();
    rerender({ state: cleared });
    onRemoteChange.mockClear();

    // A genuine remote change carrying sil=5 arrives — both notes are drained,
    // so it must be applied.
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } });
    });

    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.resources.sil).toBe(5);
  });

  it('both echoes of a doubly-dispatched value are suppressed even after local moves on (AVE-578)', async () => {
    // The regression the deep-equal note-skip caused: a path that dispatches the
    // same value twice (undo firing alongside the original edit's still-pending
    // debounce) produces two echoes, but only one note was buffered. Once local
    // has advanced to a NEWER value, the second, unrecognized echo is applied —
    // reverting that newer edit. With one note per dispatch, both echoes are
    // recognized as our own and dropped, so the newer local value stands.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: createInitialState() } }
    );

    const withSil5 = { ...createInitialState(), sil: 5, lux: 0 };
    await act(async () => {
      await result.current.upsertSection('resources', withSil5);
      rerender({ state: withSil5 });
      await result.current.upsertSection('resources', withSil5); // duplicate dispatch
    });

    // Local advances to a newer value before either stale echo lands.
    const withSil9 = { ...createInitialState(), sil: 9, lux: 0 };
    rerender({ state: withSil9 });
    onRemoteChange.mockClear();

    // Both stale echoes of sil=5 arrive; local is now sil=9 (value-inequal), so
    // each must be recognized as our own echo and dropped — NOT applied over 9.
    const channel = client.calls.channels[0].channel;
    act(() => { channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } }); });
    act(() => { channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } }); });

    expect(onRemoteChange).not.toHaveBeenCalled();
  });

  it('flush retry after an error does not double-note — a later identical remote change is applied', async () => {
    // FlushQueue with an entry where the first merge_section RPC errors.
    // On retry (the backoff timer), the entry is sent and the echo arrives.
    // Without the AVE-528 fix, the retry would note the write a second time,
    // leaving a stale entry in the buffer that consumes a later genuine
    // remote event with the same value.
    //
    // The test simulates this by:
    //   1. Start offline so the pending queue accumulates an entry.
    //   2. Stub merge_section to fail on the first call and succeed after.
    //   3. Go online → flushQueue runs → RPC errors → entry stays queued.
    //   4. Go offline → online again → flushQueue retries → RPC succeeds.
    //   5. Send the echo → consumed cleanly.
    //   6. Clear local, send the same value as a genuine remote change → APPLIED.
    const client = makeMockClient();
    const onRemoteChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ state }) => useSupabaseSync(state, onRemoteChange, client),
      { initialProps: { state: createInitialState() } }
    );

    // Intercept rpc so the first merge_section call errors, subsequent succeed.
    let firstFail = true;
    const origRpc = client.rpc;
    client.rpc = (name, params) => {
      if (name === 'merge_section' && firstFail) {
        firstFail = false;
        return Promise.resolve({ data: null, error: { message: 'timeout', code: 'TIMEOUT' } });
      }
      return origRpc(name, params);
    };

    // Step 1: offline upsert to queue an entry.
    // The navigator stub must be in place before the hook renders for
    // `isOnline.current` to read the right value at init, and an 'offline'
    // event is dispatched to update the ref and syncStatus.
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    const withSil5 = { ...createInitialState(), sil: 5, lux: 0 };
    await act(async () => {
      await result.current.upsertSection('resources', withSil5);
      rerender({ state: withSil5 });
    });
    expect(result.current.syncStatus).toBe('offline');

    // Step 2: go online — flushQueue runs, first merge_section errors
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    onRemoteChange.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise(r => setTimeout(r, 50));
    });
    // The first RPC errored, so syncStatus is 'error', entry stayed queued
    expect(result.current.syncStatus).toBe('error');

    // Step 3: trigger another flush by going offline → online again
    // (mock already swapped to succeeding, so this flush succeeds)
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await new Promise(r => setTimeout(r, 50));
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise(r => setTimeout(r, 50));
    });

    // Flush succeeded — status back to idle
    expect(result.current.syncStatus).toBe('idle');

    // Step 4: the Realtime echo of the successful write arrives
    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } });
    });
    expect(onRemoteChange).not.toHaveBeenCalled(); // echo dropped

    // Step 5: local clears, a genuine remote "sil=5" arrives
    const cleared = createInitialState();
    rerender({ state: cleared });
    onRemoteChange.mockClear();

    act(() => {
      channel._trigger({ new: { id: 'WOLF42', resources: { sil: 5, lux: 0 } } });
    });

    // Must be applied — without the fix the stale duplicate note would consume it
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    const sections = onRemoteChange.mock.calls[0][0];
    expect(sections.resources.sil).toBe(5);
  });
});
