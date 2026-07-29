/**
 * gameReducers.js
 *
 * Pure state-transition functions extracted from useGameState.
 * Each function takes a state snapshot and returns a new state snapshot —
 * no React, no localStorage, no side-effects. This makes them trivially
 * unit-testable and keeps useGameState as a thin wiring layer.
 *
 * State shape (flat, sections spread at top level):
 *   resources : { sil, lux }
 *   cities    : { cities[] }
 *   guards    : { guards[], activeParty, activeGuardIdx }
 *   stash     : { stash{}, stonebound }
 *   campaign  : { campaign: { eventTokens, locations, plans } }
 *   + log[], settings{} (local-only, not synced)
 *
 * Reducers read and write the flat state directly — the sectioning is a
 * conceptual and persistence boundary, not a nesting change.
 */

import { SATCHEL_EXPANDED_SIZE, createInitialGuards, createInitialCities, createInitialStash, createInitialCampaign } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, ITEMS, satchelStackLimit } from '../data/materials';
import { bountiesForCity } from '../data/bounties';
import { puzzleQuestForCity } from '../data/puzzleQuests';

export const ALL_EQUIPMENT     = new Set([...WEAPONS, ...ARMOR, ...ACCESSORIES, ...ITEMS]);
export const ALL_MATERIALS_SET = new Set(ALL_MATERIALS);

// ─── Logging ─────────────────────────────────────────────────────────────────

export function addLog(state, message) {
  const now   = new Date();
  const time  = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const entry = { time, message, id: Date.now() + Math.random() };
  return { ...state, log: [entry, ...state.log].slice(0, 100) };
}

/**
 * Derive a human-readable undo label by comparing prev/next log heads.
 * Returns the log message if the action added a new entry, otherwise falls
 * back to a generic section-based label (e.g. "Campaign update").
 */
export function deriveUndoLabel(prev, next, sectionName) {
  if (next.log[0]?.id !== prev.log[0]?.id) {
    return next.log[0]?.message ?? null;
  }
  if (sectionName) {
    const guardMatch = sectionName.match(/^guard_(\d+)$/);
    if (guardMatch) {
      const guard = prev.guards[Number(guardMatch[1])];
      return guard ? `${guard.name} update` : 'Guard update';
    }
    const labels = {
      party: 'Party update',
      resources: 'Resources update',
      cities: 'City update',
      stash: 'Stash update',
      campaign: 'Campaign update',
    };
    return labels[sectionName] ?? 'State update';
  }
  return 'State update';
}

// ─── Party navigation ─────────────────────────────────────────────────────────

export function reduceSetPartySlot(s, slotIdx, name) {
  const currentParty = s.activeParty ?? ['Alek', 'Grigory'];
  const newParty     = [...currentParty];
  newParty[slotIdx]  = name;

  const activeGuardName  = s.guards[s.activeGuardIdx]?.name;
  const activeGuardSlot  = currentParty.indexOf(activeGuardName);
  const newActiveGuardIdx = activeGuardSlot === slotIdx
    ? s.guards.findIndex(g => g.name === newParty[slotIdx])
    : s.activeGuardIdx;

  return { ...s, activeParty: newParty, activeGuardIdx: newActiveGuardIdx };
}

/**
 * Derive a safe activeGuardIdx that is guaranteed to point at a guard in the
 * active party. If the current index is valid, it is returned unchanged;
 * otherwise it falls back to the first party guard (AVE-531).
 */
export function safeActiveGuardIdx(guards, activeParty, activeGuardIdx) {
  const party = activeParty ?? ['Alek', 'Grigory'];
  const idx   = activeGuardIdx ?? 0;
  return party.includes(guards[idx]?.name)
    ? idx
    : Math.max(0, guards.findIndex(g => g.name === party[0]));
}

// ─── Party resources ──────────────────────────────────────────────────────────

export function reduceSetSil(s, delta) {
  const newVal = Math.max(0, s.sil + delta);
  return addLog({ ...s, sil: newVal },
    `Party Sil ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

export function reduceSetLux(s, delta) {
  const newVal = Math.max(0, s.lux + delta);
  return addLog({ ...s, lux: newVal },
    `Party Lux ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

// ─── Guard HP ─────────────────────────────────────────────────────────────────

export function reduceAdjustGuardHp(s, guardIdx, delta) {
  const g     = s.guards[guardIdx];
  const newHp = Math.min(g.maxHp, Math.max(0, g.hp + delta));
  const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, hp: newHp } : g2);
  return addLog({ ...s, guards }, `${g.name} HP ${delta >= 0 ? '+' : ''}${delta} → ${newHp}`);
}

