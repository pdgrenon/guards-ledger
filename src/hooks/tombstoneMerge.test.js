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
  reduceAdjustStash,
  withUndoTombstones,
  isEncounterCompleted,
  isBountyCompleted,
} from './gameReducers';
import { applyRemoteSection, extractSection } from './useSupabaseSync';
import { BUILDING_STATES } from '../data/buildings';

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
//
// A JSON `null` in the payload OVERWRITES. In the SQL, `jsonb_typeof(v)` is
// 'null' for such a value, so it matches neither the object nor the array
// branch and falls through to `jsonb_set(result, array[k], v)` — the key is set
// to JSON null, not left alone. (The function's `if incoming is null` guard at
// the top is for a SQL NULL *parameter* — the whole payload — not for a null
// value inside it.) This is what lets a healer negate a retired key so the
// write clears it server-side instead of leaving it there forever (AVE-922).
// `undefined` has no JSONB equivalent — a key absent from the payload never
// reaches the loop — so it is treated as "no change".
function deepMerge(existing, incoming) {
  if (incoming === undefined) return existing;
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

// ─── undo of an add survives the server merge (AVE-523) ──────────────────────
//
// Undoing an add restores the pre-add snapshot, which *omits* the added element.
// The server merge preserves anything the payload omits, so a raw pre-add
// snapshot leaves the element on the server and its echo resurrects it locally.
// withUndoTombstones augments the snapshot with explicit negations — id-array
// tombstones and 0-count stash keys — so the undo propagates through the merge.

describe('undo tombstones — undoing an add propagates through the server merge', () => {
  it('undoing an added plan tombstones it after the merge (visible list excludes it)', () => {
    const preAdd  = { campaign: { plans: [{ id: 1, text: 'A', done: false }] } };
    const added   = reduceAddPlan(preAdd, 'B');
    const addedId = added.campaign.plans.find(p => p.text === 'B').id;

    // Server already holds the added plan (the add's debounced write flushed).
    const server  = added.campaign;
    const payload = withUndoTombstones(preAdd, added).campaign;

    const merged  = deepMerge(server, payload);
    const visible = merged.plans.filter(p => !p.deleted);

    expect(merged.plans.find(p => p.id === addedId).deleted).toBe(true);
    expect(visible.map(p => p.id)).toEqual([1]);
  });

  it('undoing a stash +1 that created a new key pins it to 0 after the merge', () => {
    const preAdd  = { stash: { Iron: 2 }, log: [] };
    const added   = reduceAdjustStash(preAdd, 'Copper', 1); // brand-new key

    const server  = { Iron: 2, Copper: 1 };
    const payload = withUndoTombstones(preAdd, added).stash;

    const merged  = deepMerge(server, payload);

    expect(merged.Copper).toBe(0);
    expect(merged.Iron).toBe(2);
  });

  it('undoing an added side quest tombstones it after the merge', () => {
    const preAdd  = { campaign: { locations: { sideQuests: [{ id: 1, label: 'x' }] } } };
    const added   = { campaign: { locations: { sideQuests: [{ id: 1, label: 'x' }, { id: 2, label: 'y' }] } } };

    const server  = added.campaign;
    const payload = withUndoTombstones(preAdd, added).campaign;

    const merged  = deepMerge(server, payload);
    const visible = merged.locations.sideQuests.filter(e => !e.deleted);

    expect(visible.map(e => e.id)).toEqual([1]);
  });

  it('undoing an added stonebound location tombstones it after the merge', () => {
    const preAdd  = { stonebound: { max: 6, locations: [{ id: 1, selection: 'Mir', count: 1 }] } };
    const added   = { stonebound: { max: 6, locations: [{ id: 1, selection: 'Mir', count: 1 }, { id: 2, selection: 'Iron', count: 2 }] } };

    const server  = added.stonebound;
    const payload = withUndoTombstones(preAdd, added).stonebound;

    const merged  = deepMerge(server, payload);
    const visible = merged.locations.filter(l => !l.deleted);

    expect(visible.map(l => l.id)).toEqual([1]);
  });
});

// The mirror image, and the direction that was missing: undoing a DELETE.
//
// Passing the snapshot element through unchanged looks right locally, but it
// carries no `deleted` key and the merge preserves keys the payload omits — so
// the server stayed tombstoned and the write's own echo re-deleted the element
// about a second later, with the undo snapshot already cleared. Same shape as
// the "A Feud between Guilds" revert loop the completion reducers fixed by
// emitting an explicit `deleted: false`.
describe('undo tombstones — undoing a delete propagates through the server merge', () => {
  it('undoing a deleted plan revives it after the merge (and survives the echo)', () => {
    const preDelete = { campaign: { plans: [{ id: 1, text: 'A', done: false }, { id: 2, text: 'B', done: false }] } };
    const deleted   = reduceDeletePlan(preDelete, 2);

    // The delete's write already flushed, so the server holds the tombstone.
    const server    = deleted.campaign;
    expect(server.plans.find(p => p.id === 2).deleted).toBe(true);

    const payload   = withUndoTombstones(preDelete, deleted).campaign;
    // The payload must state the revival explicitly, not merely omit the flag.
    expect(payload.plans.find(p => p.id === 2).deleted).toBe(false);

    const merged    = deepMerge(server, payload);
    const visible   = merged.plans.filter(p => !p.deleted);
    expect(visible.map(p => p.id)).toEqual([1, 2]);

    // The echo of our own write carries the merged row back; it must not
    // re-delete what we just restored.
    const echoed = deepMerge(merged, merged);
    expect(echoed.plans.filter(p => !p.deleted).map(p => p.id)).toEqual([1, 2]);
  });

  it('undoing a deleted side quest revives it after the merge', () => {
    const live      = { id: 2, label: 'y' };
    const preDelete = { campaign: { locations: { sideQuests: [{ id: 1, label: 'x' }, live] } } };
    const deleted   = { campaign: { locations: { sideQuests: [{ id: 1, label: 'x' }, { ...live, deleted: true }] } } };

    const server    = deleted.campaign;
    const payload   = withUndoTombstones(preDelete, deleted).campaign;

    expect(payload.locations.sideQuests.find(e => e.id === 2).deleted).toBe(false);

    const merged  = deepMerge(server, payload);
    const visible = merged.locations.sideQuests.filter(e => !e.deleted);
    expect(visible.map(e => e.id)).toEqual([1, 2]);
  });

  it('undoing a deleted stonebound location revives it, keeping its count', () => {
    const live      = { id: 2, selection: 'Iron', count: 3 };
    const preDelete = { stonebound: { max: 6, locations: [{ id: 1, selection: 'Mir', count: 1 }, live] } };
    const deleted   = { stonebound: { max: 6, locations: [{ id: 1, selection: 'Mir', count: 1 }, { ...live, deleted: true }] } };

    const server    = deleted.stonebound;
    const payload   = withUndoTombstones(preDelete, deleted).stonebound;

    const merged  = deepMerge(server, payload);
    const revived = merged.locations.find(l => l.id === 2);
    expect(revived.deleted).toBe(false);
    expect(revived.count).toBe(3);
  });

  it('undoing an un-complete revives the completion', () => {
    const preToggle = { campaign: { completedEncounters: [{ id: 'ty-1', deleted: false }] } };
    const unDone    = { campaign: { completedEncounters: [{ id: 'ty-1', deleted: true }] } };

    const server    = unDone.campaign;
    const payload   = withUndoTombstones(preToggle, unDone).campaign;

    // The snapshot already carried an explicit `deleted: false`, so it states
    // its own truth and is passed through untouched — no rewrite needed.
    expect(payload.completedEncounters).toEqual([{ id: 'ty-1', deleted: false }]);

    const merged = deepMerge(server, payload);
    expect(merged.completedEncounters.find(e => e.id === 'ty-1').deleted).toBe(false);
  });

  it('handles an add and a delete in the same undo', () => {
    const snapshot = { campaign: { plans: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }] } };
    // Since the snapshot: plan 2 was deleted and plan 3 was added.
    const current  = { campaign: { plans: [
      { id: 1, text: 'A' },
      { id: 2, text: 'B', deleted: true },
      { id: 3, text: 'C' },
    ] } };

    const payload = withUndoTombstones(snapshot, current).campaign;
    const merged  = deepMerge(current.campaign, payload);
    const visible = merged.plans.filter(p => !p.deleted);

    expect(visible.map(p => p.id)).toEqual([1, 2]);
  });

  it('returns the snapshot array untouched when neither direction applies', () => {
    const plans    = [{ id: 1, text: 'A' }];
    const snapshot = { campaign: { plans } };
    const current  = { campaign: { plans } };
    // Identity, not just equality — callers use !== to detect a change.
    expect(withUndoTombstones(snapshot, current).campaign.plans).toBe(plans);
  });
});

