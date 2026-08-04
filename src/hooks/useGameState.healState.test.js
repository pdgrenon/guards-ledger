/**
 * useGameState.healState.test.js
 *
 * AVE-521 — reloading the app wiped any guard satchel that wasn't exactly 8
 * slots. `healGuard` replaced a valid-but-short satchel array wholesale with 8
 * empty slots (the `raw.satchel.length === SATCHEL_EXPANDED_SIZE` gate), so the
 * shipped demo save (6 of 8 guards have 4-slot satchels) and any pre-
 * `expandedSatchel` v1 save silently lost their items on the second load.
 *
 * Fix: pad short arrays to 8 slots and truncate over-long ones instead of
 * discarding, healing malformed slot entries in the same pass.
 */
import { describe, it, expect } from 'vitest';
import { healState, migrateV1 } from './useGameState';
import { SATCHEL_EXPANDED_SIZE } from '../data/constants';
import { satchelStackLimit } from '../data/materials';
import demoSave from '../data/demoSave.json';

const EMPTY_SLOT = { item: '', qty: 1 };

// healState heals a full parsed state; we only care about guard 0's satchel.
function healSatchel(satchel) {
  return healState({ guards: [{ name: 'Grigory', satchel }] }).guards[0].satchel;
}

describe('healState — guard satchel (AVE-521)', () => {
  it('preserves a 4-slot satchel and pads to 8 (the demo/v1 case)', () => {
    const short = [
      { item: 'Health Potion', qty: 1 },
      { item: 'Pine', qty: 2 },
      { item: 'Bone Frag.', qty: 1 },
      { item: 'Tenebris Essence', qty: 3 },
    ];
    const healed = healSatchel(short);

    expect(healed).toHaveLength(SATCHEL_EXPANDED_SIZE);
    expect(healed.slice(0, 4)).toEqual(short); // all 4 items survive, qty intact
    expect(healed.slice(4)).toEqual([
      EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT,
    ]);
  });

  it('leaves a full 8-slot satchel with valid qtys unchanged', () => {
    const full = Array.from({ length: SATCHEL_EXPANDED_SIZE }, (_, k) => ({
      item: k < 4 ? `Iron` : `Item ${k}`,
      qty: k < 4 ? 8 : 4,
    }));
    expect(healSatchel(full)).toEqual(full);
  });

  it('truncates an over-long satchel to 8 slots', () => {
    const long = Array.from({ length: 12 }, (_, k) => ({ item: `Item ${k}`, qty: 1 }));
    const healed = healSatchel(long);

    expect(healed).toHaveLength(SATCHEL_EXPANDED_SIZE);
    expect(healed.map(s => s.item)).toEqual([
      'Item 0', 'Item 1', 'Item 2', 'Item 3',
      'Item 4', 'Item 5', 'Item 6', 'Item 7',
    ]);
  });

  it('heals malformed slot entries (null / non-object / bad fields) to empty slots', () => {
    const messy = [
      { item: 'Iron', qty: 4 },
      null,
      'garbage',
      { item: 42, qty: 'oops' }, // wrong types — item→'', qty→1
    ];
    const healed = healSatchel(messy);

    expect(healed).toHaveLength(SATCHEL_EXPANDED_SIZE);
    expect(healed[0]).toEqual({ item: 'Iron', qty: 4 });
    expect(healed[1]).toEqual(EMPTY_SLOT);
    expect(healed[2]).toEqual(EMPTY_SLOT);
    expect(healed[3]).toEqual(EMPTY_SLOT);
    expect(healed.slice(4)).toEqual([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
  });

  it('falls back to a fresh 8-slot satchel when satchel is not an array', () => {
    expect(healSatchel(undefined)).toHaveLength(SATCHEL_EXPANDED_SIZE);
    expect(healSatchel('nope')).toEqual(
      Array.from({ length: SATCHEL_EXPANDED_SIZE }, () => EMPTY_SLOT)
    );
  });

  // The real reload path: demo loads via migrateV1 (no heal), autosave persists
  // the 4-slot arrays, next load runs healState. This is the exact bug repro
  // against the shipped data, not a synthetic guard.
  it('keeps the shipped demo save\'s short satchels through migrateV1 → healState', () => {
    const healed = healState(migrateV1(demoSave));
    const alek = healed.guards.find(g => g.name === 'Alek');

    expect(alek.satchel).toHaveLength(SATCHEL_EXPANDED_SIZE);
    expect(alek.satchel.slice(0, 4)).toEqual([
      { item: 'Health Potion', qty: 1 },
      { item: 'Pine', qty: 2 },
      { item: 'Bone Frag.', qty: 3 },
      { item: 'Tenebris Essence', qty: 1 },
    ]);
    // No item is lost across all 8 guards after a reload.
    const before = demoSave.guards.reduce(
      (n, g) => n + (g.satchel || []).filter(s => s && s.item).length, 0);
    const after = healed.guards.reduce(
      (n, g) => n + g.satchel.filter(s => s.item).length, 0);
    expect(after).toBe(before);
  });

  it('clamps satchel qty to the item stack limit on heal (AVE-541)', () => {
    const healed = healState({
      guards: [{ name: 'Grigory', satchel: [
        { item: 'Health Potion', qty: 8 },
        { item: 'Iron', qty: 99 },
        { item: '', qty: 5 },
      ]}],
    });
    const satchel = healed.guards[0].satchel;
    expect(satchel[0]).toEqual({ item: 'Health Potion', qty: satchelStackLimit('Health Potion') });
    expect(satchel[1]).toEqual({ item: 'Iron', qty: satchelStackLimit('Iron') });
    expect(satchel[2]).toEqual({ item: '', qty: 1 });
  });
});

// ─── Orphaned stonebound `type` (AVE-874) ────────────────────────────────────

// `type` is retired (AVE-874), but a value that IS present must be NEGATED
// rather than silently dropped: the server's deep merge preserves keys absent
// from a payload, so a dropped key stays on the row forever and makes every
// Realtime echo of our own write look like a genuine remote change (AVE-922).
// Carrying `type: null` through means the next write clears the stored key.
describe('healState negates the orphaned stonebound location `type`', () => {
  it('negates `type` on a legacy save while preserving the real fields', () => {
    const healed = healState({
      stonebound: {
        max: 6,
        locations: [{ id: 1, type: 'City', selection: 'Mir', count: 2 }],
      },
    });
    const loc = healed.stonebound.locations[0];
    expect(loc).toHaveProperty('type', null);
    expect(loc.id).toBe(1);
    expect(loc.selection).toBe('Mir');
    expect(loc.count).toBe(2);
    expect(healed.stonebound.max).toBe(6);
  });

  it('still preserves a tombstone on a legacy location', () => {
    const healed = healState({
      stonebound: {
        max: 4,
        locations: [{ id: 7, type: 'Enemy node', selection: 'Scales', count: 1, deleted: true }],
      },
    });
    expect(healed.stonebound.locations[0].deleted).toBe(true);
    expect(healed.stonebound.locations[0]).toHaveProperty('type', null);
  });

  it('is idempotent — re-healing an already-negated location keeps type: null', () => {
    const once  = healState({
      stonebound: { max: 4, locations: [{ id: 3, type: 'City', selection: 'Mir', count: 1 }] },
    });
    const twice = healState(once);
    expect(twice.stonebound.locations).toEqual(once.stonebound.locations);
    expect(twice.stonebound.locations[0]).toHaveProperty('type', null);
  });

  it('leaves a location that never had `type` unchanged in shape', () => {
    const healed = healState({
      stonebound: { max: 4, locations: [{ id: 2, selection: 'Ryba', count: 3 }] },
    });
    expect(healed.stonebound.locations[0]).toEqual({ id: 2, selection: 'Ryba', count: 3 });
  });
});
