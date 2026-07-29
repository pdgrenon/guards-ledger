/**
 * Unit tests for the pure helpers exported from useSupabaseSync.js that drive
 * the per-guard column split (AVE-83). These cover the section ↔ column mapping
 * and the migration of pre-AVE-83 single-`guards`-blob rows. The React hook
 * itself is not exercised here.
 */
import { describe, it, expect } from 'vitest';
import {
  GUARD_COUNT,
  ALL_SECTIONS,
  guardColumn,
  isGuardColumn,
  guardIndexFromColumn,
  extractSection,
  applyRemoteSection,
  normalizeRow,
  generateCampaignId,
  normalizeCampaignCode,
  reconcileSelfEcho,
  hasNewerSelfWrite,
  sectionTsColumn,
  sectionChanged,
  snapshotTimestamps,
  mergeSeenTimestamps,
  tsToMs,
} from './useSupabaseSync';
import { createInitialState } from '../data/constants';

describe('generateCampaignId', () => {
  it('returns a code matching WORD-XXXXXX format', () => {
    const id = generateCampaignId();
    expect(id).toMatch(/^[A-Z]+-[A-Z0-9]{6}$/);
  });

  it('uses one of the known word prefixes', () => {
    const words = ['WOLF','BEAR','HAWK','IRON','GOLD','SNOW','DARK','FIRE','VALE','DUSK'];
    for (let i = 0; i < 50; i++) {
      const prefix = generateCampaignId().split('-')[0];
      expect(words).toContain(prefix);
    }
  });

  it('produces distinct codes across multiple calls', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      seen.add(generateCampaignId());
    }
    // With 2.2B combinations, 100 distinct codes should be trivially guaranteed
    expect(seen.size).toBe(100);
  });
});

function sampleState() {
  const s = createInitialState();
  s.sil = 5;
  s.lux = 2;
  s.activeParty = ['Vera', 'Pavel'];
  s.guards = s.guards.map((g, i) => ({ ...g, hp: 20 - i }));
  return s;
}

describe('guard column name helpers', () => {
  it('builds and detects guard column names', () => {
    expect(guardColumn(0)).toBe('guard_0');
    expect(guardColumn(7)).toBe('guard_7');
    expect(isGuardColumn('guard_3')).toBe(true);
    expect(isGuardColumn('guards')).toBe(false);
    expect(isGuardColumn('party')).toBe(false);
    expect(guardIndexFromColumn('guard_5')).toBe(5);
  });
});

describe('ALL_SECTIONS', () => {
  it('lists the simple sections plus one column per guard', () => {
    expect(ALL_SECTIONS).toContain('resources');
    expect(ALL_SECTIONS).toContain('party');
    expect(ALL_SECTIONS).not.toContain('guards'); // old single column is gone
    for (let i = 0; i < GUARD_COUNT; i++) {
      expect(ALL_SECTIONS).toContain(`guard_${i}`);
    }
    expect(ALL_SECTIONS.filter(isGuardColumn)).toHaveLength(GUARD_COUNT);
  });
});

describe('extractSection', () => {
  it('extracts simple sections by their keys', () => {
    const s = sampleState();
    expect(extractSection(s, 'resources')).toEqual({ sil: 5, lux: 2 });
    expect(extractSection(s, 'party')).toEqual({ activeParty: ['Vera', 'Pavel'] });
  });

  it('extracts a per-guard column as that guard object', () => {
    const s = sampleState();
    expect(extractSection(s, 'guard_0')).toBe(s.guards[0]);
    expect(extractSection(s, 'guard_3')).toEqual(s.guards[3]);
  });
});

describe('applyRemoteSection', () => {
  it('replaces only the targeted guard, leaving the rest untouched', () => {
    const s = sampleState();
    const remoteGuard = { ...s.guards[2], hp: 1, name: 'Catherine' };
    const next = applyRemoteSection(s, 'guard_2', remoteGuard);

    expect(next.guards[2]).toEqual(remoteGuard);
    expect(next.guards[0]).toBe(s.guards[0]);
    expect(next.guards[1]).toBe(s.guards[1]);
    expect(next.guards[3]).toBe(s.guards[3]);
  });

  it('spreads simple section keys at the top level', () => {
    const s = sampleState();
    const next = applyRemoteSection(s, 'resources', { sil: 99, lux: 7 });
    expect(next.sil).toBe(99);
    expect(next.lux).toBe(7);
    expect(next.guards).toBe(s.guards);
  });

  it('is a no-op for a null/undefined remote section', () => {
    const s = sampleState();
    expect(applyRemoteSection(s, 'guard_4', null)).toBe(s);
    expect(applyRemoteSection(s, 'resources', undefined)).toBe(s);
  });

  it('never touches local-only keys like activeGuardIdx', () => {
    const s = sampleState();
    s.activeGuardIdx = 6;
    const next = applyRemoteSection(s, 'guard_0', { ...s.guards[0], hp: 0 });
    expect(next.activeGuardIdx).toBe(6);
  });
});

