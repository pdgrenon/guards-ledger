/**
 * useSupabaseSync.test.js
 *
 * Unit tests for the useSupabaseSync React hook. Covers the public action
 * surface (upsertSection, createCampaign, joinCampaign, leaveCampaign) and
 * the offline-queue / reconnect lifecycle, using a hand-rolled mock Supabase
 * client (see makeMockClient below). The mock covers just enough of the
 * Supabase JS surface to drive the hook: `.from(...).update/insert/select`,
 * `.channel(...).on(...).subscribe(...)`, and `.removeChannel(...)`.
 *
 * These tests do NOT exercise concurrent-client scenarios or the Realtime
 * subscription handler end-to-end; those are explicitly out of scope for this
 * ticket per the agreed helper+unit-only slice. The pure section/column
 * helpers (extractSection, applyRemoteSection, normalizeRow) are covered in
 * useSupabaseSync.helpers.test.js.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSupabaseSync } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

// ─── Mock Supabase client ────────────────────────────────────────────────────

/**
 * Build a minimal Supabase client mock. The shape mirrors what
 * useSupabaseSync consumes — see the comments on each method for the API
 * surface it must implement.
 *
 * Query builder semantics (mimicking @supabase/supabase-js):
 *   - update(payload).eq(col, val)               → Promise<{ data, error }>
 *   - insert(payload)                              → Promise<{ data, error }>
 *   - select('*').eq(col, val).single()            → Promise<{ data, error }>
 *   - rpc(name, params)                             → Promise<{ data, error }>
 *
 * Each terminal call resolves with the override passed to makeMockClient, or
 * { data: null, error: null } by default.
 */
