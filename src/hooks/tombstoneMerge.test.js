/**
 * tombstoneMerge.test.js
 *
 * AVE-287 — array-element deletions must survive the server merge and Realtime
 * echo while a campaign is active.
 *
 * The real merge runs server-side (supabase/migrations/0003_array_merge.sql +
 * 0004_tombstone_deletes.sql). Those SQL functions can't be executed in a unit
 * test, so this file models their semantics in JS — a by-id deep merge for
 * id-keyed arrays, a set-union for plain-value arrays — and asserts that the
 * tombstone client reducers produce payloads that come back correctly through
 * that merge:
 *
 *   1. delete-then-echo: a deleted element stays deleted after the server merges
 *      it and the client re-applies the echoed row.
 *   2. concurrent add-vs-delete: player A's delete and player B's add of a
 *      different element both survive the same merge window, in either order.
 *   3. complete-over-tombstone: re-completing an element the server holds a
 *      tombstone for must actively clear the flag — the merge preserves keys
 *      absent from the incoming element, so a bare { id } payload leaves
 *      deleted:true in place and the write's own echo reverts the completion
 *      (the "A Feud between Guilds won't stay completed" bug).
 *
 * If the SQL merge semantics ever change, update the model here to match.
 */
import { describe, it, expect } from 'vitest';
import deepEqual from 'fast-deep-equal';
import {
  reduceDeletePlan,
  reduceRemoveDynamicLocation,
  reduceRemoveStoneboundLocation,
  reduceToggleEncounterComplete,
  reduceToggleBountyComplete,
  reduceAddPlan,
  isEncounterCompleted,
  isBountyCompleted,
} from './gameReducers';

