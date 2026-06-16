/**
 * Behavioural tests for the useSupabaseSync hook against an in-memory Supabase
 * test double (src/test/mockSupabase.js). Unlike useSupabaseSync.helpers.test.js
 * (which covers the pure section↔column functions), these exercise the live
 * hook: targeted column upserts, per-section echo suppression, the offline
 * queue + reconnect flush, and — most importantly — two clients in the same
 * campaign converging through the Realtime bus.
 *
 * This is the harness the multiplayer-sync bug fixes (AVE-82, AVE-84) and the
 * field-level merge (AVE-94) should grow reproduction tests in. See AVE-97.
 *
 * The Supabase module is mocked to hand back a client bound to a per-test
 * backend held on globalThis.__SYNC_BACKEND__, and the env vars are stubbed so
 * the module-level `supabase` singleton is constructed (it is null otherwise).
 */
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createBackend } from '../test/mockSupabase.js';
import { createInitialState } from '../data/constants';

vi.mock('@supabase/supabase-js', async () => {
  const { createMockClient } = await import('../test/mockSupabase.js');
  return { createClient: () => createMockClient(() => globalThis.__SYNC_BACKEND__) };
});

let useSupabaseSync;
let guardColumn;

beforeAll(async () => {
  // Must be set before the module is first imported so `supabase` is non-null.
  vi.stubEnv('VITE_SUPABASE_URL', 'http://test.supabase.local');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  const mod = await import('./useSupabaseSync.js');
  useSupabaseSync = mod.useSupabaseSync;
  guardColumn = mod.guardColumn;
});

beforeEach(() => {
  globalThis.__SYNC_BACKEND__ = createBackend();
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

const backend = () => globalThis.__SYNC_BACKEND__;

/** Render the hook and create a campaign; returns { result, id, onRemote }. */
async function renderJoinedClient(state, onRemote = vi.fn()) {
  const hook = renderHook(() => useSupabaseSync(state, onRemote));
  let created;
  await act(async () => { created = await hook.result.current.createCampaign(); });
  return { result: hook.result, id: created.id, onRemote };
}

describe('upsertSection', () => {
  it('writes a simple section to its own column with a timestamp', async () => {
    const state = createInitialState();
    const { result, id } = await renderJoinedClient(state);

    await act(async () => {
      await result.current.upsertSection('resources', { ...state, sil: 42, lux: 7 });
    });

    const row = backend().rows.get(id);
    expect(row.resources).toEqual({ sil: 42, lux: 7 });
    expect(row.resources_updated_at).toBeTruthy();
  });

  it('writes only the targeted guard column', async () => {
    const state = createInitialState();
    const { result, id } = await renderJoinedClient(state);

    await act(async () => {
      const guards = state.guards.map((g, i) => (i === 2 ? { ...g, hp: 3 } : g));
      await result.current.upsertSection(guardColumn(2), { ...state, guards });
    });

    const row = backend().rows.get(id);
    expect(row.guard_2.hp).toBe(3);
    // A sibling guard column is untouched by this write.
    expect(row.guard_5).toEqual(state.guards[5]);
  });
});

describe('echo suppression', () => {
  it('does not re-apply a client\'s own write back onto itself', async () => {
    const state = createInitialState();
    const onRemote = vi.fn();
    const { result } = await renderJoinedClient(state, onRemote);
    onRemote.mockClear();

    await act(async () => {
      await result.current.upsertSection('resources', { ...state, sil: 77 });
    });

    // The Realtime echo for the section we just wrote is suppressed, so no
    // remote-change callback should ever carry our own sil=77 back to us.
    for (const call of onRemote.mock.calls) {
      expect(call[0].sil).not.toBe(77);
    }
  });
});

describe('two-client convergence', () => {
  it('propagates one client\'s edit to another client in the same campaign', async () => {
    const state = createInitialState();
    const onA = vi.fn();
    const { result: A, id } = await renderJoinedClient(state, onA);

    const onB = vi.fn();
    const hookB = renderHook(() => useSupabaseSync(state, onB));
    await act(async () => { await hookB.result.current.joinCampaign(id); });
    onB.mockClear();

    await act(async () => {
      await A.current.upsertSection('resources', { ...state, sil: 99 });
    });

    expect(onB).toHaveBeenCalled();
    const mergedB = onB.mock.calls.at(-1)[0];
    expect(mergedB.sil).toBe(99);
  });

  it('lets two clients edit different guards without clobbering each other', async () => {
    const state = createInitialState();
    const onA = vi.fn();
    const { result: A, id } = await renderJoinedClient(state, onA);

    const onB = vi.fn();
    const hookB = renderHook(() => useSupabaseSync(state, onB));
    await act(async () => { await hookB.result.current.joinCampaign(id); });

    await act(async () => {
      const guards = state.guards.map((g, i) => (i === 0 ? { ...g, hp: 11 } : g));
      await A.current.upsertSection(guardColumn(0), { ...state, guards });
    });
    await act(async () => {
      const guards = state.guards.map((g, i) => (i === 1 ? { ...g, hp: 22 } : g));
      await hookB.result.current.upsertSection(guardColumn(1), { ...state, guards });
    });

    const row = backend().rows.get(id);
    expect(row.guard_0.hp).toBe(11);
    expect(row.guard_1.hp).toBe(22);
  });
});

describe('offline queue', () => {
  it('queues an upsert while offline and flushes it on reconnect', async () => {
    const state = createInitialState();
    const { result, id } = await renderJoinedClient(state);

    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await act(async () => {
      await result.current.upsertSection('resources', { ...state, sil: 5 });
    });

    // Nothing written yet — still the initial value from campaign creation.
    expect(backend().rows.get(id).resources.sil).toBe(0);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise((r) => setTimeout(r, 0)); // let the async flush settle
    });

    expect(backend().rows.get(id).resources.sil).toBe(5);
  });
});
