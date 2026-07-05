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
  reconcileSelfEcho,
  sectionTsColumn,
  sectionChanged,
  snapshotTimestamps,
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

describe('per-section timestamp gating (AVE-314)', () => {
  it('names the timestamp column for a section', () => {
    expect(sectionTsColumn('guard_0')).toBe('guard_0_updated_at');
    expect(sectionTsColumn('resources')).toBe('resources_updated_at');
  });

  it('reports a section changed when its timestamp advanced', () => {
    const row = { guard_0: {}, guard_0_updated_at: 't2' };
    expect(sectionChanged(row, 'guard_0', { guard_0: 't1' })).toBe(true);
  });

  it('reports a section unchanged when its timestamp matches the baseline', () => {
    // The core two-player case: guard_0 rides along in a guard_3 UPDATE with an
    // unchanged timestamp — it must be treated as unchanged, not applied.
    const row = { guard_0: {}, guard_0_updated_at: 't1' };
    expect(sectionChanged(row, 'guard_0', { guard_0: 't1' })).toBe(false);
  });

  it('treats a section as changed when there is no baseline yet (first sighting)', () => {
    const row = { guard_0: {}, guard_0_updated_at: 't1' };
    expect(sectionChanged(row, 'guard_0', {})).toBe(true);
  });

  it('treats a section as changed when the row has no timestamp (pre-migration row)', () => {
    const row = { guard_0: {} }; // no guard_0_updated_at column
    expect(sectionChanged(row, 'guard_0', { guard_0: 't1' })).toBe(true);
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