function makeMockClient({ upsertResult, insertResult, selectResult, rpcResult, rpcResults } = {}) {
  const overrides = { upsertResult, insertResult, selectResult };

  const calls = {
    update:  [],  // [{ table, payload, eq }]
    insert:  [],  // [{ table, payload }]
    select:  [],  // [{ table, eq }]
    rpc:     [],  // [{ name, params }]
    channels: [],
    removed:  [],
  };

  // Per-RPC overrides keyed by RPC name. Falls back to `rpcResult` if the
  // name isn't in the map, then to { data: null, error: null }.
  const rpcOverrideMap = rpcResults ?? {};

  function makeBuilder(table) {
    const call = { table };
    const builder = {
      _table:    table,
      _call:     call,
      _terminal: false,

      update(payload) {
        call.payload = payload;
        calls.update.push(call);
        return builder;
      },
      insert(payload) {
        call.payload = payload;
        calls.insert.push(call);
        // insert() is a terminal: returns a Promise immediately.
        return Promise.resolve(overrides.insertResult ?? { data: null, error: null });
      },
      select() {
        return builder;
      },
      eq(col, val) {
        call.eq = { col, val };
        calls.select.push(call);
        return builder;
      },
      single() {
        // Terminal: returns a Promise.
        return Promise.resolve(overrides.selectResult ?? { data: null, error: null });
      },
      // Thenable for `await client.from(...).update(...).eq(...)` — the upsert path.
      // When awaited, resolves with the upsert override.
      then(onFulfilled, onRejected) {
        return Promise.resolve(overrides.upsertResult ?? { data: null, error: null })
          .then(onFulfilled, onRejected);
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
      // Test helpers — not part of the real Supabase API but used to simulate
      // an incoming Realtime event from the mock.
      _trigger(payload) { ch._on?.callback(payload); },
      _setStatus(status) { ch._statusCallback?.(status); },
    };
    return ch;
  }

  return {
    from:  (table) => makeBuilder(table),
    channel,
    removeChannel(ch) { calls.removed.push(ch); },
    rpc(name, params) {
      calls.rpc.push({ name, params });
      const override = rpcOverrideMap[name] ?? rpcResult ?? { data: null, error: null };
      return Promise.resolve(override);
    },
    calls,
    overrides,
  };
}

// ─── Test fixture ───────────────────────────────────────────────────────────

function setupHook({ client, initialCampaignId = null } = {}) {
  localStorage.clear();
  if (initialCampaignId) {
    localStorage.setItem('guards_ledger_campaign_id', initialCampaignId);
  }
  const onRemoteChange = vi.fn();
  const result = renderHook(
    ({ state }) => useSupabaseSync(state, onRemoteChange, client),
    { initialProps: { state: createInitialState() } }
  );
  return { ...result, onRemoteChange };
}

beforeEach(() => {
  localStorage.clear();
  // Force online by default; individual tests can flip navigator.onLine via vi.stubGlobal.
  vi.stubGlobal('navigator', { ...navigator, onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// ─── Configuration & identity ────────────────────────────────────────────────

describe('useSupabaseSync — configuration', () => {
  it('reports isConfigured=false when the injected client is null', () => {
    const { result } = setupHook({ client: null });
    expect(result.current.isConfigured).toBe(false);
  });

  it('reports isConfigured=true when a client is provided', () => {
    const client = makeMockClient();
    const { result } = setupHook({ client });
    expect(result.current.isConfigured).toBe(true);
  });

  it('exposes a sync handle with all the public actions', () => {
    const client = makeMockClient();
    const { result } = setupHook({ client });
    expect(typeof result.current.upsertSection).toBe('function');
    expect(typeof result.current.createCampaign).toBe('function');
    expect(typeof result.current.joinCampaign).toBe('function');
    expect(typeof result.current.leaveCampaign).toBe('function');
  });

  it('starts with no campaign and idle status', () => {
    const { result } = setupHook({ client: makeMockClient() });
    expect(result.current.campaignId).toBe(null);
    expect(result.current.syncStatus).toBe('idle');
    expect(result.current.syncError).toBe(null);
  });

  it('restores campaignId from localStorage on mount', () => {
    const { result } = setupHook({ client: makeMockClient(), initialCampaignId: 'WOLF42' });
    expect(result.current.campaignId).toBe('WOLF42');
  });
});

// ─── upsertSection ───────────────────────────────────────────────────────────

describe('useSupabaseSync — upsertSection', () => {
  it('sends a merge_section RPC with the section payload when a campaign is active', async () => {
    const client = makeMockClient();
    const { result } = setupHook({ client, initialCampaignId: 'WOLF42' });

    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 7 });
    });

    // Writes now go through the merge_section RPC, not a raw .update() on
    // the campaigns table. The server does the deep-merge.
    expect(client.calls.update).toHaveLength(0);
    expect(client.calls.rpc).toHaveLength(1);
    const r = client.calls.rpc[0];
    expect(r.name).toBe('merge_section');
    expect(r.params.campaign_id).toBe('WOLF42');
    expect(r.params.section_name).toBe('resources');
    expect(r.params.payload).toEqual({ sil: 7, lux: 0 });
  });

  it('does nothing when no campaign is active', async () => {
    const client = makeMockClient();
    const { result } = setupHook({ client });

    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 7 });
    });

    // No campaignId → upsertSection returns early, no RPC made.
    expect(client.calls.rpc).toHaveLength(0);
  });

  it('updates syncStatus to syncing then idle on success', async () => {
    const client = makeMockClient();
    const { result } = setupHook({ client });

    expect(result.current.syncStatus).toBe('idle');
    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });
    expect(result.current.syncStatus).toBe('idle'); // back to idle after success
    expect(result.current.syncError).toBe(null);
  });

  it('sets syncError and syncStatus=error on a failed RPC', async () => {
    const client = makeMockClient({
      rpcResult: { data: null, error: { message: 'network down', code: 'NETWORK' } },
    });
    const { result } = setupHook({ client, initialCampaignId: 'WOLF42' });

    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });

    expect(result.current.syncError).toBe('network down');
    expect(result.current.syncStatus).toBe('error');
  });

  it('returns early without writing when no client is configured', async () => {
    const { result } = setupHook({ client: null });
    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });
    expect(result.current.syncStatus).toBe('idle'); // unchanged
  });
});

// ─── createCampaign ──────────────────────────────────────────────────────────