describe('normalizeRow', () => {
  it('expands a pre-AVE-83 single guards blob into per-guard columns', () => {
    const guardsArr = Array.from({ length: GUARD_COUNT }, (_, i) => ({ name: `G${i}`, hp: i }));
    const row = {
      id: 'WOLF42',
      guards: { guards: guardsArr, activeParty: ['Vera', 'Pavel'] },
      guards_updated_at: '2026-01-01T00:00:00Z',
      resources: { sil: 1, lux: 0 },
    };
    const out = normalizeRow(row);

    expect(out.party).toEqual({ activeParty: ['Vera', 'Pavel'] });
    for (let i = 0; i < GUARD_COUNT; i++) {
      expect(out[`guard_${i}`]).toEqual(guardsArr[i]);
    }
    // untouched columns pass through
    expect(out.resources).toEqual({ sil: 1, lux: 0 });
  });

  it('leaves an already-migrated row unchanged', () => {
    const row = { id: 'BEAR10', guard_0: { name: 'Grigory' }, party: { activeParty: ['Alek', 'Grigory'] } };
    expect(normalizeRow(row)).toBe(row);
  });

  it('passes through null/undefined', () => {
    expect(normalizeRow(null)).toBe(null);
    expect(normalizeRow(undefined)).toBe(undefined);
  });

  it('converts a pre-AVE-287 completedEncounters string array to id-keyed objects', () => {
    const row = {
      id: 'WOLF42',
      guard_0: { name: 'Grigory' },
      campaign: { completedEncounters: ['boss-1', 'boss-2'], plans: [] },
    };
    const out = normalizeRow(row);
    expect(out).not.toBe(row); // cloned, not mutated
    expect(row.campaign.completedEncounters).toEqual(['boss-1', 'boss-2']); // original untouched
    expect(out.campaign.completedEncounters).toEqual([{ id: 'boss-1' }, { id: 'boss-2' }]);
  });

  it('leaves an already-id-keyed completedEncounters unchanged (same reference)', () => {
    const row = {
      id: 'WOLF42',
      guard_0: { name: 'Grigory' },
      campaign: { completedEncounters: [{ id: 'boss-1' }, { id: 'boss-2', deleted: true }] },
    };
    expect(normalizeRow(row)).toBe(row);
  });
});