// ─── withUndoTombstones — plain reducer output ───────────────────────────────

describe('withUndoTombstones — negates elements/keys added since the snapshot', () => {
  it('add-plan → plans gains a { id, deleted: true } tombstone for the added plan', () => {
    const preAdd  = { campaign: { plans: [{ id: 1, text: 'A', done: false }] } };
    const added   = reduceAddPlan(preAdd, 'B');
    const addedId = added.campaign.plans.find(p => p.text === 'B').id;

    const result = withUndoTombstones(preAdd, added);

    expect(result.campaign.plans).toEqual([
      { id: 1, text: 'A', done: false },
      { id: addedId, deleted: true },
    ]);
  });

  it('new stash key → snapshot gains that key at 0', () => {
    const preAdd = { stash: { Iron: 2 }, log: [] };
    const added  = reduceAdjustStash(preAdd, 'Copper', 1);

    const result = withUndoTombstones(preAdd, added);

    expect(result.stash).toEqual({ Iron: 2, Copper: 0 });
  });

  it('no additions → returns the snapshot arrays/maps untouched', () => {
    const preAdd = { campaign: { plans: [{ id: 1, text: 'A', done: false }] }, stash: { Iron: 2 } };
    const same   = { campaign: { plans: [{ id: 1, text: 'A', done: false }] }, stash: { Iron: 2 } };

    const result = withUndoTombstones(preAdd, same);

    expect(result.campaign.plans).toBe(preAdd.campaign.plans);
    expect(result.stash).toBe(preAdd.stash);
  });

  it('does not add tombstones for bounties (orphaned key)', () => {
    const preAdd = { campaign: { locations: { sideQuests: [{ id: 1, label: 'x' }] } } };
    const added  = {
      campaign: {
        locations: {
          sideQuests: [{ id: 1, label: 'x' }],
          bounties: [{ id: 99, label: 'legacy bounty' }],
        },
      },
    };

    const result = withUndoTombstones(preAdd, added);

    expect(result.campaign.locations.bounties).toBeUndefined();
  });
});

