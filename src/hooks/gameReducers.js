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
import { BOUNTIES, bountiesForCity } from '../data/bounties';
import { PUZZLE_QUESTS, puzzleQuestForCity } from '../data/puzzleQuests';
import { TRAINING_YARD_FIGHTS, SPIRIT_BOSSES } from '../data/encounters';
import { BUILDING_STATES, BUILDING_STATE_LABELS } from '../data/buildings';

export const ALL_EQUIPMENT     = new Set([...WEAPONS, ...ARMOR, ...ACCESSORIES, ...ITEMS]);
export const ALL_MATERIALS_SET = new Set(ALL_MATERIALS);

// ─── Logging ─────────────────────────────────────────────────────────────────

// `log` is defaulted rather than assumed: healState guarantees it on real
// state, but a reducer should not throw on a state that happens to be missing a
// local-only key (partial fixtures, a hand-edited save). Now that most actions
// log (AVE-940), a crash here would take down a mutation, not just a log line.
export function addLog(state, message) {
  const now   = new Date();
  const time  = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const entry = { time, message, id: Date.now() + Math.random() };
  return { ...state, log: [entry, ...(state.log ?? [])].slice(0, 100) };
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

// ─── Log name resolution (AVE-940) ───────────────────────────────────────────
//
// The completion reducers receive only an id. `mir-c1-the-clayhorn-poachers` is
// not a session record, so each resolves to a human label through the static
// data modules. Every resolver falls back to the raw id rather than producing
// "undefined" — an id from a hand-edited save or a future campaign must still
// yield a readable entry.

function encounterLabel(id) {
  const e = [...TRAINING_YARD_FIGHTS, ...SPIRIT_BOSSES].find(x => x.id === id);
  return e?.name ?? id;
}

function bountyLabel(id) {
  const b = BOUNTIES.find(x => x.id === id);
  return b ? `${b.city}: ${b.name}` : id;
}

function puzzleQuestLabel(id) {
  // Puzzle quests have no name of their own — one per city per campaign — so
  // the city is the identifying label.
  const q = PUZZLE_QUESTS.find(x => x.id === id);
  return q?.city ?? id;
}

// mainQuest -> "Main Quest"
function locationKeyLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
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

  // Starts with "Party", which is in PARTY_TERMS — so MoreTab's classifyEntry
  // gives it the party border and colorizeLogMessage tints the guard's name,
  // matching the existing "Party Sil …" entries (AVE-940).
  return addLog(
    { ...s, activeParty: newParty, activeGuardIdx: newActiveGuardIdx },
    `Party guard ${slotIdx + 1} → ${name}`
  );
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

// The clamping reducers below each bail out when the clamp swallows the delta
// entirely. Returning a new state for a change that did not happen defeats
// setState's no-op guard (which compares next === prev), so a "−" tap on Sil 0
// or a "+" tap at full HP wrote a false log line, discarded the player's real
// pending undo, and dispatched a sync write. None of these controls are
// disabled at their limits, so it is reachable by simply tapping twice.

export function reduceSetSil(s, delta) {
  const newVal = Math.max(0, s.sil + delta);
  if (newVal === s.sil) return s;
  return addLog({ ...s, sil: newVal },
    `Party Sil ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

export function reduceSetLux(s, delta) {
  const newVal = Math.max(0, s.lux + delta);
  if (newVal === s.lux) return s;
  return addLog({ ...s, lux: newVal },
    `Party Lux ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

// ─── Guard HP ─────────────────────────────────────────────────────────────────

export function reduceAdjustGuardHp(s, guardIdx, delta) {
  const g     = s.guards[guardIdx];
  const newHp = Math.min(g.maxHp, Math.max(0, g.hp + delta));
  if (newHp === g.hp) return s;
  const guards = s.guards.map((g2, i) => i === guardIdx ? { ...g2, hp: newHp } : g2);
  return addLog({ ...s, guards }, `${g.name} HP ${delta >= 0 ? '+' : ''}${delta} → ${newHp}`);
}

export function reduceAdjustGuardMaxHp(s, guardIdx, delta) {
  const g      = s.guards[guardIdx];
  const newMax = Math.max(1, g.maxHp + delta);
  const newHp  = Math.min(g.hp, newMax);
  if (newMax === g.maxHp && newHp === g.hp) return s;
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
  let changed  = false;
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
      if (field === 'item' && !value) {
        // Clearing a slot must reset its quantity too. `healGuard` already
        // forces `qty: 1` on any slot with an empty item, so leaving the old
        // count behind produces a state the healer does not consider healthy —
        // and healing a healthy section has to be a deep-equal no-op, because
        // applyRemoteRow's echo suppression compares the raw incoming value
        // against `extractSection(local)` (AVE-873 / AVE-922). Clearing a
        // 4-stack left `{ item: '', qty: 4 }` in the campaign row while the
        // next local load healed to `{ item: '', qty: 1 }`, so that guard's
        // section differed from the server forever: every boot/foreground
        // refetchRow saw a "change", applied it (wiping the undo snapshot and
        // forcing a re-render), and healed it straight back to 1.
        updated.qty = 1;
      }
      if (field === 'qty') {
        updated.qty = Math.min(Math.max(1, Math.trunc(updated.qty)), satchelStackLimit(slot.item || ''));
      }
      // A write that resolves to the slot's existing value is not a change.
      // Reached by tapping "+" at the stack cap (the caller already clamps, so
      // it re-sends the current qty) and by re-selecting the item already in
      // the slot. Without this the reducer returns a fresh object either way,
      // which defeats setState's no-op guard: a bogus log line, the player's
      // pending undo replaced by a snapshot of the state they were already in,
      // and a sync write for a section nothing changed in.
      if (updated.item === slot.item && updated.qty === slot.qty) return slot;
      changed = true;
      return updated;
    });
    return { ...gi, satchel };
  });
  // Bail out only when the satchel was already full length — otherwise the
  // padding `full` performs above is itself a real (healing) change.
  if (!changed && (g.satchel?.length ?? 0) === SATCHEL_EXPANDED_SIZE) return s;
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