describe('reconcileSelfEcho (AVE-314)', () => {
  const TTL = 15000;
  const now = 1_000_000;

  it('reports no echo and prunes nothing when the buffer is empty', () => {
    expect(reconcileSelfEcho([], { item: 'Silver' }, now, TTL)).toEqual({ isEcho: false, list: [] });
    expect(reconcileSelfEcho(undefined, { item: 'Silver' }, now, TTL)).toEqual({ isEcho: false, list: [] });
  });

  it('recognizes an echo of our own write and consumes that one entry', () => {
    const list = [{ value: { item: 'Silver' }, at: now - 500 }];
    const res  = reconcileSelfEcho(list, { item: 'Silver' }, now, TTL);
    expect(res.isEcho).toBe(true);
    expect(res.list).toEqual([]);
  });

  it('matches by deep value equality, not reference', () => {
    const list = [{ value: { satchel: [{ item: 'Silver', qty: 1 }] }, at: now }];
    const res  = reconcileSelfEcho(list, { satchel: [{ item: 'Silver', qty: 1 }] }, now, TTL);
    expect(res.isEcho).toBe(true);
  });

  it('does not treat a genuine remote change (different value) as an echo', () => {
    const list = [{ value: { item: 'Silver' }, at: now }];
    const res  = reconcileSelfEcho(list, { item: 'Gold' }, now, TTL);
    expect(res.isEcho).toBe(false);
    expect(res.list).toEqual(list); // untouched, still awaiting its own echo
  });

  it('consumes only the matching entry, leaving a later self-write pending', () => {
    // The core AVE-314 scenario: we sent "Silver" then "Silverwood"; the echo of
    // the earlier "Silver" arrives while local is already "Silverwood".
    const list = [
      { value: { item: 'Silver' },     at: now - 300 },
      { value: { item: 'Silverwood' }, at: now - 100 },
    ];
    const res = reconcileSelfEcho(list, { item: 'Silver' }, now, TTL);
    expect(res.isEcho).toBe(true);
    expect(res.list).toEqual([{ value: { item: 'Silverwood' }, at: now - 100 }]);
  });

  it('prunes entries older than the TTL', () => {
    const list = [
      { value: { item: 'Stale' }, at: now - TTL - 1 },
      { value: { item: 'Fresh' }, at: now - 100 },
    ];
    const res = reconcileSelfEcho(list, { item: 'Other' }, now, TTL);
    expect(res.isEcho).toBe(false);
    expect(res.list).toEqual([{ value: { item: 'Fresh' }, at: now - 100 }]);
  });

  it('does not match an expired self-write (its echo was lost)', () => {
    const list = [{ value: { item: 'Silver' }, at: now - TTL - 1 }];
    const res  = reconcileSelfEcho(list, { item: 'Silver' }, now, TTL);
    expect(res.isEcho).toBe(false);
    expect(res.list).toEqual([]);
  });
});

describe('hasNewerSelfWrite (AVE-518 follow-up)', () => {
  it('is false when nothing was ever sent for this section', () => {
    expect(hasNewerSelfWrite(undefined, 1000)).toBe(false);
    expect(hasNewerSelfWrite([], 1000)).toBe(false);
  });

  it('is false when every self-write predates the given time', () => {
    const list = [{ value: { sil: 5 }, at: 900 }, { value: { sil: 7 }, at: 950 }];
    expect(hasNewerSelfWrite(list, 1000)).toBe(false);
  });

  it('is true when a self-write was dispatched at or after the given time', () => {
    const list = [{ value: { sil: 5 }, at: 900 }, { value: { sil: 9 }, at: 1500 }];
    expect(hasNewerSelfWrite(list, 1000)).toBe(true);
  });

  it('treats an exact-match dispatch time as newer (inclusive)', () => {
    const list = [{ value: { sil: 5 }, at: 1000 }];
    expect(hasNewerSelfWrite(list, 1000)).toBe(true);
  });
});

// Real `timestamptz` renderings, not opaque ordered tokens: the gate compares
// instants, and the three transports render the same instant differently
// (AVE-868), so fixtures have to be parseable to mean anything.
const T_EARLY = '2026-07-29T15:00:00.123456+00:00'; // PostgREST
const T_LATE  = '2026-07-29T15:30:00.654321+00:00'; // PostgREST, 30 min later

// Same two instants as Supabase Realtime delivers them: raw Postgres text
// output — space separator, `+00` offset — because realtime-js passes
// `timestamptz` through untouched.
const RT_EARLY = '2026-07-29 15:00:00.123456+00';
const RT_LATE  = '2026-07-29 15:30:00.654321+00';

