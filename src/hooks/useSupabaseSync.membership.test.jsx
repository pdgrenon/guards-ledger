// @vitest-environment jsdom
/**
 * useSupabaseSync.membership.test.jsx — AVE-971
 *
 * Campaign access is scoped by RLS to rows the user has joined, so every
 * network path needs an identity (and, for an existing campaign, a membership
 * row) before it runs.
 *
 * What these tests can and cannot prove: RLS itself is not exercised here —
 * that needs a real Postgres and is verified manually against a branch project.
 * What is pinned here is the client contract the policies depend on, and in
 * particular the ORDERING. A "join works" test passes trivially against a mock
 * that returns data unconditionally, even if the join fires after the select —
 * which against real RLS returns zero rows and reports "No campaign found" for
 * every correct code. So the assertions below are about call order and about
 * what happens when auth fails, not about happy-path plumbing.
 *
 * Mirrors the injected-client seam used by useSupabaseSync.replaceRow.test.jsx:
 * the third parameter of useSupabaseSync takes a hand-rolled fake, so there is
 * no network and no vi.mock of the Supabase package.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSupabaseSync, CAMPAIGN_ID_KEY, generateCampaignId } from './useSupabaseSync';
import { createInitialState } from '../data/constants';

const CAMPAIGN = 'WOLF-7F3K9Q';

/**
 * A mock client that records every call in one ordered log, so a test can
 * assert that join_campaign preceded the campaigns SELECT.
 */
function makeMockClient({ session = null, signInError = null, selectResult } = {}) {
  const log = [];               // ordered: 'auth.getSession' | 'rpc:<name>' | 'select' | 'update'
  const calls = { rpc: [], select: [], update: [] };

  const builder = {
    select() { return builder; },
    eq()     { return builder; },
    single() {
      log.push('select');
      calls.select.push(true);
      return Promise.resolve(selectResult ?? { data: { id: CAMPAIGN, generation: 0 }, error: null });
    },
    update() { log.push('update'); calls.update.push(true); return builder; },
    insert() { log.push('insert'); return Promise.resolve({ data: null, error: null }); },
    then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
  };

  return {
    log,
    calls,
    auth: {
      getSession: vi.fn(async () => {
        log.push('auth.getSession');
        return { data: { session } };
      }),
      signInAnonymously: vi.fn(async () => {
        log.push('auth.signInAnonymously');
        if (signInError) return { data: null, error: signInError };
        return { data: { user: { id: 'anon-uuid' }, session: { access_token: 't' } }, error: null };
      }),
    },
    from() { return builder; },
    rpc: vi.fn(async (name, params) => {
      log.push(`rpc:${name}`);
      calls.rpc.push({ name, params });
      return { data: {}, error: null };
    }),
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
  };
}

