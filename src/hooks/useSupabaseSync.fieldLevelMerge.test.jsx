// @vitest-environment jsdom
/**
 * useSupabaseSync.fieldLevelMerge.test.jsx
 *
 * Tests for the field-level merge RPC wiring. The actual deep-merge logic
 * lives server-side in supabase/migrations/0002_field_level_merge.sql —
 * these tests cover the client-side behavior: the call shape, the per-
 * section write pattern, and the error/retry semantics.
 *
 * The merge semantics (recursive JSONB merge on the server) are documented
 * in the migration file and are not duplicated here. They are exercised
 * end-to-end in the deployed Supabase instance.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSupabaseSync } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

// ─── Mock client ────────────────────────────────────────────────────────────

function makeMockClient() {
  const calls = { update: [], insert: [], select: [], rpc: [], channels: [], removed: [] };

  function makeBuilder(table) {
    const call = { table };
    const builder = {
      _table: table,
      _call: call,
      update(payload) { call.payload = payload; calls.update.push(call); return builder; },
      insert(payload) { call.payload = payload; calls.insert.push(call); return Promise.resolve({ data: null, error: null }); },
      select() { return builder; },
      eq(col, val) { call.eq = { col, val }; calls.select.push(call); return builder; },
      single() { return Promise.resolve({ data: null, error: null }); },
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
    from: (table) => makeBuilder(table),
    channel,
    removeChannel(ch) { calls.removed.push(ch); },
    // Per-RPC override map. Tests can register custom responses for specific
    // RPC names; anything not registered returns success by default.
    rpc(name, params) {
      calls.rpc.push({ name, params });
      const override = rpcOverrides[name] ?? { data: null, error: null };
      return Promise.resolve(override);
    },
    calls,
  };
}

const rpcOverrides = {};
function setRpcResponse(name, response) { rpcOverrides[name] = response; }
function clearRpcOverrides() { for (const k of Object.keys(rpcOverrides)) delete rpcOverrides[k]; }

beforeEach(() => {
  localStorage.clear();
  clearRpcOverrides();
});
afterEach(() => { localStorage.clear(); clearRpcOverrides(); vi.unstubAllGlobals(); });

// ─── RPC call shape ──────────────────────────────────────────────────────────

describe('upsertSection — RPC call shape', () => {
  it('sends merge_section with the section payload and campaign id', async () => {
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 42, lux: 7 });
    });

    expect(client.calls.rpc).toHaveLength(1);
    const r = client.calls.rpc[0];
    expect(r.name).toBe('merge_section');
    expect(r.params).toEqual({
      campaign_id:  'WOLF42',
      section_name: 'resources',
      payload:      { sil: 42, lux: 7 },
    });
  });

  it('does not call the RPC when no campaign is active', async () => {
    const client = makeMockClient();
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });

    // Without a campaignId, upsertSection returns early — no RPC made.
    expect(client.calls.rpc).toHaveLength(0);
  });

  it('passes the campaign id when one is active', async () => {
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    await act(async () => {
      await result.current.upsertSection('guard_3', { ...createInitialState(), guards: [
        {}, {}, {}, { name: 'Catherine', hp: 3 }, {}, {}, {}, {},
      ] });
    });

    expect(client.calls.rpc).toHaveLength(1);
    expect(client.calls.rpc[0].params.campaign_id).toBe('WOLF42');
    expect(client.calls.rpc[0].params.section_name).toBe('guard_3');
    expect(client.calls.rpc[0].params.payload.name).toBe('Catherine');
  });

  it('does NOT include an _updated_at timestamp in the payload (server sets it)', async () => {
    // The server bumps the timestamp via now() in the RPC, so the client
    // must not send one — sending a client-side timestamp would let a
    // client with a wrong clock cause stale-looking rows.
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 5 });
    });

    const params = client.calls.rpc[0].params;
    expect(params.payload).not.toHaveProperty('resources_updated_at');
    expect(Object.keys(params)).not.toContain('resources_updated_at');
  });
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe('upsertSection — error handling', () => {
  it('sets syncError and syncStatus=error on RPC failure', async () => {
    setRpcResponse('merge_section', { data: null, error: { message: 'rpc down' } });
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });

    expect(result.current.syncError).toBe('rpc down');
    expect(result.current.syncStatus).toBe('error');
  });

  it('returns to idle when the next RPC succeeds', async () => {
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    // First call fails.
    setRpcResponse('merge_section', { data: null, error: { message: 'fail' } });
    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });
    expect(result.current.syncStatus).toBe('error');

    // Clear the override so the next call succeeds.
    clearRpcOverrides();
    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });
    expect(result.current.syncStatus).toBe('idle');
    expect(result.current.syncError).toBe(null);
  });
});

// ─── flushQueue: per-section writes ─────────────────────────────────────────

describe('flushQueue — per-section writes through merge_section', () => {
  it('calls merge_section once per queued section', async () => {
    // The flush path sends one RPC per section (rather than a single
    // multi-column update) so the server-side deep-merge can run on
    // each section independently.
    //
    // The hook reads navigator.onLine at mount via useRef, so we have
    // to stub it BEFORE renderHook to simulate offline.
    vi.stubGlobal('navigator', { ...navigator, onLine: false });

    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    // First write: offline → queued.
    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 5 });
    });
    expect(client.calls.rpc).toHaveLength(0);

    // Second write (different section): also offline → queued.
    await act(async () => {
      await result.current.upsertSection('cities', { ...createInitialState(), cities: [
        { id: 'mir', name: 'Mir', puzzleQuestDone: true, bounty1Done: false, bounty2Done: false },
        ...createInitialState().cities.slice(1),
      ] });
    });
    expect(client.calls.rpc).toHaveLength(0);

    // Now go back online and trigger a reconnect to flush the queue.
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    // One RPC per queued section.
    expect(client.calls.rpc).toHaveLength(2);
    const sections = client.calls.rpc.map(r => r.params.section_name);
    expect(sections.sort()).toEqual(['cities', 'resources']);
  });

  it('stops flushing on the first error and leaves remaining sections queued', async () => {
    // If section A's RPC fails, section B should not be flushed in the
    // same reconnect. It stays in the queue for the next attempt.
    vi.stubGlobal('navigator', { ...navigator, onLine: false });

    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    // Queue two sections.
    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 1 });
    });
    await act(async () => {
      await result.current.upsertSection('cities', { ...createInitialState(), cities: [
        { id: 'mir', name: 'Mir', puzzleQuestDone: true, bounty1Done: false, bounty2Done: false },
        ...createInitialState().cities.slice(1),
      ] });
    });
    expect(client.calls.rpc).toHaveLength(0);

    // Reconnect — but make merge_section fail.
    setRpcResponse('merge_section', { data: null, error: { message: 'transient' } });
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    // Only the first section was attempted. (The order is the Map's
    // insertion order: resources was queued first.)
    expect(client.calls.rpc).toHaveLength(1);
    expect(client.calls.rpc[0].params.section_name).toBe('resources');
    expect(result.current.syncStatus).toBe('error');
  });
});

// ─── Section validation ──────────────────────────────────────────────────────

describe('merge_section — section_name validation', () => {
  it('client-side: surfaces a sync error when called with an unknown section name (no RPC made)', () => {
    // extractSection throws on unknown section names. The hook catches
    // the throw and surfaces it as syncError rather than letting the
    // exception propagate (which would crash the debounce timer).
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    act(() => {
      // Synchronous — the catch path doesn't need to await.
      result.current.upsertSection('foo', createInitialState());
    });

    expect(client.calls.rpc).toHaveLength(0);
    expect(result.current.syncError).toMatch(/unknown section name/);
    expect(result.current.syncStatus).toBe('error');
  });

  it('server-side: propagates the RPC error to syncError when merge_section rejects the section', async () => {
    // The server has the same whitelist (and a defense-in-depth check).
    // If it ever rejects (e.g., a future schema change that adds a
    // client-known section that the server doesn't yet know about),
    // the client surfaces the error.
    setRpcResponse('merge_section', {
      data: null, error: { message: 'unknown section name: resources' },
    });
    const client = makeMockClient();
    localStorage.setItem('guards_ledger_campaign_id', 'WOLF42');
    const { result } = renderHook(
      ({ state }) => useSupabaseSync(state, () => {}, client),
      { initialProps: { state: createInitialState() } }
    );

    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });

    expect(client.calls.rpc).toHaveLength(1);
    expect(result.current.syncError).toBe('unknown section name: resources');
    expect(result.current.syncStatus).toBe('error');
  });
});