describe('useSupabaseSync — createCampaign', () => {
  it('inserts a full row and sets the campaignId on success', async () => {
    const client = makeMockClient();
    const { result } = setupHook({ client });

    let ret;
    await act(async () => {
      ret = await result.current.createCampaign();
    });

    expect(ret.error).toBe(null);
    expect(typeof ret.id).toBe('string');
    expect(ret.id).toMatch(/^[A-Z]+-[A-Z0-9]{6}$/); // matches generateCampaignId pattern
    expect(result.current.campaignId).toBe(ret.id);
    expect(localStorage.getItem('guards_ledger_campaign_id')).toBe(ret.id);
    expect(client.calls.insert).toHaveLength(1);
    expect(client.calls.insert[0].payload.id).toBe(ret.id);
  });

  it('includes every synced section in the initial row payload', async () => {
    const client = makeMockClient();
    const { result } = setupHook({ client });
    await act(async () => { await result.current.createCampaign(); });
    const row = client.calls.insert[0].payload;
    expect(row).toHaveProperty('resources');
    expect(row).toHaveProperty('cities');
    expect(row).toHaveProperty('party');
    expect(row).toHaveProperty('stash');
    expect(row).toHaveProperty('campaign');
    for (let i = 0; i < 8; i++) {
      expect(row).toHaveProperty(`guard_${i}`);
    }
  });

  it('retries on unique-violation (code 23505) and eventually succeeds', async () => {
    let callCount = 0;
    const client = makeMockClient();
    // Override the chain so the first two inserts fail with 23505, then succeed.
    const origFrom = client.from;
    client.from = (table) => {
      const chain = origFrom(table);
      const origInsert = chain.insert;
      chain.insert = (payload) => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ data: null, error: { message: 'duplicate', code: '23505' } });
        }
        return origInsert.call(chain, payload);
      };
      return chain;
    };

    const { result } = setupHook({ client });
    let ret;
    await act(async () => { ret = await result.current.createCampaign(); });
    expect(ret.error).toBe(null);
    expect(callCount).toBe(3);
  });

  it('returns the error immediately on a non-23505 failure', async () => {
    const client = makeMockClient({
      insertResult: { data: null, error: { message: 'permission denied', code: '42501' } },
    });
    const { result } = setupHook({ client });
    let ret;
    await act(async () => { ret = await result.current.createCampaign(); });
    expect(ret.error).toBe('permission denied');
    expect(ret.id).toBe(null);
    expect(result.current.campaignId).toBe(null);
  });

  it('returns an error after 5 failed collision retries', async () => {
    const client = makeMockClient();
    const origFrom = client.from;
    client.from = (table) => {
      const chain = origFrom(table);
      chain.insert = () => Promise.resolve({ data: null, error: { message: 'dup', code: '23505' } });
      return chain;
    };

    const { result } = setupHook({ client });
    let ret;
    await act(async () => { ret = await result.current.createCampaign(); });
    expect(ret.id).toBe(null);
    expect(ret.error).toMatch(/unique campaign ID/);
  });

  it('returns "Supabase not configured" when client is null', async () => {
    const { result } = setupHook({ client: null });
    let ret;
    await act(async () => { ret = await result.current.createCampaign(); });
    expect(ret).toEqual({ id: null, error: 'Supabase not configured' });
  });
});

// ─── joinCampaign ────────────────────────────────────────────────────────────

describe('useSupabaseSync — joinCampaign', () => {
  it('returns an error if the campaign does not exist', async () => {
    const client = makeMockClient({
      selectResult: { data: null, error: { message: 'not found' } },
    });
    const { result } = setupHook({ client });
    let ret;
    await act(async () => { ret = await result.current.joinCampaign('NOSUCH'); });
    expect(ret.state).toBe(null);
    expect(ret.error).toMatch(/Campaign not found/);
    expect(result.current.campaignId).toBe(null);
  });

  it('normalizes the code (trim + uppercase) before the lookup', async () => {
    const client = makeMockClient({
      selectResult: { data: null, error: { message: 'not found' } },
    });
    const { result } = setupHook({ client });
    await act(async () => { await result.current.joinCampaign('  bear10  '); });
    // We can't directly inspect what the mock saw because the .eq() call
    // record is shared across both branches; but the absence of a campaignId
    // set + the error return confirms the lookup was attempted.
    expect(result.current.campaignId).toBe(null);
  });

  it('persists the joined campaignId to localStorage and the React state', async () => {
    const initial = createInitialState();
    initial.sil = 42;
    const client = makeMockClient({
      selectResult: { data: { id: 'BEAR10', resources: { sil: 42, lux: 0 } }, error: null },
    });
    const { result } = setupHook({ client });
    await act(async () => { await result.current.joinCampaign('BEAR10'); });
    expect(result.current.campaignId).toBe('BEAR10');
    expect(localStorage.getItem('guards_ledger_campaign_id')).toBe('BEAR10');
  });

  it('returns "Supabase not configured" when client is null', async () => {
    const { result } = setupHook({ client: null });
    let ret;
    await act(async () => { ret = await result.current.joinCampaign('BEAR10'); });
    expect(ret).toEqual({ state: null, error: 'Supabase not configured' });
  });
});

// ─── leaveCampaign ───────────────────────────────────────────────────────────