// Expanding/collapsing the satchel was the last action still written as an
// inline updater in useGameState — the shape AVE-925 missed reduceSetFtIstraBuilding
// in, and the one mutating action that produced no log entry at all after
// AVE-940 made every other one log. It syncs to a guard column like any other
// guard edit, so the session log recorded the items going in and out of the
// hidden slots but never the toggle that hid them, and Undo could only offer
// deriveUndoLabel's generic "<Guard> update" fallback.
//
// The message starts with the guard's name, so classifyEntry gives it the guard
// border and colorizeLogMessage tints the name, matching the other guard entries.
export function reduceToggleExpandedSatchel(s, guardIdx) {
  const g = s.guards[guardIdx];
  if (!g) return s;
  const expanded = !g.expandedSatchel;
  const guards   = s.guards.map((g2, i) => i === guardIdx ? { ...g2, expandedSatchel: expanded } : g2);
  return addLog(
    { ...s, guards },
    `${g.name} satchel ${expanded ? 'expanded' : 'collapsed'}`
  );
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
  // A clamp that swallows the delta changes nothing, so don't spend the
  // player's pending undo on it. This also subsumes the old "don't materialize
  // a tombstone for an item that was never in the stash" guard: an absent key
  // reads as current 0, so any clamped result equals `current` and returns here
  // before a key could be created.
  if (newVal === current) return s;
  const stash = { ...s.stash, [itemName]: newVal };
  return addLog({ ...s, stash },
    `Stash ${itemName} ${delta >= 0 ? '+' : ''}${delta} → ${newVal}`
  );
}

// ─── Stonebound ───────────────────────────────────────────────────────────────