// ─── JS model of the server merge (mirrors 0003 + 0004) ─────────────────────

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Mirrors merge_jsonb_array_by_id: id-keyed arrays merge element-by-id (existing
// preserved, matching ids deep-merged, new ids appended); plain-value arrays
// merge as a set union.
function mergeArrayById(existing, incoming) {
  if (
    incoming.length === 0 ||
    !isObj(incoming[0]) ||
    !('id' in incoming[0])
  ) {
    const out = [...existing];
    for (const v of incoming) if (!out.some(x => deepEqual(x, v))) out.push(v);
    return out;
  }
  let result = [...existing];
  for (const elem of incoming) {
    const idx = result.findIndex(r => isObj(r) && r.id === elem.id);
    if (idx === -1) result = [...result, elem];
    else result = result.map((r, i) => (i === idx ? deepMerge(r, elem) : r));
  }
  return result;
}

// Mirrors deep_merge_jsonb: objects merge key-by-key (existing keys not present
// in incoming preserved), arrays merge by id/union, scalars overwrite.
function deepMerge(existing, incoming) {
  if (incoming === undefined || incoming === null) return existing;
  if (Array.isArray(existing) && Array.isArray(incoming)) return mergeArrayById(existing, incoming);
  if (isObj(existing) && isObj(incoming)) {
    const out = { ...existing };
    for (const k of Object.keys(incoming)) {
      out[k] = k in existing ? deepMerge(existing[k], incoming[k]) : incoming[k];
    }
    return out;
  }
  return incoming;
}

// ─── delete-then-echo ───────────────────────────────────────────────────────

describe('tombstone merge — delete stays deleted after the server echo', () => {
  it('deleting a plan does not reappear', () => {
    const campaign = { plans: [{ id: 1, text: 'A', done: false }, { id: 2, text: 'B', done: false }] };
    const afterDelete = reduceDeletePlan({ campaign }, 2).campaign;

    // Server merges the client's payload into the stored row, then echoes it back.
    const merged = deepMerge(campaign, afterDelete);
    const visible = merged.plans.filter(p => !p.deleted);

    expect(merged.plans.find(p => p.id === 2).deleted).toBe(true);
    expect(visible.map(p => p.id)).toEqual([1]);
  });

  it('deleting a side quest does not reappear', () => {
    const campaign = { locations: { sideQuests: [{ id: 1, label: 'x' }, { id: 2, label: 'y' }] } };
    const afterDelete = reduceRemoveDynamicLocation({ campaign }, 'sideQuests', 1).campaign;

    const merged = deepMerge(campaign, afterDelete);
    const visible = merged.locations.sideQuests.filter(e => !e.deleted);

    expect(visible.map(e => e.id)).toEqual([2]);
  });

  it('removing a stonebound location does not reappear', () => {
    const stonebound = { max: 6, locations: [{ id: 1, selection: 'Mir', count: 1 }, { id: 2, selection: 'Iron', count: 2 }] };
    // reduceRemoveStoneboundLocation logs, so include a log array.
    const afterRemove = reduceRemoveStoneboundLocation({ stonebound, log: [] }, 1).stonebound;

    const merged = deepMerge(stonebound, afterRemove);
    const visible = merged.locations.filter(l => !l.deleted);

    expect(visible.map(l => l.id)).toEqual([2]);
  });

  it('un-completing an encounter stays un-completed', () => {
    const campaign = { completedEncounters: [{ id: 'boss-1' }] };
    const afterUncomplete = reduceToggleEncounterComplete({ campaign }, 'boss-1').campaign;

    const merged = deepMerge(campaign, afterUncomplete);

    expect(isEncounterCompleted(merged.completedEncounters, 'boss-1')).toBe(false);
  });
});

// ─── concurrent add vs delete ───────────────────────────────────────────────

describe('tombstone merge — concurrent add and delete both survive', () => {
  it('player A deletes plan 2 while player B adds plan 3 (delete first)', () => {
    const base = { campaign: { plans: [{ id: 1, text: 'A', done: false }, { id: 2, text: 'B', done: false }] } };

    const aPayload = reduceDeletePlan(base, 2).campaign;                 // tombstones plan 2
    const bPayload = reduceAddPlan(base, 'C').campaign;                  // appends plan 3

    let server = deepMerge(base.campaign, aPayload);
    server = deepMerge(server, bPayload);

    const visible = server.plans.filter(p => !p.deleted);
    expect(server.plans.find(p => p.id === 2).deleted).toBe(true);      // delete survived
    expect(visible.map(p => p.text)).toEqual(['A', 'C']);               // add survived
  });

  it('player A deletes plan 2 while player B adds plan 3 (add first)', () => {
    const base = { campaign: { plans: [{ id: 1, text: 'A', done: false }, { id: 2, text: 'B', done: false }] } };

    const aPayload = reduceDeletePlan(base, 2).campaign;
    const bPayload = reduceAddPlan(base, 'C').campaign;

    let server = deepMerge(base.campaign, bPayload);
    server = deepMerge(server, aPayload);

    const visible = server.plans.filter(p => !p.deleted);
    expect(server.plans.find(p => p.id === 2).deleted).toBe(true);
    expect(visible.map(p => p.text)).toEqual(['A', 'C']);
  });
});

// ─── complete over a server-side tombstone ──────────────────────────────────
//
// Regression for the "A Feud between Guilds" revert loop: the server row held
// a tombstone for the bounty (from an earlier un-complete). Completing it sent
// a bare { id } — but the merge preserves keys absent from the incoming
// element, so deleted:true survived on the server, and the write's own
// Realtime echo (carrying the still-tombstoned element) flipped the bounty
// back to incomplete on the completing client about a second later. Every
// retry lost the same way, permanently. The reducers now write deleted:false
// explicitly, which the merge applies like any other field edit.

describe('tombstone merge — completing over a server-side tombstone sticks', () => {
  it('re-completing a bounty whose element is tombstoned on the server survives the echo', () => {
    const server = { completedBounties: [{ id: 'mir-c1-a-feud-between-guilds', deleted: true }] };
    // Local state matches the server (the earlier un-complete already synced).
    const local  = { campaign: { completedBounties: [{ id: 'mir-c1-a-feud-between-guilds', deleted: true }] } };

    const payload = reduceToggleBountyComplete(local, 'mir-c1-a-feud-between-guilds').campaign;
    const merged  = deepMerge(server, payload); // what the server stores AND echoes back

    expect(isBountyCompleted(merged.completedBounties, 'mir-c1-a-feud-between-guilds')).toBe(true);
  });

  it('completing a bounty the local state has never seen still clears a server-side tombstone', () => {
    // Local lost the element entirely (fresh device / reset save) while the
    // server still holds the tombstone — the append path must also carry an
    // explicit deleted:false so the by-id merge overwrites the flag.
    const server = { completedBounties: [{ id: 'mir-c1-a-feud-between-guilds', deleted: true }] };
    const local  = { campaign: { completedBounties: [] } };

    const payload = reduceToggleBountyComplete(local, 'mir-c1-a-feud-between-guilds').campaign;
    const merged  = deepMerge(server, payload);

    expect(isBountyCompleted(merged.completedBounties, 'mir-c1-a-feud-between-guilds')).toBe(true);
  });

  it('re-completing an encounter over a server-side tombstone survives the echo', () => {
    const server = { completedEncounters: [{ id: 'boss-1', deleted: true }] };
    const local  = { campaign: { completedEncounters: [{ id: 'boss-1', deleted: true }] } };

    const payload = reduceToggleEncounterComplete(local, 'boss-1').campaign;
    const merged  = deepMerge(server, payload);

    expect(isEncounterCompleted(merged.completedEncounters, 'boss-1')).toBe(true);
  });
});
