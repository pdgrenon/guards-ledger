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

import { SATCHEL_EXPANDED_SIZE } from '../data/constants';
import { ALL_MATERIALS, WEAPONS, ARMOR, ACCESSORIES, ITEMS } from '../data/materials';
import { bountiesForCity } from '../data/bounties';

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
    ? s.guards.findIndex(g => g.name === newParty[0])
    : s.activeGuardIdx;

  return { ...s, activeParty: newParty, activeGuardIdx: newActiveGuardIdx };
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
    const satchel = full.map((slot, si) =>
      si === slotIdx ? { ...slot, [field]: value } : slot
    );
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
// bounties (AVE-359). Bounty completion is campaign-scoped — each id in
// `completedBounties` encodes its campaign — so moving to another campaign and
// back preserves each campaign's reputation independently (max 3: 1 puzzle + 2
// bounties). `campaignId`/`completedBounties` are optional so the puzzle-only
// contribution is still derivable without campaign context.
export function cityPrestige(city, campaignId, completedBounties) {
  const puzzle = city.puzzleQuestDone ? 1 : 0;
  const bounties = bountiesForCity(city.name, campaignId)
    .filter(b => isBountyCompleted(completedBounties, b.id)).length;
  return puzzle + bounties;
}

export function reduceToggleCityQuest(s, cityIdx, field) {
  const city   = s.cities[cityIdx];
  const newVal = !city[field];
  const cities = s.cities.map((c, i) => i === cityIdx ? { ...c, [field]: newVal } : c);
  const questLabel =
    field === 'puzzleQuestDone' ? 'puzzle quest' :
    field === 'bounty1Done'     ? 'bounty 1'     :
                                  'bounty 2';
  return addLog({ ...s, cities },
    `${city.name} ${questLabel} ${newVal ? 'completed' : 'reopened'}`
  );
}

// ─── Stash ────────────────────────────────────────────────────────────────────

export function reduceAdjustStash(s, itemName, delta) {
  const current = s.stash[itemName] ?? 0;
  const newVal  = Math.max(0, current + delta);
  const stash   = { ...s.stash, [itemName]: newVal };
  if (newVal === 0) delete stash[itemName];
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

export function reduceAddStoneboundLocation(s) {
  const id        = Date.now() + Math.random();
  const locations = [...s.stonebound.locations, { id, type: '', selection: '', count: 1 }];
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
  const locations = s.stonebound.locations.map(loc =>
    loc.id === id ? { ...loc, [field]: value } : loc
  );
  const newState = { ...s, stonebound: { ...s.stonebound, locations } };
  const loc      = s.stonebound.locations.find(l => l.id === id);

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
// other field edit; re-completing clears the flag. This mirrors how the other
// id-keyed arrays (plans, side quests, stonebound locations) tombstone deletes.
export function isEncounterCompleted(completedEncounters, id) {
  return (completedEncounters ?? []).some(e => e.id === id && !e.deleted);
}

/**
 * Normalize a completedEncounters value to the id-keyed { id, deleted? } shape.
 * Pre-AVE-287 saves stored a plain array of encounter-id strings; this converts
 * those (and tolerates already-normalized rows) so the client can read either
 * shape. Used on load/migration and when reading a possibly-unmigrated remote row.
 */
export function normalizeCompletedEncounters(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const e of arr) {
    if (typeof e === 'string') {
      out.push({ id: e });
    } else if (e && typeof e === 'object' && typeof e.id === 'string') {
      out.push(e.deleted ? { id: e.id, deleted: true } : { id: e.id });
    }
  }
  return out;
}

export function reduceToggleEncounterComplete(s, encounterId) {
  const completed = s.campaign.completedEncounters ?? [];
  const existing  = completed.find(e => e.id === encounterId);
  let next;
  if (existing) {
    // Present already: flip its tombstone. Completed → mark deleted; previously
    // un-completed → clear the flag by re-adding it as a live element.
    const isCompleted = !existing.deleted;
    next = completed.map(e =>
      e.id === encounterId ? (isCompleted ? { id: e.id, deleted: true } : { id: e.id }) : e
    );
  } else {
    next = [...completed, { id: encounterId }];
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
// rather than dropping the element; re-completing clears the flag.
export function isBountyCompleted(completedBounties, id) {
  return (completedBounties ?? []).some(b => b.id === id && !b.deleted);
}

export function reduceToggleBountyComplete(s, bountyId) {
  const completed = s.campaign.completedBounties ?? [];
  const existing  = completed.find(b => b.id === bountyId);
  let next;
  if (existing) {
    const isCompleted = !existing.deleted;
    next = completed.map(b =>
      b.id === bountyId ? (isCompleted ? { id: b.id, deleted: true } : { id: b.id }) : b
    );
  } else {
    next = [...completed, { id: bountyId }];
  }
  return { ...s, campaign: { ...s.campaign, completedBounties: next } };
}
