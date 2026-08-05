// @vitest-environment jsdom
/**
 * useSupabaseSync.replaceRow.test.jsx
 *
 * A full-row replacement (import / reset / demo load) rebuilds the whole of
 * local state, so every payload sitting in the pending upsert queue — queued
 * offline, or re-queued by a failed write — is dead data: nothing in it is
 * reachable from the new local state any more.
 *
 * Left in the queue, the next flush pushes those payloads through
 * `merge_section`, whose field-level deep merge folds the pre-replacement
 * ledger back into the freshly replaced row — the exact AVE-374 chimera the
 * replacement exists to prevent. `applyRemoteRow`'s pending-queue guard then
 * suppresses the row that would have corrected local, so the divergence is
 * invisible on this device too. The generation gate (AVE-527) only delays it:
 * the rejected write is re-queued, the refetch adopts the new generation, and
 * the retry commits the stale payload against the reset row.
 *
 * `joinCampaign` and `leaveCampaign` already clear the queue for this reason.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSupabaseSync, PENDING_QUEUE_KEY } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

const STALE_STASH = { stash: { Iron: 9 }, stonebound: { max: 4, locations: [] } };

// `rpcResult` lets a test keep a queued entry stuck (a failing write leaves it
// queued for retry), which is the state replaceRow has to deal with.
function makeMockClient(rpcResult = { data: {}, error: null }) {
  const calls = { rpc: [], update: [] };
  let result = rpcResult;

  function makeBuilder(table) {
    const call = { table };
    const builder = {
      update(payload) { call.payload = payload; calls.update.push(call); return builder; },
      insert()        { return Promise.resolve({ data: null, error: null }); },
      select()        { return builder; },
      eq(col, val)    { call.eq = { col, val }; return builder; },
      single()        { return Promise.resolve({ data: { generation: 3 }, error: null }); },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from: makeBuilder,
    channel() {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel() {},
    rpc(name, params) {
      calls.rpc.push({ name, params });
      return Promise.resolve(result);
    },
    setRpcResult(next) { result = next; },
    calls,
  };
}

function queuedSections() {
  const raw = localStorage.getItem(PENDING_QUEUE_KEY);
  return raw ? JSON.parse(raw).map(([section]) => section) : [];
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('guards_ledger_campaign_id', 'WOLF-7F3K9Q');
  localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify([['stash', STALE_STASH]]));
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('replaceRow discards writes queued before the replacement (AVE-374)', () => {
  it('drops the stale queue entry instead of merging it into the replaced row', async () => {
    // A write that keeps failing: the boot drain retries it and leaves it
    // queued, which is exactly the state a player is in when they give up and
    // reset/import.
    const client = makeMockClient({ data: null, error: { message: 'network down' } });
    const state  = createInitialState();

    const { result } = renderHook(() => useSupabaseSync(state, () => {}, client));

    // Boot drain runs and fails — the entry survives, as designed (AVE-522).
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(queuedSections()).toEqual(['stash']);

    // The player resets. The replacement carries the whole new ledger.
    client.setRpcResult({ data: {}, error: null });
    await act(async () => {
      await result.current.replaceRow(createInitialState());
    });

    expect(queuedSections()).toEqual([]);

    // Nothing re-sends the pre-reset stash once the connection recovers.
    client.calls.rpc.length = 0;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });
    const stashWrites = client.calls.rpc.filter(
      c => c.name === 'merge_section' && c.params.section_name === 'stash'
    );
    expect(stashWrites).toHaveLength(0);
  });
});