const noop = () => {};
const render = client => renderHook(() => useSupabaseSync(createInitialState(), noop, client));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('anonymous session', () => {
  it('signs in anonymously when there is no session yet', async () => {
    const client = makeMockClient();
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    render(client);
    await waitFor(() => expect(client.auth.signInAnonymously).toHaveBeenCalled());
  });

  it('reuses an existing session rather than minting another anonymous user', async () => {
    const client = makeMockClient({ session: { access_token: 'existing' } });
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    render(client);
    await waitFor(() => expect(client.auth.getSession).toHaveBeenCalled());
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in once for concurrent callers, not once per network path', async () => {
    // Boot fires subscribe, refetch and a queue drain together. Each anonymous
    // sign-in creates a permanent auth.users row, so they must share one.
    const client = makeMockClient();
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    const { result } = render(client);
    await act(async () => {
      await Promise.all([
        result.current.upsertSection('resources', createInitialState()),
        result.current.upsertSection('cities', createInitialState()),
        result.current.upsertSection('stash', createInitialState()),
      ]);
    });
    expect(client.auth.signInAnonymously.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('boot re-join', () => {
  it('joins the stored campaign so an existing player is not locked out', async () => {
    // The migration cannot backfill membership — it has no user_id to write.
    // A device holding a code from before membership existed establishes its
    // own row on boot, which is what makes the change invisible to players.
    const client = makeMockClient();
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    render(client);
    await waitFor(() =>
      expect(client.calls.rpc.some(c => c.name === 'join_campaign' && c.params.campaign_id === CAMPAIGN))
        .toBe(true));
  });

  it('joins once, not on every network path', async () => {
    const client = makeMockClient();
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    const { result } = render(client);
    await waitFor(() => expect(client.calls.rpc.some(c => c.name === 'join_campaign')).toBe(true));
    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
      await result.current.upsertSection('cities', createInitialState());
    });
    expect(client.calls.rpc.filter(c => c.name === 'join_campaign')).toHaveLength(1);
  });

  it('does not join when there is no stored campaign', async () => {
    const client = makeMockClient();
    render(client);
    await new Promise(r => setTimeout(r, 20));
    expect(client.calls.rpc.filter(c => c.name === 'join_campaign')).toHaveLength(0);
  });
});

describe('joinCampaign ordering', () => {
  // The criterion that a naive test cannot catch. Under membership RLS a
  // non-member sees zero rows, so selecting before joining returns PGRST116 —
  // "No campaign found with code X" for a perfectly correct code.
  it('calls join_campaign BEFORE reading the campaign row', async () => {
    const client = makeMockClient();
    const { result } = render(client);

    await act(async () => { await result.current.joinCampaign(CAMPAIGN); });

    const joinAt   = client.log.indexOf('rpc:join_campaign');
    const selectAt = client.log.indexOf('select');
    expect(joinAt).toBeGreaterThanOrEqual(0);
    expect(selectAt).toBeGreaterThanOrEqual(0);
    expect(joinAt).toBeLessThan(selectAt);
  });

  it('establishes a session before joining', async () => {
    const client = makeMockClient();
    const { result } = render(client);
    await act(async () => { await result.current.joinCampaign(CAMPAIGN); });

    const authAt = client.log.findIndex(e => e.startsWith('auth.'));
    const joinAt = client.log.indexOf('rpc:join_campaign');
    expect(authAt).toBeLessThan(joinAt);
  });

  it('joins under the NORMALIZED id, never the raw input', async () => {
    const client = makeMockClient();
    const { result } = render(client);
    await act(async () => { await result.current.joinCampaign('  wolf7f3k9q '); });
    const join = client.calls.rpc.find(c => c.name === 'join_campaign');
    expect(join.params.campaign_id).toBe(CAMPAIGN);
  });

  it('still reports a nonexistent code as not found (AVE-942 mapping preserved)', async () => {
    // join_campaign deliberately does not verify existence, so the SELECT is
    // what distinguishes a real campaign from a typo. That mapping must survive.
    const client = makeMockClient({
      selectResult: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    });
    const { result } = render(client);
    let ret;
    await act(async () => { ret = await result.current.joinCampaign(CAMPAIGN); });
    expect(ret.error).toBe(`No campaign found with code ${CAMPAIGN}. Check the code and try again.`);
  });
});

describe('createCampaign', () => {
  it('establishes a session before creating', async () => {
    const client = makeMockClient();
    const { result } = render(client);
    await act(async () => { await result.current.createCampaign(); });

    const authAt   = client.log.findIndex(e => e.startsWith('auth.'));
    const createAt = client.log.indexOf('rpc:create_campaign');
    expect(authAt).toBeGreaterThanOrEqual(0);
    expect(createAt).toBeGreaterThan(authAt);
  });

  it('does not re-join a campaign it just created', async () => {
    // create_campaign writes the membership row itself, inside the same
    // transaction as the campaign row.
    const client = makeMockClient();
    const { result } = render(client);
    await act(async () => { await result.current.createCampaign(); });
    await new Promise(r => setTimeout(r, 20));
    expect(client.calls.rpc.filter(c => c.name === 'join_campaign')).toHaveLength(0);
  });
});

describe('a failed sign-in degrades to local-only', () => {
  const signInError = { message: 'network unreachable' };

  it('queues the write instead of dropping it', async () => {
    const client = makeMockClient({ signInError });
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    const { result } = render(client);

    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });

    // Nothing was written…
    expect(client.calls.rpc.filter(c => c.name === 'merge_section')).toHaveLength(0);
    // …and the edit survives for the next attempt. The queue persists as
    // Map entries: [[sectionName, payload], …].
    const queued = JSON.parse(localStorage.getItem('guards_ledger_pending_v1') ?? '[]');
    expect(queued.map(([section]) => section)).toContain('resources');
  });

  it('says so rather than sitting on a green badge', async () => {
    const client = makeMockClient({ signInError });
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    const { result } = render(client);
    await act(async () => {
      await result.current.upsertSection('resources', createInitialState());
    });
    expect(result.current.syncStatus).toBe('error');
    expect(result.current.syncError).toMatch(/could not reach the campaign server/i);
    expect(result.current.syncError).toMatch(/locally/i);
  });

  it('retries on the next attempt rather than memoizing the failure', async () => {
    // A paused free-tier project or a captive portal must not wedge sync until
    // reload, so the failed session promise is cleared rather than cached.
    const client = makeMockClient({ signInError });
    localStorage.setItem(CAMPAIGN_ID_KEY, CAMPAIGN);
    const { result } = render(client);

    await act(async () => { await result.current.upsertSection('resources', createInitialState()); });
    const firstAttempts = client.auth.signInAnonymously.mock.calls.length;

    await act(async () => { await result.current.upsertSection('cities', createInitialState()); });
    expect(client.auth.signInAnonymously.mock.calls.length).toBeGreaterThan(firstAttempts);
  });

  it('reports a connection problem from joinCampaign, not a wrong code', async () => {
    const client = makeMockClient({ signInError });
    const { result } = render(client);
    let ret;
    await act(async () => { ret = await result.current.joinCampaign(CAMPAIGN); });
    expect(ret.error).toMatch(/could not reach the campaign server/i);
    expect(ret.error).not.toMatch(/check the code/i);
  });
});

describe('generateCampaignId', () => {
  it('keeps the WORD-XXXXXX shape', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCampaignId()).toMatch(/^[A-Z]{4}-[A-Z0-9]{6}$/);
    }
  });

  it('draws from the CSPRNG, not Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues');
    generateCampaignId();
    expect(cryptoSpy).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    cryptoSpy.mockRestore();
  });

  it('produces no duplicate across 10,000 generations', () => {
    const seen = new Set();
    for (let i = 0; i < 10_000; i++) seen.add(generateCampaignId());
    expect(seen.size).toBe(10_000);
  });
});