export function reduceAdjustGuardMaxHp(s, guardIdx, delta) {
  const g      = s.guards[guardIdx];
  const newMax = Math.max(1, g.maxHp + delta);
  const newHp  = Math.min(g.hp, newMax);
  const guards = s.guards.map((g2, i) =>
    i === guardIdx ? { ...g2, maxHp: newMax, hp: newHp } : g2
  );
  return addLog({ ...s, guards }, `${g.name} max HP → ${newMax}`);
}

// ─── Guard equipment ──────────────────────────────────────────────────────────

export function reduceSetGuardEquipment(s, guardIdx, slot, value) {
  const g      = s.guards[guardIdx];
  const guards = s.guards.map((g2, i) =>
    i === guardIdx ? { ...g2, equipment: { ...g2.equipment, [slot]: value } } : g2
  );
  const newState = { ...s, guards };

  if (value && ALL_EQUIPMENT.has(value)) {
    return addLog(newState, `${g.name} equipped ${value} (${slot})`);
  }
  if (!value) {
    const prev = g.equipment[slot];
    if (prev) return addLog(newState, `${g.name} unequipped ${slot}`);
  }
  return newState;
}

// ─── Guard satchel ────────────────────────────────────────────────────────────

export function reduceSetGuardSatchelItem(s, guardIdx, slotIdx, field, value) {
  const g      = s.guards[guardIdx];
  const guards = s.guards.map((gi, i) => {
    if (i !== guardIdx) return gi;
    const full    = Array.from({ length: SATCHEL_EXPANDED_SIZE }, (_, k) =>
      gi.satchel[k] ?? { item: '', qty: 1 }
    );
    const satchel = full.map((slot, si) => {
      if (si !== slotIdx) return slot;
      const updated = { ...slot, [field]: value };
      if (field === 'item' && value) {
        updated.qty = Math.min(updated.qty, satchelStackLimit(value));
      }
      if (field === 'qty') {
        updated.qty = Math.min(Math.max(1, Math.trunc(updated.qty)), satchelStackLimit(slot.item || ''));
      }
      return updated;
    });
    return { ...gi, satchel };
  });
  const newState = { ...s, guards };

  if (field === 'item' && value && ALL_MATERIALS_SET.has(value)) {
    return addLog(newState, `${g.name} satchel slot ${slotIdx + 1} → ${value}`);
  }
  if (field === 'item' && !value) {
    const prev = g.satchel[slotIdx]?.item;
    if (prev) return addLog(newState, `${g.name} satchel slot ${slotIdx + 1} cleared`);
  }
  if (field === 'qty') {
    const item = g.satchel[slotIdx]?.item;
    if (item) return addLog(newState, `${g.name} ${item} ×${value}`);
  }
  return newState;
}

// ─── Cities ───────────────────────────────────────────────────────────────────

// Reputation (prestige) is always derived, never stored. For the active
// campaign it counts the city's puzzle quest plus its two completed campaign
// bounties (AVE-359). Both puzzle-quest and bounty completion are
// campaign-scoped — each id in `completedPuzzleQuests`/`completedBounties`
// encodes its campaign — so moving to another campaign and back preserves
// each campaign's reputation independently (max 3: 1 puzzle + 2 bounties).
// `campaignId`/`completedBounties`/`completedPuzzleQuests` are optional so
// prestige is still derivable (as 0) without campaign context.
export function cityPrestige(city, campaignId, completedBounties, completedPuzzleQuests) {
  const puzzleQuest = puzzleQuestForCity(city.name, campaignId);
  const puzzle = puzzleQuest && isPuzzleQuestCompleted(completedPuzzleQuests, puzzleQuest.id) ? 1 : 0;
  const bounties = bountiesForCity(city.name, campaignId)
    .filter(b => isBountyCompleted(completedBounties, b.id)).length;
  return puzzle + bounties;
}

// ─── Stash ────────────────────────────────────────────────────────────────────

