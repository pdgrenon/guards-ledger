// @vitest-environment jsdom
/**
 * useSupabaseSync.refetchErrors.test.jsx
 *
 * `refetchRow` pulls the campaign row on boot, reconnect and foreground, and it
 * was the only network call in the module that failed completely silently — no
 * status, no message, no flag, just an early return.
 *
 * That matters because a healthy Realtime subscribe leaves `syncStatus` on
 * 'idle', which SyncBadge paints green and labels "Synced". A failed boot
 * refetch therefore left local state stale behind a badge asserting the
 * opposite, and nothing retried the read: the backoff ladder only arms on
 * 'error', and `recoverSync` only re-reads when the channel is known down.
 *
 * The fix mirrors the existing `channelDown` / `replaceFailed` pattern.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSupabaseSync, CAMPAIGN_ID_KEY } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

const CAMPAIGN = 'WOLF-7F3K9Q';

function makeMockClient({ selectResult }) {
  const calls = { select: 0 };
  const builder = {
    select() { return builder; },
    eq()     { return builder; },
    single() { calls.select += 1; return Promise.resolve(selectResult()); },
    update() { return builder; },
    insert() { return Promise.resolve({ data: null, error: null }); },
  };
  return {
    calls,
    from()          { return builder; },
    rpc()           { return Promise.resolve({ data: {}, error: null }); },
    channel()       { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
  };
}

const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
  vi.restoreAllMocks();
});

describe('refetchRow failure is surfaced', () => {
  it('a failed boot refetch sets error status instead of leaving the badge green', async () => {
    const client = makeMockClient({
      selectResult: () => ({ data: null, error: { code: 'XX000', message: 'network down' } }),
    });
    const { result } = renderHook(() =>
      useSupabaseSync(createInitialState(), noop, client));

    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    expect(result.current.syncError).toMatch(/could not read the campaign/i);
    expect(result.current.syncError).toContain('network down');
  });

  it('a campaign deleted server-side says so, rather than reporting a generic failure', async () => {
    const client = makeMockClient({
      // PostgREST's "no rows" for .single().
      selectResult: () => ({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
    });
    const { result } = renderHook(() =>
      useSupabaseSync(createInitialState(), noop, client));

    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    expect(result.current.syncError).toContain(CAMPAIGN);
    expect(result.current.syncError).toMatch(/no longer exists/i);
  });

  it('a successful refetch reports no error', async () => {
    const client = makeMockClient({
      selectResult: () => ({ data: { id: CAMPAIGN, generation: 0 }, error: null }),
    });
    const { result } = renderHook(() =>
      useSupabaseSync(createInitialState(), noop, client));

    await waitFor(() => expect(client.calls.select).toBeGreaterThan(0));
    expect(result.current.syncStatus).not.toBe('error');
    expect(result.current.syncError).toBeNull();
  });

  it('a successful read does not clear an error a failed write set', async () => {
    // A read succeeding says nothing about whether writes are landing, so it
    // must not paint the badge green over a write failure.
    const client = makeMockClient({
      selectResult: () => ({ data: { id: CAMPAIGN, generation: 0 }, error: null }),
    });
    client.rpc = () => Promise.resolve({ data: null, error: { message: 'write rejected' } });

    const { result } = renderHook(() =>
      useSupabaseSync(createInitialState(), noop, client));
    await waitFor(() => expect(client.calls.select).toBeGreaterThan(0));

    await act(async () => {
      result.current.upsertSection('resources', createInitialState());
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));

    // A later successful refetch must leave that error standing.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.syncStatus).toBe('error');
  });
});
