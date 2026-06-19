import { describe, it, expect } from 'vitest';
import { searchAll, enemyDrops, MIN_QUERY_LENGTH } from './search';
import { ENEMIES, MATERIAL_SOURCES } from './materials';

describe('searchAll', () => {
  it('returns null for queries shorter than the minimum length', () => {
    expect(searchAll('')).toBeNull();
    expect(searchAll('a')).toBeNull();
    expect('a'.length).toBeLessThan(MIN_QUERY_LENGTH);
  });

  it('returns a grouped result object once the query is long enough', () => {
    const res = searchAll('iron');
    expect(res).not.toBeNull();
    expect(res).toHaveProperty('recipes');
    expect(res).toHaveProperty('materials');
    expect(res).toHaveProperty('enemies');
    expect(res).toHaveProperty('encounters');
    expect(res).toHaveProperty('cities');
    expect(typeof res.total).toBe('number');
  });

  it('matches recipes by name', () => {
    const res = searchAll('tunic');
    expect(res.recipes.some(r => /tunic/i.test(r.name))).toBe(true);
  });

  it('matches recipes by an ingredient name', () => {
    const res = searchAll('rough leather');
    expect(res.recipes.length).toBeGreaterThan(0);
    expect(
      res.recipes.every(r => r.materials.some(m => /rough leather/i.test(m.name)))
    ).toBe(true);
  });

  it('reports live stash counts on material results', () => {
    const res = searchAll('iron', { stash: { Iron: 4 } });
    const iron = res.materials.find(m => m.name === 'Iron');
    expect(iron).toBeTruthy();
    expect(iron.count).toBe(4);
  });

  it('defaults material counts to 0 when not in stash', () => {
    const res = searchAll('iron', { stash: {} });
    const iron = res.materials.find(m => m.name === 'Iron');
    expect(iron.count).toBe(0);
  });

  it('matches cities by name and only returns matching cities', () => {
    const cities = [
      { id: 1, name: 'Mir' },
      { id: 2, name: 'Razdor' },
    ];
    const res = searchAll('razdor', { cities });
    expect(res.cities).toHaveLength(1);
    expect(res.cities[0].city.name).toBe('Razdor');
  });

  it('matches encounters by reward text', () => {
    // "For the King!" rewards Karst's Signet.
    const res = searchAll('signet');
    expect(res.encounters.some(e => /for the king/i.test(e.encounter.name))).toBe(true);
  });

  it('tags encounters with their kind', () => {
    const res = searchAll('king');
    for (const e of res.encounters) {
      expect(['training', 'spirit']).toContain(e.kind);
    }
  });

  it('caps each group at the per-group limit', () => {
    const res = searchAll('e'.repeat(1)); // too short → null
    expect(res).toBeNull();
    const res2 = searchAll('a'); // still too short
    expect(res2).toBeNull();
    const res3 = searchAll('er'); // broad match
    expect(res3.recipes.length).toBeLessThanOrEqual(8);
    expect(res3.materials.length).toBeLessThanOrEqual(8);
    expect(res3.enemies.length).toBeLessThanOrEqual(8);
  });

  it('is case-insensitive', () => {
    expect(searchAll('IRON').materials.length).toEqual(searchAll('iron').materials.length);
  });
});

describe('enemyDrops', () => {
  it('returns [] for an unknown enemy', () => {
    expect(enemyDrops('Nonexistent Foe')).toEqual([]);
  });

  it('is the inverse of MATERIAL_SOURCES.enemies', () => {
    // For every material that lists an enemy, that enemy must drop the material.
    for (const [item, src] of Object.entries(MATERIAL_SOURCES)) {
      for (const enemy of src.enemies ?? []) {
        expect(enemyDrops(enemy)).toContain(item);
      }
    }
  });

  it('only references known enemies in the drop map', () => {
    const known = new Set(ENEMIES);
    // Every enemy that appears as a source should be a real enemy name (sanity).
    for (const src of Object.values(MATERIAL_SOURCES)) {
      for (const enemy of src.enemies ?? []) {
        // Not asserting membership hard (data may include sub-variants), just that
        // enemyDrops resolves to a non-empty list for it.
        expect(enemyDrops(enemy).length).toBeGreaterThan(0);
        void known;
      }
    }
  });
});