export function reduceSetStoneboundMax(s, delta) {
  const newMax = Math.max(0, s.stonebound.max + delta);
  if (newMax === s.stonebound.max) return s;
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
  if (next === current) return s;
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
  // No-op guard: DraftInput re-commits on blur, and a write that changes
  // nothing would spam the log, destroy the undo snapshot, and fire a sync
  // write — the AVE-536 failure mode, now that this path logs.
  if ((s.campaign.locations?.[key] ?? '') === (value ?? '')) return s;
  const locations = { ...s.campaign.locations, [key]: value };
  const campaign  = { ...s.campaign, locations };
  const label     = locationKeyLabel(key);
  return addLog({ ...s, campaign }, value
    ? `Campaign ${label} → ${value}`
    : `Campaign ${label} cleared`);
}

export function reduceAddDynamicLocation(s, type) {
  const id        = Date.now() + Math.random();
  const entries   = [...(s.campaign.locations[type] ?? []), { id, label: '' }];
  const locations = { ...s.campaign.locations, [type]: entries };
  const campaign  = { ...s.campaign, locations };
  return addLog({ ...s, campaign }, 'Campaign side quest added');
}

export function reduceUpdateDynamicLocation(s, type, id, label) {
  const existing = (s.campaign.locations[type] ?? []).find(e => e.id === id);
  if (existing && (existing.label ?? '') === (label ?? '')) return s;  // no-op (AVE-536)
  const entries   = (s.campaign.locations[type] ?? []).map(e =>
    e.id === id ? { ...e, label } : e
  );
  const locations = { ...s.campaign.locations, [type]: entries };
  const campaign  = { ...s.campaign, locations };
  return addLog({ ...s, campaign }, label
    ? `Campaign side quest → ${label}`
    : 'Campaign side quest cleared');
}

// Tombstone rather than hard-remove so the delete survives the server merge
// and Realtime echo while a campaign is active (AVE-287). Read sites filter out
// `deleted` entries.
export function reduceRemoveDynamicLocation(s, type, id) {
  const removed   = (s.campaign.locations[type] ?? []).find(e => e.id === id);
  const entries   = (s.campaign.locations[type] ?? []).map(e =>
    e.id === id ? { ...e, deleted: true } : e
  );
  const locations = { ...s.campaign.locations, [type]: entries };
  const campaign  = { ...s.campaign, locations };
  return addLog(
    { ...s, campaign },
    `Campaign side quest removed — ${removed?.label || 'empty'}`
  );
}

export function reduceAddPlan(s, text) {
  if (!text.trim()) return s;
  const id       = Date.now() + Math.random();
  const plan     = { id, text: text.trim(), done: false };
  const campaign = { ...s.campaign, plans: [...s.campaign.plans, plan] };
  return addLog({ ...s, campaign }, `Campaign plan added — "${plan.text}"`);
}

export function reduceTogglePlan(s, id) {
  const plan     = s.campaign.plans.find(p => p.id === id);
  const plans    = s.campaign.plans.map(p => p.id === id ? { ...p, done: !p.done } : p);
  const campaign = { ...s.campaign, plans };
  const nowDone  = !plan?.done;
  return addLog(
    { ...s, campaign },
    `Campaign plan ${nowDone ? 'done' : 'reopened'} — "${plan?.text ?? id}"`
  );
}

// Tombstone rather than hard-remove so the delete survives the server merge and
// Realtime echo while a campaign is active (AVE-287). Read sites filter out
// `deleted` plans.
export function reduceDeletePlan(s, id) {
  const plan     = s.campaign.plans.find(p => p.id === id);
  const plans    = s.campaign.plans.map(p =>
    p.id === id ? { ...p, deleted: true } : p
  );
  const campaign = { ...s.campaign, plans };
  return addLog({ ...s, campaign }, `Campaign plan deleted — "${plan?.text ?? id}"`);
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
  const nowComplete = isEncounterCompleted(next, encounterId);
  return addLog(
    { ...s, campaign: { ...s.campaign, completedEncounters: next } },
    `Campaign encounter ${nowComplete ? 'completed' : 'un-completed'} — ${encounterLabel(encounterId)}`
  );
}