// ─── undo tombstones — object maps (AVE-925) ────────────────────────────────
//
// `stash` and `campaign.ftIstraBuildings` are the two growable maps in synced
// state. Undoing a change that ADDED a key has to negate the key, not omit it:
// the deep merge preserves keys absent from the payload, so an omitted key
// stays on the server and the write's own Realtime echo resurrects it — the
// same defect AVE-523 fixed for id-keyed arrays.

describe('undo tombstones — a first-time ftIstraBuildings change (AVE-925)', () => {
  const preBuild = { campaign: { ftIstraBuildings: {} } };
  const built    = { campaign: { ftIstraBuildings: { "Baren's Forge": 'built' } } };

  it('negates the added building key to not_owned', () => {
    const restored = withUndoTombstones(preBuild, built);
    expect(restored.campaign.ftIstraBuildings).toEqual({ "Baren's Forge": 'not_owned' });
  });

  it('propagates through the server merge — the card reads Not Owned again', () => {
    // The build's debounced write already flushed, so the server holds it.
    const server  = built.campaign;
    const payload = withUndoTombstones(preBuild, built).campaign;

    const merged = deepMerge(server, payload);

    expect(merged.ftIstraBuildings["Baren's Forge"]).toBe('not_owned');
    // 'not_owned' and absent are the same thing at both read sites in
    // CampaignTab (BuildingCard / FtIstraBuildingsCard).
    expect(BUILDING_STATES.indexOf(merged.ftIstraBuildings["Baren's Forge"] ?? 'not_owned')).toBe(0);
  });

  it('keeps the snapshot value for a key that already existed (built → upgraded)', () => {
    const prev = { campaign: { ftIstraBuildings: { "Baren's Forge": 'built' } } };
    const curr = { campaign: { ftIstraBuildings: { "Baren's Forge": 'upgraded' } } };

    const restored = withUndoTombstones(prev, curr);

    expect(restored.campaign.ftIstraBuildings).toEqual({ "Baren's Forge": 'built' });
    expect(deepMerge(curr.campaign, restored.campaign).ftIstraBuildings["Baren's Forge"]).toBe('built');
  });

  it('negates every key added at once, leaving pre-existing ones alone', () => {
    const prev = { campaign: { ftIstraBuildings: { "Zoya's Shop": 'built' } } };
    const curr = {
      campaign: {
        ftIstraBuildings: { "Zoya's Shop": 'built', "Baren's Forge": 'built', Stables: 'upgraded' },
      },
    };

    expect(withUndoTombstones(prev, curr).campaign.ftIstraBuildings).toEqual({
      "Zoya's Shop": 'built',
      "Baren's Forge": 'not_owned',
      Stables: 'not_owned',
    });
  });

  it('no additions → returns the snapshot map untouched (same reference)', () => {
    const prev = { campaign: { ftIstraBuildings: { "Baren's Forge": 'built' } } };
    const same = { campaign: { ftIstraBuildings: { "Baren's Forge": 'built' } } };

    const result = withUndoTombstones(prev, same);

    expect(result.campaign.ftIstraBuildings).toBe(prev.campaign.ftIstraBuildings);
  });
});

