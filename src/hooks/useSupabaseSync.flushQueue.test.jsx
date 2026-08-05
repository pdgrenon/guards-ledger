// @vitest-environment jsdom
/**
 * useSupabaseSync.flushQueue.test.jsx
 *
 * `flushQueue` snapshots the pending queue before its first await, then sends
 * each entry in turn. Clearing the queue afterwards by section NAME threw away
 * anything that landed in it while the batch was in flight.
 *
 * That window is reachable: `upsertSection` routes straight to the queue when
 * `navigator.onLine` is false, and a generation rejection re-queues. So going
 * offline mid-flush and editing meant the edit was deleted without ever being
 * sent — and because `applyRemoteRow` skips sections that are still queued,
 * deleting the entry also removed the guard that was keeping the next
 * `refetchRow` from reverting the edit to the older server value.
 *
 * The queue is keyed by section so newer data replaces older; the fix is to
 * delete only the exact payload that was sent. `extractSection` builds a fresh
 * object per call, so identity is a precise "unchanged since dispatch" test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSupabaseSync, PENDING_QUEUE_KEY } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

const QUEUED_STASH = { stash: { Iron: 1 }, stonebound: { max: 4, locations: [] } };

// An RPC whose promise this test resolves by hand, so an edit can be made
// while the flush is genuinely mid-flight.
function makeMockClient() {
  const calls = { rpc: [] };
  let release;
  const gate = new Promise(resolve => { release = resolve; });

  return {
    from() {
      const builder = {
        update()  { return builder; },
        insert()  { return Promise.resolve({ data: null, error: null }); },
        select()  { return builder; },
        eq()      { return builder; },
        single()  { return Promise.resolve({ data: { generation: 0 }, error: null }); },
        then(onFulfilled, onRejected) {
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    channel() {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel() {},
    async rpc(name, params) {
      calls.rpc.push({ name, params });
      await gate;
      return { data: {}, error: null };
    },
    releaseRpc: () => release(),
    calls,
  };
}

function queuedEntries() {
  const raw = localStorage.getItem(PENDING_QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('guards_ledger_campaign_id', 'WOLF-7F3K9Q');
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify([['stash', QUEUED_STASH]]));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('flushQueue', () => {
  it('keeps an edit queued while the flush that predates it is still in flight', async () => {
    const client = makeMockClient();
    const state = { ...createInitialState(), stash: { Iron: 1 } };
    const { result } = renderHook(() => useSupabaseSync(state, () => {}, client));

    // The boot drain picks up the persisted entry and dispatches it; the RPC
    // is gated open, so the flush is now mid-batch.
    await act(async () => { await Promise.resolve(); });
    expect(client.calls.rpc).toHaveLength(1);

    // The connection drops and the player keeps playing — a newer stash value
    // goes straight to the queue under the same section name.
    const newer = { ...state, stash: { Iron: 7 } };
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await result.current.upsertSection('stash', newer);
    });
    expect(queuedEntries()).toEqual([['stash', { stash: { Iron: 7 }, stonebound: state.stonebound }]]);

    // The in-flight write now succeeds. It committed the OLD value, so the
    // newer one must survive to be sent on the next flush.
    await act(async () => { client.releaseRpc(); await Promise.resolve(); await Promise.resolve(); });

    expect(queuedEntries()).toEqual([['stash', { stash: { Iron: 7 }, stonebound: state.stonebound }]]);
  });

  it('drains an entry that was not superseded', async () => {
    const client = makeMockClient();
    const state = { ...createInitialState(), stash: { Iron: 1 } };
    renderHook(() => useSupabaseSync(state, () => {}, client));

    await act(async () => { await Promise.resolve(); });
    expect(client.calls.rpc).toHaveLength(1);

    await act(async () => { client.releaseRpc(); await Promise.resolve(); await Promise.resolve(); });

    expect(queuedEntries()).toEqual([]);
  });
});