describe('per-section timestamp gating (AVE-314)', () => {
  it('names the timestamp column for a section', () => {
    expect(sectionTsColumn('guard_0')).toBe('guard_0_updated_at');
    expect(sectionTsColumn('resources')).toBe('resources_updated_at');
  });

  it('reports a section changed when its timestamp advanced', () => {
    const row = { guard_0: {}, guard_0_updated_at: T_LATE };
    expect(sectionChanged(row, 'guard_0', { guard_0: T_EARLY })).toBe(true);
  });

  it('reports a section unchanged when its timestamp matches the baseline', () => {
    // The core two-player case: guard_0 rides along in a guard_3 UPDATE with an
    // unchanged timestamp — it must be treated as unchanged, not applied.
    const row = { guard_0: {}, guard_0_updated_at: T_EARLY };
    expect(sectionChanged(row, 'guard_0', { guard_0: T_EARLY })).toBe(false);
  });

  it('treats a section as changed when there is no baseline yet (first sighting)', () => {
    const row = { guard_0: {}, guard_0_updated_at: T_EARLY };
    expect(sectionChanged(row, 'guard_0', {})).toBe(true);
  });

  it('treats a section as changed when the row has no timestamp (pre-migration row)', () => {
    const row = { guard_0: {} }; // no guard_0_updated_at column
    expect(sectionChanged(row, 'guard_0', { guard_0: T_EARLY })).toBe(true);
  });

  it('reports a section unchanged when its timestamp is OLDER than the baseline (AVE-526)', () => {
    // A slow refetch resolving after a newer Realtime event already applied
    // carries a *stale* (older) timestamp. Inequality would wrongly re-apply it;
    // ordering must reject it so it can't roll back the newer value.
    const row = { guard_0: {}, guard_0_updated_at: T_EARLY };
    expect(sectionChanged(row, 'guard_0', { guard_0: T_LATE })).toBe(false);
  });

  // ── Mixed transport formats (AVE-868) ──────────────────────────────────────

  it('applies a NEWER Realtime-format section against a PostgREST baseline', () => {
    // The regression: `' '` (0x20) sorts below `'T'` (0x54), so a lexicographic
    // compare rules every Realtime stamp older than any same-date REST one.
    // Since AVE-372 seeds the baseline from a REST refetch on boot/foreground,
    // this dropped every live update for the rest of the UTC day.
    const row = { campaign: {}, campaign_updated_at: RT_LATE };
    expect(Date.parse(RT_LATE)).toBeGreaterThan(Date.parse(T_EARLY));
    expect(sectionChanged(row, 'campaign', { campaign: T_EARLY })).toBe(true);
  });

  it('still gates out an OLDER Realtime-format section against a PostgREST baseline', () => {
    const row = { campaign: {}, campaign_updated_at: RT_EARLY };
    expect(sectionChanged(row, 'campaign', { campaign: T_LATE })).toBe(false);
  });

  it('treats the same instant in two formats as unchanged, not newer', () => {
    const row = { campaign: {}, campaign_updated_at: RT_LATE };
    expect(sectionChanged(row, 'campaign', { campaign: T_LATE })).toBe(false);
  });

  it('compares a client-built ISO stamp (createCampaign / replaceRow) correctly', () => {
    // buildFullRow seeds the baseline with `new Date().toISOString()` — a third
    // format again ('…Z'), which must order against Realtime text the same way.
    const clientIso = new Date(Date.parse(T_EARLY)).toISOString();
    expect(sectionChanged({ campaign_updated_at: RT_LATE }, 'campaign', { campaign: clientIso })).toBe(true);
    expect(sectionChanged({ campaign_updated_at: RT_EARLY }, 'campaign', { campaign: clientIso })).toBe(false);
  });

  it('falls open when either side is unparseable', () => {
    expect(sectionChanged({ campaign_updated_at: 'not-a-timestamp' }, 'campaign', { campaign: T_EARLY })).toBe(true);
    expect(sectionChanged({ campaign_updated_at: T_LATE }, 'campaign', { campaign: 'not-a-timestamp' })).toBe(true);
  });

  it('snapshots only the present per-section timestamps', () => {
    const row = {
      id: 'WOLF42',
      resources: {}, resources_updated_at: 'a',
      guard_0: {},   guard_0_updated_at:   'b',
      // guard_1 has no timestamp — omitted
      created_at: 'ignored',
    };
    const snap = snapshotTimestamps(row);
    expect(snap.resources).toBe('a');
    expect(snap.guard_0).toBe('b');
    expect(snap).not.toHaveProperty('guard_1');
    expect(snap).not.toHaveProperty('created_at');
  });
});