// ─── retired keys must be negated, not dropped (AVE-922) ────────────────────
//
// healStashSection / healCampaignSection retire `stonebound.locations[].type`
// (AVE-874) and `campaign.locations.bounties` (AVE-795). Dropping a value that
// is actually present leaves it on the server forever, so the Realtime echo of
// our OWN write carries a key local no longer has — it deep-equals neither
// current local nor the buffered self-write, and both echo guards in
// applyRemoteRow miss it. Negating instead makes the next write clear the key,
// after which the echo deep-equals local again.

describe('retired keys are cleared by our own next write (AVE-922)', () => {
  it('stash: the echo of our write deep-equals local after one round trip', () => {
    // A campaign row created before AVE-874 — still carrying `type`.
    const serverBefore = {
      stash: { Iron: 3 },
      stonebound: { max: 5, locations: [{ id: 1, selection: 'Mir', count: 2, type: '' }] },
    };

    // Inbound: heal-on-apply negates the retired key.
    let local = { stash: {}, stonebound: { max: 0, locations: [] } };
    local = applyRemoteSection(local, 'stash', serverBefore);

    // Our next write sends exactly what extractSection produces.
    const payload = extractSection(local, 'stash');
    const serverAfter = deepMerge(serverBefore, payload);

    // The stored key is cleared, so the echo now matches local exactly.
    expect(serverAfter.stonebound.locations[0]).toHaveProperty('type', null);
    expect(deepEqual(serverAfter, payload)).toBe(true);

    // And re-applying that echo is a genuine no-op.
    expect(deepEqual(extractSection(applyRemoteSection(local, 'stash', serverAfter), 'stash'), payload))
      .toBe(true);
  });

  it('campaign: same round trip for the retired locations.bounties', () => {
    const serverBefore = {
      campaign: {
        campaignId: 1,
        eventTokens: { mountain: 0, forest: 0, plains: 0, sea: 0 },
        locations: {
          party: 'Mir', caravan: '', mainQuest: '', boat: '',
          sideQuests: [],
          bounties: [{ id: 1, label: 'legacy bounty' }],
        },
        plans: [],
        ftIstraBuildings: {},
        completedEncounters: [],
        completedBounties: [],
        completedPuzzleQuests: [],
      },
    };

    let local = { campaign: {} };
    local = applyRemoteSection(local, 'campaign', serverBefore);

    const payload = extractSection(local, 'campaign');
    const serverAfter = deepMerge(serverBefore, payload);

    expect(serverAfter.campaign.locations).toHaveProperty('bounties', null);
    expect(deepEqual(serverAfter, payload)).toBe(true);
  });

  it('a row that never had the retired keys is untouched — no null is invented', () => {
    const server = {
      stash: { Iron: 3 },
      stonebound: { max: 5, locations: [{ id: 1, selection: 'Mir', count: 2 }] },
    };
    const local   = applyRemoteSection({ stash: {}, stonebound: { max: 0, locations: [] } }, 'stash', server);
    const payload = extractSection(local, 'stash');

    expect(payload.stonebound.locations[0]).not.toHaveProperty('type');
    expect(deepEqual(server, payload)).toBe(true);
  });
});