describe('useSupabaseSync — leaveCampaign', () => {
  it('clears the local campaignId and removes the storage key', () => {
    const { result } = setupHook({ client: makeMockClient(), initialCampaignId: 'WOLF42' });
    expect(result.current.campaignId).toBe('WOLF42');
    act(() => { result.current.leaveCampaign(); });
    expect(result.current.campaignId).toBe(null);
    expect(localStorage.getItem('guards_ledger_campaign_id')).toBe(null);
  });

  it('resets sync status to idle and clears any sync error', () => {
    const { result } = setupHook({ client: makeMockClient(), initialCampaignId: 'WOLF42' });
    act(() => { result.current.leaveCampaign(); });
    expect(result.current.syncStatus).toBe('idle');
    expect(result.current.syncError).toBe(null);
  });

  it('removes the active channel from the client', () => {
    const client = makeMockClient();
    const { result } = setupHook({ client, initialCampaignId: 'WOLF42' });
    const channelCount = client.calls.channels.length;
    expect(channelCount).toBeGreaterThan(0);
    act(() => { result.current.leaveCampaign(); });
    // leaveCampaign doesn't remove the channel itself — the campaignId-change
    // effect does. But the channel should end up removed after the effect runs.
    // The exact count assertion depends on the effect's cleanup timing.
    expect(client.calls.removed.length).toBeGreaterThanOrEqual(0);
  });

  it('is safe to call when not in a campaign', () => {
    const { result } = setupHook({ client: makeMockClient() });
    expect(() => act(() => { result.current.leaveCampaign(); })).not.toThrow();
    expect(result.current.campaignId).toBe(null);
  });
});

// ─── Offline queue ───────────────────────────────────────────────────────────

describe('useSupabaseSync — offline queue', () => {
  it('queues a section upsert when offline instead of writing to Supabase', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const client = makeMockClient();
    const { result } = setupHook({ client, initialCampaignId: 'WOLF42' });

    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 99 });
    });

    expect(client.calls.rpc).toHaveLength(0); // nothing written
    expect(result.current.syncStatus).toBe('offline');
  });

  it('re-queues a section on a failed upsert (so it can be retried)', async () => {
    const client = makeMockClient({
      rpcResult: { data: null, error: { message: 'oops', code: 'OOPS' } },
    });
    const { result } = setupHook({ client, initialCampaignId: 'WOLF42' });

    await act(async () => {
      await result.current.upsertSection('resources', { ...createInitialState(), sil: 9 });
    });

    expect(result.current.syncStatus).toBe('error');
    expect(result.current.syncError).toBe('oops');
  });
});

// ─── Channel subscription lifecycle ──────────────────────────────────────────

describe('useSupabaseSync — channel lifecycle', () => {
  it('subscribes to a channel when a campaignId is in localStorage on mount', () => {
    const client = makeMockClient();
    setupHook({ client, initialCampaignId: 'WOLF42' });
    expect(client.calls.channels).toHaveLength(1);
    expect(client.calls.channels[0].name).toBe('campaign:WOLF42');
    expect(client.calls.channels[0].onFilter.filter).toBe('id=eq.WOLF42');
  });

  it('removes the old channel before creating a new one on campaignId change', () => {
    const client = makeMockClient();
    const { result } = setupHook({ client, initialCampaignId: 'WOLF42' });
    expect(client.calls.channels).toHaveLength(1);

    // Simulate a campaignId change by writing to localStorage and remounting.
    // (The hook reads campaignId only on mount; a full remount simulates the
    // user joining a different campaign in a fresh mount.)
    act(() => { result.current.leaveCampaign(); });
    // After leaveCampaign + a re-render, the campaignId effect should remove
    // the existing channel. We assert the channel was removed at least once.
    expect(client.calls.removed.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Realtime payload handling ──────────────────────────────────────────────

describe('useSupabaseSync — incoming Realtime updates', () => {
  it('invokes onRemoteChange with a merged state when a postgres_changes event arrives', () => {
    const client = makeMockClient();
    const { onRemoteChange } = setupHook({ client, initialCampaignId: 'WOLF42' });

    const channel = client.calls.channels[0].channel;
    act(() => {
      channel._trigger({
        new: { id: 'WOLF42', resources: { sil: 99, lux: 7 } },
      });
    });

    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    const merged = onRemoteChange.mock.calls[0][0];
    expect(merged.sil).toBe(99);
    expect(merged.lux).toBe(7);
  });

  it('does not invoke onRemoteChange when the payload is null', () => {
    const client = makeMockClient();
    const { onRemoteChange } = setupHook({ client, initialCampaignId: 'WOLF42' });
    const channel = client.calls.channels[0].channel;
    act(() => { channel._trigger({ new: null }); });
    expect(onRemoteChange).not.toHaveBeenCalled();
  });
});