export function reduceSetCampaign(s, campaignId) {
  if (s.campaign.campaignId === campaignId) return s;   // no-op (AVE-536)
  const campaign = { ...s.campaign, campaignId };
  return addLog({ ...s, campaign }, `Campaign → Campaign ${campaignId}`);
}

// Fort Istra buildings were the one action still living as an inline updater in
// useGameState — which is exactly why AVE-925 missed them. Extracted here so
// they are unit-tested like every other action. The state shape is unchanged:
// ftIstraBuildings is a growable map whose undo path depends on it.
export function reduceSetFtIstraBuilding(s, buildingName, buildingState) {
  const current = s.campaign.ftIstraBuildings?.[buildingName] ?? 'not_owned';
  if (current === buildingState) return s;               // no-op (AVE-536)
  const campaign = {
    ...s.campaign,
    ftIstraBuildings: { ...s.campaign.ftIstraBuildings, [buildingName]: buildingState },
  };
  const label = BUILDING_STATE_LABELS[BUILDING_STATES.indexOf(buildingState)] ?? buildingState;
  return addLog({ ...s, campaign }, `Campaign ${buildingName} → ${label}`);
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
  const nowComplete = isPuzzleQuestCompleted(next, puzzleQuestId);
  return addLog(
    { ...s, campaign: { ...s.campaign, completedPuzzleQuests: next } },
    `Campaign puzzle quest ${nowComplete ? 'completed' : 'un-completed'} — ${puzzleQuestLabel(puzzleQuestId)}`
  );
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
  const nowComplete = isBountyCompleted(next, bountyId);
  return addLog(
    { ...s, campaign: { ...s.campaign, completedBounties: next } },
    `Campaign bounty ${nowComplete ? 'completed' : 'un-completed'} — ${bountyLabel(bountyId)}`
  );
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

// Reconcile `prev` (the undo snapshot) against `curr` (current state) in BOTH
// directions. Both default to [] so a missing array on either side is handled.
//
//   undo of an ADD    — id in curr, not in prev → append { id, deleted: true }
//   undo of a DELETE  — id in both, tombstoned in curr but live in prev
//                       → send { ...prevEl, deleted: false }
//
// The second direction is not optional. Passing the snapshot element through
// unchanged looks correct locally, but it carries no `deleted` key at all, and
// the server merge preserves keys the payload omits — so the row stays
// `deleted: true` on the server and the write's own Realtime echo re-deletes it
// about a second later, with the undo snapshot already cleared. That is exactly
// the revert loop documented for the completion reducers, which is why all
// three of them emit an explicit `deleted: false` on complete rather than a
// bare { id }. The undo path needs the same discipline.
//
// An element whose snapshot value already carries an explicit `deleted` key is
// left alone: it already states its own truth, so rewriting it would only cost
// the identity contract below.
//
// Returns the `prev` reference unchanged when nothing needed negating or
// reviving — callers use `!==` to decide whether anything changed.
function appendUndoArrayTombstones(prev, curr) {
  const prevArr = prev ?? [];
  const currArr = curr ?? [];
  const prevIds = new Set(prevArr.map(e => e?.id));
  const currById = new Map(
    currArr.filter(e => e && 'id' in e).map(e => [e.id, e]),
  );

  let revived = false;
  const restored = prevArr.map(e => {
    if (!e || !('id' in e) || e.deleted !== undefined) return e;
    if (currById.get(e.id)?.deleted !== true) return e;
    revived = true;
    return { ...e, deleted: false };
  });

  const tombstones = currArr
    .filter(e => e && 'id' in e && !prevIds.has(e.id))
    .map(e => ({ id: e.id, deleted: true }));

  if (!revived && !tombstones.length) return prevArr;
  return [...restored, ...tombstones];
}

// Pin every key present in `curr` but absent from `prev` to `neutral` — the
// map equivalent of an array tombstone. The server's deep merge preserves keys
// the payload omits, so an undo that simply drops a key leaves it on the server
// and the write's own Realtime echo resurrects it (AVE-523). `neutral` must be
// a value every read site already treats as "absent": 0 for stash counts
// (AVE-369), 'not_owned' for ftIstraBuildings (AVE-925).
//
// Returns the `prev` reference unchanged when nothing was added, matching
// appendUndoArrayTombstones' identity contract — callers use `!==` to decide
// whether anything changed.
function withUndoMapTombstones(prev, curr, neutral) {
  const prevMap = prev ?? {};
  const currMap = curr ?? {};
  const added = Object.keys(currMap).filter(k => !(k in prevMap));
  if (!added.length) return prevMap;
  const out = { ...prevMap };
  for (const k of added) out[k] = neutral;
  return out;
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
  const stash = withUndoMapTombstones(prevState.stash, currentState.stash, 0);
  if (stash !== (prevState.stash ?? {})) result.stash = stash;

  // campaign id-keyed arrays + the ftIstraBuildings map
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

    // ftIstraBuildings is a growable map like stash, not a scalar: the first
    // state change to a building ADDS a key, so undoing it must negate the key
    // rather than omit it — otherwise the server merge keeps the building and
    // the write's own echo flips the card back (AVE-925). 'not_owned' is the
    // neutral value both read sites already fall back to (CampaignTab's
    // BuildingCard / FtIstraBuildingsCard).
    const ftIstra = withUndoMapTombstones(
      prevCamp.ftIstraBuildings, currCamp.ftIstraBuildings, 'not_owned',
    );
    if (ftIstra !== (prevCamp.ftIstraBuildings ?? {})) {
      campaign.ftIstraBuildings = ftIstra;
      campChanged = true;
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

/**
 * Clamp an event-token count to the 0–3 range the rest of the app assumes.
 *
 * `reduceSetEventToken` clamps to 0–3 and `EventTokensCard` renders exactly
 * three pips, treats `>= 3` as triggered, and disables `−` at `count === 0`.
 * A bare `healNumber` accepted any finite value, so a damaged save or an
 * unmigrated remote row carrying `mountain: 99` rendered a permanently
 * triggered region whose only control is "Resolve event" — and a negative
 * value rendered zero pips with the decrement button still enabled. Every
 * neighbouring healer clamps (healCampaignId, healGuard's hp/maxHp,
 * healStashSection's counts); this was the one that didn't.
 */
export function healEventToken(v) {
  return Math.min(3, Math.max(0, Math.trunc(healNumber(v, 0))));
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
                // `type` is retired (AVE-874). Drop it — but only when the
                // input never had it. Silently dropping a value that IS there
                // leaves it on the server forever (the deep merge preserves
                // keys absent from a payload), which then makes every Realtime
                // echo of our own write look like a genuine remote change and
                // permanently defeats echo suppression (AVE-922). Carrying an
                // explicit `type: null` through means our next write clears the
                // stored key, after which the echo deep-equals local again.
                .map(({ type, ...loc }) => ({
                  ...loc,
                  ...(type === undefined ? {} : { type: null }),
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
        ? { mountain: healEventToken(raw.eventTokens.mountain),
            forest:   healEventToken(raw.eventTokens.forest),
            plains:   healEventToken(raw.eventTokens.plains),
            sea:      healEventToken(raw.eventTokens.sea) }
        : init.campaign.eventTokens,
      locations: isPlainObject(raw.locations)
        // `bounties` is the AVE-795 orphan. Same reasoning as the stonebound
        // `type` drop in healStashSection: negate it explicitly when it is
        // present, so the next write clears it on the server instead of
        // leaving a key that permanently defeats echo suppression (AVE-922).
        ? (({ bounties, ...rest }) =>
            bounties === undefined ? rest : { ...rest, bounties: null })(raw.locations)
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