describe('mergeSeenTimestamps (AVE-526)', () => {
  it('keeps the newer timestamp per section', () => {
    const merged = mergeSeenTimestamps({ guard_0: T_EARLY }, { guard_0: T_LATE });
    expect(merged.guard_0).toBe(T_LATE);
  });

  it('does NOT regress a section to an older incoming timestamp', () => {
    // A stale refetch snapshot must never pull the baseline backward.
    const merged = mergeSeenTimestamps({ campaign: T_LATE }, { campaign: T_EARLY });
    expect(merged.campaign).toBe(T_LATE);
  });

  it('adds sections absent from the existing baseline', () => {
    const merged = mergeSeenTimestamps({ guard_0: T_EARLY }, { resources: T_LATE });
    expect(merged).toEqual({ guard_0: T_EARLY, resources: T_LATE });
  });

  it('does not mutate the input baseline', () => {
    const prev = { guard_0: T_EARLY };
    mergeSeenTimestamps(prev, { guard_0: T_LATE });
    expect(prev.guard_0).toBe(T_EARLY);
  });

  // ── Mixed transport formats (AVE-868) ──────────────────────────────────────

  it('advances a PostgREST baseline to a newer Realtime-format stamp', () => {
    // A string compare kept the REST value here, so the baseline never decayed
    // to a comparable format and the block persisted all day.
    const merged = mergeSeenTimestamps({ campaign: T_EARLY }, { campaign: RT_LATE });
    expect(merged.campaign).toBe(RT_LATE);
  });

  it('does not regress a Realtime baseline to an older PostgREST stamp', () => {
    const merged = mergeSeenTimestamps({ campaign: RT_LATE }, { campaign: T_EARLY });
    expect(merged.campaign).toBe(RT_LATE);
  });

  it('replaces an unparseable baseline rather than keeping it forever', () => {
    const merged = mergeSeenTimestamps({ campaign: 'garbage' }, { campaign: T_EARLY });
    expect(merged.campaign).toBe(T_EARLY);
  });
});

describe('tsToMs (AVE-868)', () => {
  it('parses all three transport renderings of the same instant identically', () => {
    const rest     = '2026-07-29T15:30:00.654+00:00';
    const realtime = '2026-07-29 15:30:00.654+00';
    const clientZ  = '2026-07-29T15:30:00.654Z';
    expect(tsToMs(realtime)).toBe(tsToMs(rest));
    expect(tsToMs(clientZ)).toBe(tsToMs(rest));
  });

  it('orders a later Realtime stamp above an earlier REST one', () => {
    expect(tsToMs(RT_LATE)).toBeGreaterThan(tsToMs(T_EARLY));
    // ...which a raw string comparison does not:
    expect(RT_LATE > T_EARLY).toBe(false);
  });

  it('returns NaN for missing or unparseable values', () => {
    expect(Number.isNaN(tsToMs(undefined))).toBe(true);
    expect(Number.isNaN(tsToMs(null))).toBe(true);
    expect(Number.isNaN(tsToMs('t1'))).toBe(true);
  });
});

// ─── normalizeCampaignCode (AVE-786) ─────────────────────────────────────────

describe('normalizeCampaignCode', () => {
  it('reinserts the hyphen when the code is typed without it', () => {
    // The dominant real-world case: the code was read aloud across a table.
    expect(normalizeCampaignCode('WOLF7F3K9Q')).toBe('WOLF-7F3K9Q');
  });

  it('uppercases a lowercase code', () => {
    expect(normalizeCampaignCode('wolf-7f3k9q')).toBe('WOLF-7F3K9Q');
  });

  it('strips surrounding and interior whitespace', () => {
    expect(normalizeCampaignCode('  WOLF - 7F3K9Q  ')).toBe('WOLF-7F3K9Q');
  });

  it('normalizes an en-dash from a phone keyboard', () => {
    expect(normalizeCampaignCode('WOLF–7F3K9Q')).toBe('WOLF-7F3K9Q');
  });

  it('is idempotent on an already-canonical code', () => {
    expect(normalizeCampaignCode('WOLF-7F3K9Q')).toBe('WOLF-7F3K9Q');
    expect(normalizeCampaignCode(normalizeCampaignCode('WOLF-7F3K9Q'))).toBe('WOLF-7F3K9Q');
  });

  it('leaves a legacy 6-character id unhyphenated', () => {
    // Pre-AVE-104 ids have no hyphen at all — blindly splitting after 4 would
    // turn WOLF42 into an id that matches nothing.
    expect(normalizeCampaignCode('WOLF42')).toBe('WOLF42');
    expect(normalizeCampaignCode('  wolf42 ')).toBe('WOLF42');
  });

  it('returns an empty string for empty and nullish input', () => {
    expect(normalizeCampaignCode('')).toBe('');
    expect(normalizeCampaignCode(null)).toBe('');
    expect(normalizeCampaignCode(undefined)).toBe('');
  });

  it('round-trips every generated id unchanged', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateCampaignId();
      expect(normalizeCampaignCode(id)).toBe(id);
    }
  });
});