// A count that reaches 0 is kept as a `0` entry (a map tombstone) rather than
// deleting the key: the server's field-level merge preserves keys absent from
// the payload, so a deleted key never propagates — and the write's own
// Realtime echo resurrects the item on the deleting client (AVE-369; same
// class as the AVE-362 satchel bug). Read sites already treat 0 and absent
// identically (`?? 0` / `> 0` filters); compactTombstones drops 0-count keys
// in solo mode so they don't accumulate.
export function reduceAdjustStash(s, itemName, delta) {
  const current = s.stash[itemName] ?? 0;
  const newVal  = Math.max(0, current + delta);
  const stash   = { ...s.stash, [itemName]: newVal };
  // Don't materialize a tombstone for an item that was never in the stash
  // (e.g. clamping a decrement on an absent key).
  if (newVal === 0 && !(itemName in s.stash)) delete stash[itemName];
  return addLog({ ...s, stash },
    `Stash ${itemName} ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

// ─── Stonebound ───────────────────────────────────────────────────────────────

export function reduceSetStoneboundMax(s, delta) {
  const newMax = Math.max(0, s.stonebound.max + delta);
  return addLog(
    { ...s, stonebound: { ...s.stonebound, max: newMax } },
    `Stonebound cube cap → ${newMax}`
  );
}

// A location is { id, selection, count } (plus a `deleted` tombstone once
// removed). There is deliberately no `type` field: it was seeded empty here,
// healed on every load, and shipped through the merge on every stash write, but
// nothing ever derived it from the selection and nothing ever read it — the
// same orphaned-state class as AVE-795. Retired in AVE-874; re-derive it only
// if a consumer actually appears.
export function reduceAddStoneboundLocation(s) {
  const id        = Date.now() + Math.random();
  const locations = [...s.stonebound.locations, { id, selection: '', count: 1 }];
  return addLog(
    { ...s, stonebound: { ...s.stonebound, locations } },
    'Stonebound location added'
  );
}

// Soft-delete (tombstone) rather than hard-remove: whenever a campaign is
// active the server merge is append/union-only, so a filtered-out element is
// restored by the merge and re-applied by the Realtime echo. Marking the
// element `deleted: true` lets the delete propagate like any other field edit
// (the by-id merge carries the flag) and keeps concurrent-add safety. All read
// sites filter `deleted` elements out. (AVE-287)
export function reduceRemoveStoneboundLocation(s, id) {
  const loc       = s.stonebound.locations.find(l => l.id === id);
  const locations = s.stonebound.locations.map(l =>
    l.id === id ? { ...l, deleted: true } : l
  );
  const label     = loc?.selection || 'empty location';
  return addLog(
    { ...s, stonebound: { ...s.stonebound, locations } },
    `Stonebound removed: ${label}`
  );
}

export function reduceUpdateStoneboundLocation(s, id, field, value) {
  const loc = s.stonebound.locations.find(l => l.id === id);
  if (loc && loc[field] === value) return s;

  const locations = s.stonebound.locations.map(l =>
    l.id === id ? { ...l, [field]: value } : l
  );
  const newState = { ...s, stonebound: { ...s.stonebound, locations } };

  if (field === 'selection' && value) {
    return addLog(newState, `Stonebound location → ${value}`);
  }
  if (field === 'count') {
    const label = loc?.selection || 'location';
    return addLog(newState, `Stonebound ${label} cubes → ${value}`);
  }
  return newState;
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export function reduceSetEventToken(s, region, delta) {
  const current   = s.campaign.eventTokens[region] ?? 0;
  const next      = Math.max(0, Math.min(3, current + delta));
  const triggered = next === 3 && current < 3;
  const newTokens = { ...s.campaign.eventTokens, [region]: next };
  const campaign  = { ...s.campaign, eventTokens: newTokens };
  const label     = region.charAt(0).toUpperCase() + region.slice(1);
  const msg = triggered
    ? `Campaign ${label} event triggered (3/3) — resolve it`
    : `Campaign ${label} token ${delta >= 0 ? '+' : ''}${delta} → ${next}`;
  return addLog({ ...s, campaign }, msg);
}

export function reduceResetEventToken(s, region) {
  const newTokens = { ...s.campaign.eventTokens, [region]: 0 };
  const campaign  = { ...s.campaign, eventTokens: newTokens };
  const label     = region.charAt(0).toUpperCase() + region.slice(1);
  return addLog({ ...s, campaign }, `Campaign ${label} event resolved · token reset`);
}

export function reduceSetCampaignLocation(s, key, value) {
  const locations = { ...s.campaign.locations, [key]: value };
  const campaign  = { ...s.campaign, locations };
  return { ...s, campaign };
}

export function reduceAddDynamicLocation(s, type) {
  const id        = Date.now() + Math.random();
  const entries   = [...(s.campaign.locations[type] ?? []), { id, label: '' }];
  const locations = { ...s.campaign.locations, [type]: entries };
  const campaign  = { ...s.campaign, locations };
  return { ...s, campaign };
}

export function reduceUpdateDynamicLocation(s, type, id, label) {
  const entries   = (s.campaign.locations[type] ?? []).map(e =>
    e.id === id ? { ...e, label } : e
  );
  const locations = { ...s.campaign.locations, [type]: entries };
  const campaign  = { ...s.campaign, locations };
  return { ...s, campaign };
}

// Tombstone rather than hard-remove so the delete survives the server merge
// and Realtime echo while a campaign is active (AVE-287). Read sites filter out
// `deleted` entries.
export function reduceRemoveDynamicLocation(s, type, id) {
  const entries   = (s.campaign.locations[type] ?? []).map(e =>
    e.id === id ? { ...e, deleted: true } : e
  );
  const locations = { ...s.campaign.locations, [type]: entries };
  const campaign  = { ...s.campaign, locations };
  return { ...s, campaign };
}

export function reduceAddPlan(s, text) {
  if (!text.trim()) return s;
  const id       = Date.now() + Math.random();
  const plan     = { id, text: text.trim(), done: false };
  const campaign = { ...s.campaign, plans: [...s.campaign.plans, plan] };
  return { ...s, campaign };
}

export function reduceTogglePlan(s, id) {
  const plans    = s.campaign.plans.map(p => p.id === id ? { ...p, done: !p.done } : p);
  const campaign = { ...s.campaign, plans };
  return { ...s, campaign };
}

// Tombstone rather than hard-remove so the delete survives the server merge and
// Realtime echo while a campaign is active (AVE-287). Read sites filter out
// `deleted` plans.
export function reduceDeletePlan(s, id) {
  const plans    = s.campaign.plans.map(p =>
    p.id === id ? { ...p, deleted: true } : p
  );
  const campaign = { ...s.campaign, plans };
  return { ...s, campaign };
}

// completedEncounters is an id-keyed array of { id, deleted? } objects (AVE-287).
// An encounter is "completed" when its element is present and not tombstoned.
// Un-completing marks the element `deleted: true` (rather than dropping it) so
// the change propagates through the append/union-only server merge like any
// other field edit. Completing writes `deleted: false` EXPLICITLY — never a bare
// { id } with the key omitted — because the server's per-element deep merge
// preserves keys absent from the incoming element: a bare { id } sent against a
// server-side tombstone leaves `deleted: true` in place, and the write's own
// Realtime echo then carries the tombstone back and reverts the completion on
// the very client that made it, about a second later (the "A Feud between
// Guilds won't stay completed" bug). This mirrors how the other id-keyed
// arrays (plans, side quests, stonebound locations) tombstone deletes.
export function isEncounterCompleted(completedEncounters, id) {
  return (completedEncounters ?? []).some(e => e.id === id && !e.deleted);
}

/**
 * Normalize a completedEncounters value to the id-keyed { id, deleted? } shape.
 * Pre-AVE-287 saves stored a plain array of encounter-id strings; this converts
 * those (and tolerates already-normalized rows) so the client can read either
 * shape. Used on load/migration and when reading a possibly-unmigrated remote row.
 *
 * Duplicate ids keep the FIRST occurrence. Duplicates only ever came from the
 * AVE-370 legacy puzzle-quest migration re-appending a live entry next to a
 * tombstone — the first entry is the one that reflects the user's actual
 * toggle, later ones were bug-added. (The toggle reducers map ALL matching
 * entries identically, so after any manual toggle the duplicates agree and
 * keep-first is still correct.)
 */
export function normalizeCompletedEncounters(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const e of arr) {
    let entry = null;
    if (typeof e === 'string') {
      entry = { id: e };
    } else if (e && typeof e === 'object' && typeof e.id === 'string') {
      // An explicit `deleted: false` is preserved (not stripped to a bare
      // { id }): completions are written with the flag explicit so they can
      // clear a server-side tombstone, and stripping it here would make a
      // reloaded local value no longer deep-equal the server row / our own
      // Realtime echo, defeating the value-based echo suppression.
      if (e.deleted) entry = { id: e.id, deleted: true };
      else if ('deleted' in e) entry = { id: e.id, deleted: false };
      else entry = { id: e.id };
    }
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export function reduceToggleEncounterComplete(s, encounterId) {
  const completed = s.campaign.completedEncounters ?? [];
  const existing  = completed.find(e => e.id === encounterId);
  let next;
  if (existing) {
    // Present already: flip its tombstone. Completed → mark deleted; previously
    // un-completed → explicitly clear the flag (see the shape comment above:
    // omitting the key cannot clear a server-side tombstone).
    const isCompleted = !existing.deleted;
    next = completed.map(e =>
      e.id === encounterId ? { id: e.id, deleted: isCompleted } : e
    );
  } else {
    next = [...completed, { id: encounterId, deleted: false }];
  }
  return { ...s, campaign: { ...s.campaign, completedEncounters: next } };
}

export function reduceSetCampaign(s, campaignId) {
  const campaign = { ...s.campaign, campaignId };
  return { ...s, campaign };
}

// completedBounties mirrors completedEncounters exactly: an id-keyed array of
// { id, deleted? } objects living in the campaign section, so per-bounty
// completion rides the same field-level/tombstone server merge (AVE-287) and
// syncs via the existing five-section pattern. A bounty is "completed" when its
// element is present and not tombstoned. Un-completing marks `deleted: true`
// rather than dropping the element; completing writes an explicit
// `deleted: false` (see the completedEncounters shape comment above — an
// omitted key cannot clear a server-side tombstone).
export function isBountyCompleted(completedBounties, id) {
  return (completedBounties ?? []).some(b => b.id === id && !b.deleted);
}

// completedPuzzleQuests mirrors completedBounties exactly: an id-keyed array of
// { id, deleted? } objects living in the campaign section, so per-city puzzle
// quest completion is campaign-scoped and rides the same field-level/tombstone
// server merge. A puzzle quest is "completed" when its element is present and
// not tombstoned.
export function isPuzzleQuestCompleted(completedPuzzleQuests, id) {
  return (completedPuzzleQuests ?? []).some(q => q.id === id && !q.deleted);
}

export function reduceTogglePuzzleQuestComplete(s, puzzleQuestId) {
  const completed = s.campaign.completedPuzzleQuests ?? [];
  const existing  = completed.find(q => q.id === puzzleQuestId);
  let next;
  if (existing) {
    const isCompleted = !existing.deleted;
    next = completed.map(q =>
      q.id === puzzleQuestId ? { id: q.id, deleted: isCompleted } : q
    );
  } else {
    next = [...completed, { id: puzzleQuestId, deleted: false }];
  }
  return { ...s, campaign: { ...s.campaign, completedPuzzleQuests: next } };
}

// ─── Tombstone compaction (solo-mode GC) ─────────────────────────────────────
//
// Hard-drop tombstoned (deleted: true) elements from all id-keyed arrays.
// In solo mode (no active Supabase campaign) the tombstone pattern serves no
// purpose — there is no append/union server merge to defeat — so dead entries
// can be safely purged. This prevents unbounded accumulation of soft-deleted
// plan, side-quest, stonebound-location, encounter, and bounty entries over a
// long campaign (AVE-368).
export function compactTombstones(state) {
  const oldLocs = state.stonebound?.locations ?? [];
  const newLocs = oldLocs.filter(l => !l.deleted);
  const stonebound = newLocs.length !== oldLocs.length
    ? { ...state.stonebound, locations: newLocs }
    : state.stonebound;

  // Zero-count stash entries are map tombstones (AVE-369) — dead weight
  // without a server merge to defeat.
  const oldStash = state.stash ?? {};
  const hasZeroCounts = Object.values(oldStash).some(v => v === 0);
  const stash = hasZeroCounts
    ? Object.fromEntries(Object.entries(oldStash).filter(([, v]) => v !== 0))
    : state.stash;

  let campaign = state.campaign;
  if (campaign) {
    const oldPlans = campaign.plans ?? [];
    const newPlans = oldPlans.filter(p => !p.deleted);
    const oldEncs = campaign.completedEncounters ?? [];
    const newEncs = oldEncs.filter(e => !e.deleted);
    const oldBounts = campaign.completedBounties ?? [];
    const newBounts = oldBounts.filter(b => !b.deleted);
    const oldPuzzles = campaign.completedPuzzleQuests ?? [];
    const newPuzzles = oldPuzzles.filter(q => !q.deleted);

    let locations = campaign.locations;
    if (locations) {
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(locations).map(([k, v]) => {
          if (!Array.isArray(v)) return [k, v];
          const filtered = v.filter(e => !e.deleted);
          if (filtered.length !== v.length) changed = true;
          return [k, filtered];
        })
      );
      if (changed) locations = next;
    }

    if (
      newPlans.length !== oldPlans.length ||
      newEncs.length !== oldEncs.length ||
      newBounts.length !== oldBounts.length ||
      newPuzzles.length !== oldPuzzles.length ||
      locations !== campaign.locations
    ) {
      campaign = {
        ...campaign,
        locations,
        plans: newPlans,
        completedEncounters: newEncs,
        completedBounties: newBounts,
        completedPuzzleQuests: newPuzzles,
      };
    }
  }

  if (stonebound === state.stonebound && campaign === state.campaign && stash === state.stash) {
    return state;
  }

  return { ...state, stash, stonebound, campaign };
}

export function reduceToggleBountyComplete(s, bountyId) {
  const completed = s.campaign.completedBounties ?? [];
  const existing  = completed.find(b => b.id === bountyId);
  let next;
  if (existing) {
    const isCompleted = !existing.deleted;
    next = completed.map(b =>
      b.id === bountyId ? { id: b.id, deleted: isCompleted } : b
    );
  } else {
    next = [...completed, { id: bountyId, deleted: false }];
  }
  return { ...s, campaign: { ...s.campaign, completedBounties: next } };
}

// ── Undo tombstones (AVE-523) ───────────────────────────────────────────────
//
// Undoing an *add* expresses the change by omitting the added element. But the
// server merge (merge_jsonb_array_by_id / deep_merge_jsonb) preserves anything
// the payload omits — existing array elements and object keys survive — so the
// element stays on the server and the write's own Realtime echo resurrects it
// locally. The delete reducers avoid this with tombstones ({ deleted: true })
// and 0-count stash keys; the undo path bypasses that discipline entirely.
//
// `withUndoTombstones(prevState, currentState)` returns `prevState` augmented so
// that everything present in `currentState` but missing from `prevState` is
// explicitly negated: id-keyed array elements gain a { id, deleted: true }
// tombstone, and new stash keys are pinned to 0 (the map-tombstone convention,
// AVE-369). Everything else passes through from `prevState` unchanged — scalar
// fields and guard objects are explicit-value writes that already merge right.
// Side-effect free; safe unconditionally (compactTombstones GCs solo state and
// all read sites filter `deleted` / treat 0 as absent).

// Append { id, deleted: true } for every id present in `curr` but absent from
// `prev`. Both default to [] so a missing array on either side is handled.
function appendUndoArrayTombstones(prev, curr) {
  const prevArr = prev ?? [];
  const currArr = curr ?? [];
  const prevIds = new Set(prevArr.map(e => e?.id));
  const tombstones = currArr
    .filter(e => e && 'id' in e && !prevIds.has(e.id))
    .map(e => ({ id: e.id, deleted: true }));
  return tombstones.length ? [...prevArr, ...tombstones] : prevArr;
}

export function withUndoTombstones(prevState, currentState) {
  if (!prevState || !currentState) return prevState;

  const result = { ...prevState };

  // stonebound.locations
  const prevStone = prevState.stonebound;
  const currStone = currentState.stonebound;
  if (prevStone || currStone) {
    const locations = appendUndoArrayTombstones(
      prevStone?.locations,
      currStone?.locations,
    );
    if (locations !== (prevStone?.locations ?? [])) {
      result.stonebound = { ...prevStone, locations };
    }
  }

  // stash map: pin every key added since prevState back to 0.
  const prevStash = prevState.stash ?? {};
  const currStash = currentState.stash ?? {};
  const addedStashKeys = Object.keys(currStash).filter(k => !(k in prevStash));
  if (addedStashKeys.length) {
    result.stash = { ...prevStash };
    for (const k of addedStashKeys) result.stash[k] = 0;
  }

  // campaign id-keyed arrays
  const prevCamp = prevState.campaign;
  const currCamp = currentState.campaign;
  if (prevCamp && currCamp) {
    const campaign = { ...prevCamp };
    let campChanged = false;

    for (const key of ['plans', 'completedEncounters', 'completedBounties', 'completedPuzzleQuests']) {
      const merged = appendUndoArrayTombstones(prevCamp[key], currCamp[key]);
      if (merged !== (prevCamp[key] ?? [])) {
        campaign[key] = merged;
        campChanged = true;
      }
    }

    const prevLocs = prevCamp.locations;
    const currLocs = currCamp.locations;
    if (prevLocs || currLocs) {
      const locations = { ...prevLocs };
      let locsChanged = false;
      for (const key of ['sideQuests']) {
        const merged = appendUndoArrayTombstones(prevLocs?.[key], currLocs?.[key]);
        if (merged !== (prevLocs?.[key] ?? [])) {
          locations[key] = merged;
          locsChanged = true;
        }
      }
      if (locsChanged) {
        campaign.locations = locations;
        campChanged = true;
      }
    }

    if (campChanged) result.campaign = campaign;
  }

  return result;
}

// ─── Section shape healing (AVE-873) ─────────────────────────────────────────
//
// Every path that loads state from localStorage runs healState, which clamps
// numbers, rebuilds satchels, and forces each container to its expected type.
// Every path that loads state from Supabase — joinCampaign, the Realtime UPDATE
// handler, and refetchRow — used to apply the raw JSONB straight into React
// state via applyRemoteSection. The consuming components dereference these
// fields without guards precisely because healState guarantees them locally, so
// a malformed section (a campaign missing `plans`, a guard missing `equipment`)
// threw on render, dropped the tab into its ErrorBoundary, and — because the bad
// value was then persisted by the 400ms save effect — survived the reload the
// fallback offers.
//
// These are the same healers healState uses, keyed by the section payload shape
// that extractSection produces. Two invariants matter:
//
//   1. Healing a HEALTHY section must be a deep-equal no-op. applyRemoteRow's
//      echo suppression compares `deepEqual(incoming, extractSection(local))`,
//      so a healer that added or renamed a key would make every echo look like
//      a genuine remote change.
//   2. These do shape/type repair only — never the cross-section load-time
//      migrations (legacy puzzle-quest / bounty flags), which need `cities` and
//      `campaign` together and belong to healState alone.

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function healNumber(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function healString(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

/** Clamp a campaign id to the four real campaigns. */
export function healCampaignId(v) {
  return Math.min(4, Math.max(1, Math.trunc(Number(v)) || 1));
}

export function healGuard(raw) {
  const fresh = createInitialGuards().guards[0];
  if (!isPlainObject(raw)) return fresh;
  const healedMaxHp = Math.max(1, healNumber(raw.maxHp, fresh.maxHp));
  return {
    ...fresh,
    ...raw,
    name:              healString(raw.name, fresh.name),
    hp:                Math.min(Math.max(0, healNumber(raw.hp, fresh.hp)), healedMaxHp),
    maxHp:             healedMaxHp,
    baseAtk:           Math.max(0, Math.trunc(healNumber(raw.baseAtk, fresh.baseAtk))),
    baseDef:           Math.max(0, Math.trunc(healNumber(raw.baseDef, fresh.baseDef))),
    expandedSatchel:   !!raw.expandedSatchel,
    satchel:           Array.isArray(raw.satchel)
                         ? Array.from({ length: SATCHEL_EXPANDED_SIZE }, (_, k) => {
                             const s = raw.satchel[k];
                             if (!isPlainObject(s)) return { item: '', qty: 1 };
                             const item = healString(s.item);
                             const qty  = item
                               ? Math.min(Math.max(1, Math.trunc(healNumber(s.qty, 1))), satchelStackLimit(item))
                               : 1;
                             return { item, qty };
                           })
                         : fresh.satchel,
    equipment:         isPlainObject(raw.equipment)
                         ? { weapon:    healString(raw.equipment.weapon),
                             armor:     healString(raw.equipment.armor),
                             accessory: healString(raw.equipment.accessory),
                             item:      healString(raw.equipment.item) }
                         : fresh.equipment,
  };
}

/** `{ sil, lux }` */
export function healResourcesSection(v) {
  const s = isPlainObject(v) ? v : {};
  return {
    sil: Math.max(0, Math.trunc(Number(s.sil) || 0)),
    lux: Math.max(0, Math.trunc(Number(s.lux) || 0)),
  };
}

/** `{ cities }` */
export function healCitiesSection(v) {
  const init = createInitialCities();
  const raw  = isPlainObject(v) ? v.cities : null;
  if (!Array.isArray(raw) || raw.length === 0) return init;
  return {
    cities: raw.map(c => isPlainObject(c)
      ? { ...init.cities[0], ...c, name: healString(c.name, init.cities[0].name) }
      : init.cities[0]),
  };
}

/** `{ activeParty }` — exactly two names, or the default pairing. */
export function healPartySection(v) {
  const init = createInitialGuards();
  const raw  = isPlainObject(v) ? v.activeParty : null;
  return {
    activeParty: Array.isArray(raw) && raw.length === 2
      ? raw.map(n => healString(n))
      : init.activeParty,
  };
}

/** `{ stash, stonebound }` */
export function healStashSection(v) {
  const init = createInitialStash();
  const s    = isPlainObject(v) ? v : {};
  return {
    stash: isPlainObject(s.stash)
      ? Object.fromEntries(
          Object.entries(s.stash)
            .filter(([k]) => typeof k === 'string' && k.length > 0)
            .map(([k, n]) => [k, Math.max(0, Math.trunc(Number(n) || 0))])
        )
      : init.stash,
    stonebound: isPlainObject(s.stonebound)
      ? { max: Math.max(0, healNumber(s.stonebound.max, init.stonebound.max)),
          locations: Array.isArray(s.stonebound.locations)
            ? s.stonebound.locations
                .filter(isPlainObject)
                .filter(loc => typeof loc.id === 'string' || typeof loc.id === 'number')
                // `type` is dropped, not healed — see AVE-874.
                // eslint-disable-next-line no-unused-vars
                .map(({ type, ...loc }) => ({
                  ...loc,
                  selection: healString(loc.selection, ''),
                  count:     Math.max(0, Math.trunc(Number(loc.count) || 1)),
                }))
            : [] }
      : init.stonebound,
  };
}

/**
 * `{ campaign }` — shape/type repair only. The legacy puzzle-quest and bounty
 * flag migrations are deliberately NOT applied here: they need `cities` and
 * `campaign` together and are load-time-only, so healState layers them on top.
 */
export function healCampaignSection(v) {
  const init = createInitialCampaign();
  const raw  = isPlainObject(v) ? v.campaign : null;
  if (!isPlainObject(raw)) return init;
  return {
    campaign: {
      ...init.campaign,
      ...raw,
      campaignId:  healCampaignId(raw.campaignId),
      eventTokens: isPlainObject(raw.eventTokens)
        ? { mountain: healNumber(raw.eventTokens.mountain, 0),
            forest:   healNumber(raw.eventTokens.forest, 0),
            plains:   healNumber(raw.eventTokens.plains, 0),
            sea:      healNumber(raw.eventTokens.sea, 0) }
        : init.campaign.eventTokens,
      locations: isPlainObject(raw.locations)
        // `bounties` is the AVE-795 orphan — dropped, never healed.
        // eslint-disable-next-line no-unused-vars
        ? (({ bounties, ...rest }) => rest)(raw.locations)
        : init.campaign.locations,
      plans: Array.isArray(raw.plans) ? raw.plans.filter(isPlainObject) : [],
      ftIstraBuildings: isPlainObject(raw.ftIstraBuildings) ? raw.ftIstraBuildings : {},
      completedEncounters:   normalizeCompletedEncounters(raw.completedEncounters),
      completedBounties:     normalizeCompletedEncounters(raw.completedBounties),
      completedPuzzleQuests: normalizeCompletedEncounters(raw.completedPuzzleQuests),
    },
  };
}

/**
 * Heal one section payload arriving from Supabase, keyed by section name.
 * Called by applyRemoteSection — the single choke point shared by joinCampaign,
 * the Realtime UPDATE handler, and refetchRow.
 *
 * Runs AFTER the timestamp/echo gates in applyRemoteRow, never before: those
 * gates compare the raw incoming value against extractSection(local), and
 * rewriting objects earlier would break the deepEqual matching that AVE-314's
 * echo suppression depends on.
 */
export function healRemoteSection(sectionName, value) {
  if (/^guard_\d+$/.test(sectionName)) return healGuard(value);
  switch (sectionName) {
    case 'resources': return healResourcesSection(value);
    case 'cities':    return healCitiesSection(value);
    case 'party':     return healPartySection(value);
    case 'stash':     return healStashSection(value);
    case 'campaign':  return healCampaignSection(value);
    default:          return value;
  }
}
