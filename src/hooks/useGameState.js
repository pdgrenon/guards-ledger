import demoSave from '../data/demoSave.json';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createInitialState,
  createInitialResources,
  createInitialCities,
  createInitialGuards,
  createInitialStash,
  createInitialCampaign,
  SATCHEL_EXPANDED_SIZE,
} from '../data/constants';
import { CAMPAIGN_ID_KEY } from './useSupabaseSync';
import {
  addLog,
  compactTombstones,
  deriveUndoLabel,
  reduceSetPartySlot,
  reduceSetSil,
  reduceSetLux,
  reduceAdjustGuardHp,
  reduceAdjustGuardMaxHp,
  reduceSetGuardEquipment,
  reduceSetGuardSatchelItem,

  reduceAdjustStash,
  reduceSetStoneboundMax,
  reduceAddStoneboundLocation,
  reduceRemoveStoneboundLocation,
  reduceUpdateStoneboundLocation,
  reduceSetEventToken,
  reduceResetEventToken,
  reduceSetCampaignLocation,
  reduceAddDynamicLocation,
  reduceUpdateDynamicLocation,
  reduceRemoveDynamicLocation,
  reduceAddPlan,
  reduceTogglePlan,
  reduceDeletePlan,
  reduceToggleEncounterComplete,
  reduceToggleBountyComplete,
  reduceTogglePuzzleQuestComplete,
  reduceSetCampaign,
  normalizeCompletedEncounters,
  withUndoTombstones,
} from './gameReducers';
import { PUZZLE_QUESTS, puzzleQuestForCity } from '../data/puzzleQuests';
import { BOUNTIES, bountiesForCity } from '../data/bounties';
import { satchelStackLimit } from '../data/materials';
import { useSupabaseSync, guardColumn, applyRemoteSection } from './useSupabaseSync';

// v2: state is split into sync sections (resources, cities, guards, stash, campaign).
// v1 saves (flat shape) are migrated automatically on first load.
const STORAGE_KEY             = 'guards_ledger_v2';
const STORAGE_KEY_V1          = 'guards_ledger_v1';
const CORRUPTED_BACKUP_KEY    = 'guards_ledger_corrupted_backup';

// Puzzle quest completion used to be a single non-campaign-scoped boolean
// (`city.puzzleQuestDone`). Now that it's campaign-scoped like bounties (lives
// in `campaign.completedPuzzleQuests`), a save carrying the old flag is
// migrated by marking that city's puzzle quest complete for whatever campaign
// was active in that save.
//
// The migration must be strictly one-shot per city (AVE-370). It used to
// re-run on every load and re-add a live entry whenever the quest's entry was
// tombstoned — so un-completing a migrated quest resurrected it on reload —
// and re-fire under whatever campaign happened to be active, leaking
// completion into other campaigns. Two guards enforce one-shot now:
//   1. `puzzleQuestDone` is CLEARED on the migrated city (it used to be left
//      in place), so a persisted save never re-triggers.
//   2. Even if the flag reappears (e.g. a legacy `cities` value arriving from
//      an unmigrated remote row on join), a city is skipped when ANY
//      completedPuzzleQuests entry for it exists — live or tombstoned, any
//      campaign — since that proves the flag was already migrated or the
//      user is already tracking the city in the new system.
//
// Returns { cities, completedPuzzleQuests }.
function migrateLegacyPuzzleQuestDone(cities, campaignId, existing) {
  const normalized = normalizeCompletedEncounters(existing);
  const allIds = new Set(normalized.map(q => q.id));
  const additions = [];
  let migrated = false;
  const outCities = (cities ?? []).map(city => {
    if (!city?.puzzleQuestDone) return city;
    migrated = true;
    const alreadyTracked = PUZZLE_QUESTS.some(q => q.city === city.name && allIds.has(q.id));
    if (!alreadyTracked) {
      const quest = puzzleQuestForCity(city.name, campaignId);
      if (quest) additions.push({ id: quest.id });
    }
    return { ...city, puzzleQuestDone: false };
  });
  return {
    cities: migrated ? outCities : (cities ?? []),
    completedPuzzleQuests: additions.length ? [...normalized, ...additions] : normalized,
  };
}

// Legacy bounty completion flags (bounty1Done/bounty2Done) were never migrated
// to campaign-scoped completedBounties — the same bug class as AVE-370 for
// puzzle quests. Mirror migrateLegacyPuzzleQuestDone exactly:
//   1. For each city with bounty1Done/bounty2Done true: look up the city's
//      bounties for the save's active campaign and append their ids.
//   2. One-shot guard: skip a city if ANY completedBounty entry for it already
//      exists (live or tombstoned, any campaign).
//   3. Clear the flags after converting so migration never re-runs.
//   4. Run through normalizeCompletedEncounters after appending (dedupe safety).
function migrateLegacyBountyDone(cities, campaignId, existing) {
  const normalized = normalizeCompletedEncounters(existing);
  const allIds = new Set(normalized.map(b => b.id));
  const additions = [];
  let migrated = false;
  const outCities = (cities ?? []).map(city => {
    if (!city?.bounty1Done && !city?.bounty2Done) return city;
    migrated = true;
    const alreadyTracked = BOUNTIES.some(b => b.city === city.name && allIds.has(b.id));
    if (!alreadyTracked) {
      const bounties = bountiesForCity(city.name, campaignId);
      if (city.bounty1Done && bounties[0]) additions.push({ id: bounties[0].id });
      if (city.bounty2Done && bounties[1]) additions.push({ id: bounties[1].id });
    }
    return { ...city, bounty1Done: false, bounty2Done: false };
  });
  return {
    cities: migrated ? outCities : (cities ?? []),
    completedBounties: additions.length
      ? normalizeCompletedEncounters([...normalized, ...additions])
      : normalized,
  };
}

// ─── Migration ────────────────────────────────────────────────────────────────

export function migrateV1(v1) {
  const rawCities = v1.cities ?? createInitialCities().cities;
  const campaignId = v1.campaign?.campaignId ?? 1;
  const pqMigrated = migrateLegacyPuzzleQuestDone(
    rawCities, campaignId, v1.campaign?.completedPuzzleQuests
  );
  const bountyMigrated = migrateLegacyBountyDone(
    pqMigrated.cities, campaignId, v1.campaign?.completedBounties
  );
  const guards      = v1.guards      ?? createInitialGuards().guards;
  const activeParty = v1.activeParty ?? createInitialGuards().activeParty;
  const firstGuardIdx = (() => {
    const idx = guards.findIndex(g => g.name === activeParty[0]);
    return idx >= 0 ? idx : 0;
  })();
  return {
    sil:            v1.sil            ?? 0,
    lux:            v1.lux            ?? 0,
    cities:         bountyMigrated.cities,
    guards,
    activeParty,
    // activeGuardIdx is local-only UI state — always reset, but derive from
    // the saved party so the first party guard is shown instead of index 0.
    activeGuardIdx: firstGuardIdx,
    stash:          v1.stash          ?? createInitialStash().stash,
    stonebound:     v1.stonebound     ?? createInitialStash().stonebound,
    // Normalize completedEncounters/completedBounties (string[] → { id }[]) so
    // pre-AVE-287 saves and imports get the tombstone-capable id-keyed shape
    // (AVE-287); completedBounties defaults to [] on saves predating AVE-359.
    campaign:       v1.campaign
                      ? { ...v1.campaign,
                          completedEncounters: normalizeCompletedEncounters(v1.campaign.completedEncounters),
                          completedBounties:   bountyMigrated.completedBounties,
                          completedPuzzleQuests: pqMigrated.completedPuzzleQuests }
                      : { ...createInitialCampaign().campaign,
                          completedPuzzleQuests: pqMigrated.completedPuzzleQuests,
                          completedBounties:     bountyMigrated.completedBounties },
    log:            v1.log            ?? [],
    settings:       v1.settings       ?? { initialized: true },
  };
}

// ─── Shape normalization ─────────────────────────────────────────────────────
//
// A save can parse as valid JSON but still be structurally incomplete — e.g. a
// guard object missing its `chips` or `satchel`, or state.guards not being an
// 8-element array. Loading such a state would crash at render time. Here we
// walk the parsed state and fill in any missing/typed fields from the section
// factories, preserving as much valid data as possible.

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function healNumber(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function healString(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function healGuard(raw) {
  const fresh = createInitialGuards().guards[0];
  if (!isPlainObject(raw)) return fresh;
  return {
    ...fresh,
    ...raw,
    name:              healString(raw.name, fresh.name),
    hp:                healNumber(raw.hp, fresh.hp),
    maxHp:             Math.max(1, healNumber(raw.maxHp, fresh.maxHp)),
    baseAtk:           healNumber(raw.baseAtk, fresh.baseAtk),
    baseDef:           healNumber(raw.baseDef, fresh.baseDef),
    expandedSatchel:   !!raw.expandedSatchel,
    satchel:           Array.isArray(raw.satchel)
                         ? Array.from({ length: SATCHEL_EXPANDED_SIZE }, (_, k) => {
                             const s = raw.satchel[k];
                             if (!isPlainObject(s)) return { item: '', qty: 1 };
                             const item = healString(s.item);
                             const qty  = item
                               ? Math.min(healNumber(s.qty, 1), satchelStackLimit(item))
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

export function healState(parsed) {
  if (!isPlainObject(parsed)) return null;

  const resInit    = createInitialResources();
  const citiesInit = createInitialCities();
  const guardsInit = createInitialGuards();
  const stashInit  = createInitialStash();
  const campInit   = createInitialCampaign();

  const guardsArr = Array.isArray(parsed.guards) ? parsed.guards : [];
  const guards = Array.from({ length: 8 }, (_, i) => healGuard(guardsArr[i]));

  const healedCities = Array.isArray(parsed.cities) && parsed.cities.length > 0
                    ? parsed.cities.map(c => isPlainObject(c)
                        ? { ...citiesInit.cities[0], ...c,
                            name: healString(c.name, citiesInit.cities[0].name) }
                        : citiesInit.cities[0])
                    : citiesInit.cities;
  const campaignId = isPlainObject(parsed.campaign) ? healNumber(parsed.campaign.campaignId, 1) : 1;
  const pqMigrated = migrateLegacyPuzzleQuestDone(
    healedCities, campaignId,
    isPlainObject(parsed.campaign) ? parsed.campaign.completedPuzzleQuests : null
  );
  const bountyMigrated = migrateLegacyBountyDone(
    pqMigrated.cities, campaignId,
    isPlainObject(parsed.campaign) ? parsed.campaign.completedBounties : null
  );

  const activeParty =
    Array.isArray(parsed.activeParty) && parsed.activeParty.length === 2
      ? parsed.activeParty.map(healString)
      : guardsInit.activeParty;

  const firstGuardIdx = (() => {
    const idx = guards.findIndex(g => g.name === activeParty[0]);
    return idx >= 0 ? idx : 0;
  })();

  return {
    sil:            healNumber(parsed.sil, resInit.sil),
    lux:            healNumber(parsed.lux, resInit.lux),
    cities:         bountyMigrated.cities,
    guards,
    activeParty,
    // activeGuardIdx is local UI nav — always reset, but derive from the
    // healed party so the first party guard is shown instead of index 0.
    activeGuardIdx: firstGuardIdx,
    stash:          isPlainObject(parsed.stash) ? parsed.stash : stashInit.stash,
    stonebound:     isPlainObject(parsed.stonebound)
                       ? { max: Math.max(0, healNumber(parsed.stonebound.max, stashInit.stonebound.max)),
                           locations: Array.isArray(parsed.stonebound.locations)
                             ? parsed.stonebound.locations.filter(isPlainObject)
                             : [] }
                       : stashInit.stonebound,
    campaign:       isPlainObject(parsed.campaign)
                       ? { ...campInit.campaign, ...parsed.campaign,
                           eventTokens: isPlainObject(parsed.campaign.eventTokens)
                             ? { mountain: healNumber(parsed.campaign.eventTokens.mountain, 0),
                                 forest:   healNumber(parsed.campaign.eventTokens.forest, 0),
                                 plains:   healNumber(parsed.campaign.eventTokens.plains, 0),
                                 sea:      healNumber(parsed.campaign.eventTokens.sea, 0) }
                             : campInit.campaign.eventTokens,
                           locations: isPlainObject(parsed.campaign.locations)
                             ? parsed.campaign.locations
                             : campInit.campaign.locations,
                            plans:     Array.isArray(parsed.campaign.plans)
                              ? parsed.campaign.plans.filter(isPlainObject)
                              : [],
                             ftIstraBuildings: isPlainObject(parsed.campaign.ftIstraBuildings)
                               ? parsed.campaign.ftIstraBuildings
                               : {},
                              completedEncounters: normalizeCompletedEncounters(parsed.campaign.completedEncounters),
                              completedBounties:   bountyMigrated.completedBounties,
                              completedPuzzleQuests: pqMigrated.completedPuzzleQuests }
                        : { ...campInit.campaign,
                            completedPuzzleQuests: pqMigrated.completedPuzzleQuests,
                            completedBounties:     bountyMigrated.completedBounties },
    log:            Array.isArray(parsed.log) ? parsed.log : [],
    settings:       isPlainObject(parsed.settings) ? parsed.settings : { initialized: true },
  };
}

// ─── Load + corruption handling ──────────────────────────────────────────────
//
// Returns the (possibly healed) state to boot the app with. If the saved data
// is unrecoverable, the corrupted raw string is written to
// `guards_ledger_corrupted_backup` and the returned object includes a
// `corruption` field so the UI can surface a banner.

function loadState() {
  // No save at all — first run, nothing to surface.
  const rawV2 = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  if (rawV2) {
    try {
      const parsed  = JSON.parse(rawV2);
      const healed  = healState(parsed);
      if (healed) return { state: healed, corruption: null };
    } catch {
      // Parse failure — unrecoverable, surface to user.
      backupCorruptedRaw(rawV2, 'parse-failure');
      return { state: createInitialState(), corruption: { reason: 'parse-failure', raw: rawV2 } };
    }
    // Parsed but healState returned null — unrecoverable shape.
    backupCorruptedRaw(rawV2, 'invalid-shape');
    return { state: createInitialState(), corruption: { reason: 'invalid-shape', raw: rawV2 } };
  }

  // No v2 save — try v1 migration.
  const rawV1 = (() => { try { return localStorage.getItem(STORAGE_KEY_V1); } catch { return null; } })();
  if (rawV1) {
    try {
      const migrated = healState(migrateV1(JSON.parse(rawV1)));
      if (migrated) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* ignore */ }
        return { state: migrated, corruption: null };
      }
    } catch {
      backupCorruptedRaw(rawV1, 'v1-parse-failure');
      return { state: createInitialState(), corruption: { reason: 'v1-parse-failure', raw: rawV1 } };
    }
    backupCorruptedRaw(rawV1, 'v1-invalid-shape');
    return { state: createInitialState(), corruption: { reason: 'v1-invalid-shape', raw: rawV1 } };
  }

  // First run, no save at all.
  return { state: migrateV1(demoSave), corruption: null };
}

function backupCorruptedRaw(raw, reason) {
  try {
    const payload = JSON.stringify({ reason, raw, backedUpAt: new Date().toISOString() });
    localStorage.setItem(CORRUPTED_BACKUP_KEY, payload);
  } catch {
    // If even the backup write fails (quota exhausted), the only thing we can
    // do is swallow — the corruption banner still surfaces the issue to the
    // user, they just won't be able to recover the raw string.
  }
}

// Returns { ok: true } on success, or { ok: false, error } when the write is
// rejected (quota exhausted, storage blocked/disabled). The caller surfaces the
// failure so a player never keeps editing under the false belief their progress
// is being saved.
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (e) {
    console.error('Failed to save state', e);
    return { ok: false, error: e };
  }
}

// ─── Remote section merge (AVE-518) ──────────────────────────────────────────
//
// Merges inbound remote sections (from a Realtime UPDATE, a join, or a
// refetchRow() pull) into local state, skipping any section that still has a
// local edit sitting unflushed in the debounce window (`pendingSections`,
// populated by setState below).
//
// The self-write echo buffer in useSupabaseSync (`noteSelfWrite` /
// `consumeSelfEcho`) only records a write once it is actually dispatched to
// Supabase, ~400ms after the optimistic local update. A remote section
// arriving inside that window — a genuine edit from another player, or the
// row refetchRow() re-pulls on boot/reconnect/foreground (AVE-372) — is
// invisible to that buffer and would otherwise be applied wholesale over the
// fresh local value, silently reverting it. This is exactly what made
// completing a bounty right after opening/resuming the app (when the
// foreground/boot refetch is still in flight) flip back to incomplete a
// moment later (AVE-518). Once the debounce flushes and the write is
// dispatched, the section leaves `pendingSections` and the existing
// timestamp/echo gating in useSupabaseSync takes over as usual.
export function mergeRemoteSections(prev, sectionsToApply, pendingSections) {
  let merged = prev;
  for (const [section, value] of Object.entries(sectionsToApply)) {
    if (pendingSections.has(section)) continue;
    merged = applyRemoteSection(merged, section, value);
  }
  return merged;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameState() {
    // loadState() does the full parse/heal/migrate pass — run it once on boot
    // and seed both pieces of state from the single result.
    // In solo mode (no active Supabase campaign), tombstones serve no purpose
    // — hard-drop them immediately so they don't accumulate (AVE-368).
    const [initial]           = useState(() => {
      const loaded = loadState();
      const campaignId = (() => { try { return localStorage.getItem(CAMPAIGN_ID_KEY); } catch { return null; } })();
      if (!campaignId) {
        return { state: compactTombstones(loaded.state), corruption: loaded.corruption };
      }
      return loaded;
    });
    const [state, setRaw]     = useState(initial.state);
    const [corruption, setCorruption] = useState(initial.corruption);
    // Set when a localStorage write is rejected (quota/blocked). Surfaced as a
    // banner so the player knows their progress isn't being saved instead of
    // finding out when they reload. Auto-clears on the next successful save.
    const [saveError, setSaveError] = useState(null);
    const saveTimer = useRef(null);
    const upsertTimer = useRef(null);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    function dismissCorruption() {
      setCorruption(null);
      try { localStorage.removeItem(CORRUPTED_BACKUP_KEY); } catch { /* ignore */ }
    }

    const dismissSaveError = useCallback(() => setSaveError(null), []);

    // Ask the browser to make our storage persistent so this app's only copy of
    // the game (in solo mode, localStorage is the sole record) isn't evicted
    // under storage pressure or Safari's ~7-day cleanup of unused sites.
    // Best-effort and idempotent: unsupported browsers / insecure contexts and
    // an already-persisted origin simply no-op. Runs once on mount.
    useEffect(() => {
      const s = navigator.storage;
      if (!s?.persist) return;
      Promise.resolve(s.persisted?.())
        .then(already => { if (!already) s.persist(); })
        .catch(() => { /* best-effort — nothing to do if the request fails */ });
    }, []);

    useEffect(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const res = saveState(state);
        setSaveError(res.ok
          ? null
          : 'Your changes could not be saved to this browser (storage may be full or blocked).');
      }, 400);
      return () => clearTimeout(saveTimer.current);
    }, [state]);

    // ── Undo snapshot (single-level) ─────────────────────────────────────────
    // Captured before every undoable mutation in setState. Cleared on undo,
    // when a new undoable action overwrites it, or when remote state arrives
    // (undoing after a co-player's edit would revert their change).
    const undoSnapshot = useRef(null);
    const [undoLabel, setUndoLabel] = useState(null);

    // Sections with a local edit applied but not yet sent to Supabase (still
    // sitting inside the 400ms debounce window in setState below). Declared
    // here, ahead of handleRemoteChange, because a remote section must be
    // checked against it (AVE-518, see below).
    const pendingSections = useRef(new Set());

    // ── Remote change handler (called by useSupabaseSync on Realtime event) ──
    // Merges remote state into local, preserving local-only keys. Invalidates
    // the undo snapshot so we never undo to a state that didn't include the
    // remote change (AVE-366).
    const handleRemoteChange = useCallback((sectionsToApply) => {
      setRaw(prev => {
        const merged = mergeRemoteSections(prev, sectionsToApply, pendingSections.current);
        if (merged === prev) return prev; // every section filtered → true no-op (AVE-530)
        undoSnapshot.current = null;
        setUndoLabel(null);
        return {
          ...merged,
          log:            prev.log,            // local-only: session log
          settings:       prev.settings,       // local-only: app settings
          activeGuardIdx: prev.activeGuardIdx, // local-only: which guard tab each player is viewing
        };
      });
    }, []);

    const sync = useSupabaseSync(state, handleRemoteChange);

    // Keep a ref to the latest sync handle so async callbacks (beforeunload /
    // visibility flush) always see the current value without stale-closure
    // issues. Declared after `sync` — referencing it earlier is a temporal
    // dead-zone crash that white-screens the whole app.
    const syncRef = useRef(sync);
    useEffect(() => { syncRef.current = sync; }, [sync]);

    // ── Core setState — persists locally and upserts the changed section(s) ──
    // sectionName: which Supabase column this change belongs to, or null for local-only.
    // Multiple distinct sections may be touched within one debounce window (e.g.
    // edits to two different guards); each is collected and flushed, so no
    // pending upsert is dropped. (pendingSections itself is declared above,
    // ahead of handleRemoteChange, which also reads it — see AVE-518.)

      const flushPendingSync = useCallback(() => {
        if (upsertTimer.current) {
          clearTimeout(upsertTimer.current);
          upsertTimer.current = null;
        }
        if (pendingSections.current.size > 0) {
          const sections = Array.from(pendingSections.current);
          pendingSections.current.clear();
          // Synchronously persist these sections' payloads to the localStorage-
          // backed sync queue BEFORE the async network flush (AVE-522). This
          // path runs on beforeunload / visibility-hidden — the tab may die
          // before the fetch completes (and the beforeunload fetch has no
          // keepalive, so browsers routinely abort it). The localStorage write
          // is synchronous and survives, so next boot replays the edit instead
          // of refetchRow reverting it to the older server value. A successful
          // flush clears the queue entry again.
          syncRef.current.enqueuePendingSections?.(sections, stateRef.current);
          for (const section of sections) {
            syncRef.current.upsertSection(section, stateRef.current);
          }
        }
      }, []);

      // Flush pending section upserts (and persist) when the tab is closed or
      // backgrounded, so an edit made right before leaving isn't lost (AVE-377).
      // These effects depend on flushPendingSync, so they must be declared
      // after it — referencing it earlier is a temporal dead-zone crash.
      useEffect(() => {
        const flush = () => {
          flushPendingSync();
          saveState(stateRef.current);
        };
        window.addEventListener('beforeunload', flush);
        return () => window.removeEventListener('beforeunload', flush);
      }, [flushPendingSync]);

      useEffect(() => {
        const handleVisibility = () => {
          if (document.visibilityState === 'hidden') {
            flushPendingSync();
          }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
      }, [flushPendingSync]);

      const setState = useCallback((updater, sectionName = null) => {
        if (sectionName) {
          setRaw(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            const label = deriveUndoLabel(prev, next, sectionName);
            undoSnapshot.current = { prevState: prev, sectionName, label };
            setUndoLabel(label);
            return next;
          });
          pendingSections.current.add(sectionName);
          if (upsertTimer.current) clearTimeout(upsertTimer.current);
          upsertTimer.current = setTimeout(() => {
            const sections = Array.from(pendingSections.current);
            pendingSections.current.clear();
            for (const section of sections) {
              sync.upsertSection(section, stateRef.current);
            }
          }, 400);
        } else {
          setRaw(typeof updater === 'function' ? updater : updater);
        }
      }, [sync]);

  // ── Undo last action ──────────────────────────────────────────────────────
  const undoLastAction = useCallback(() => {
    const snapshot = undoSnapshot.current;
    if (!snapshot) return;
    const { prevState, sectionName, label } = snapshot;
    // Undoing an *add* omits the added element, but the server merge preserves
    // anything the payload omits, so the add survives and its echo resurrects it
    // locally (AVE-523). withUndoTombstones negates elements/keys present in the
    // current state but missing from prevState (id-array tombstones, 0-count
    // stash keys). Apply it before both setRaw and upsertSection so local state
    // and the sent payload agree — critical for echo suppression.
    const restored = withUndoTombstones(prevState, stateRef.current);
    setRaw(addLog(restored, `Undo: ${label}`));
    if (sectionName) {
      sync.upsertSection(sectionName, restored);
    }
    undoSnapshot.current = null;
    setUndoLabel(null);
  }, [sync]);

  // ── Active guard (local-only UI navigation — never synced) ──────────────
  // Each player independently controls which guard card they're viewing.
  // Passing null as the section name keeps this out of Supabase entirely.
  const setActiveGuard = useCallback((idx) =>
    setState(s => ({ ...s, activeGuardIdx: idx }), null), [setState]);

  // activeParty is shared party-level state in its own `party` section.
  // (activeGuardIdx is also touched by this reducer but is local-only.)
  const setPartySlot = useCallback((slotIdx, name) =>
    setState(s => reduceSetPartySlot(s, slotIdx, name), 'party'), [setState]);

  // ── Party resources ──────────────────────────────────────────────────────
  const setSil = useCallback((delta) =>
    setState(s => reduceSetSil(s, delta), 'resources'), [setState]);

  const setLux = useCallback((delta) =>
    setState(s => reduceSetLux(s, delta), 'resources'), [setState]);

  // ── Guard mutations ──────────────────────────────────────────────────────
  // Each guard syncs to its own column (guard_0 … guard_7), so concurrent edits
  // to different guards never overwrite each other.
  const adjustGuardHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardHp(s, guardIdx, delta), guardColumn(guardIdx)), [setState]);

  const adjustGuardMaxHp = useCallback((guardIdx, delta) =>
    setState(s => reduceAdjustGuardMaxHp(s, guardIdx, delta), guardColumn(guardIdx)), [setState]);

  const setGuardEquipment = useCallback((guardIdx, slot, value) =>
    setState(s => reduceSetGuardEquipment(s, guardIdx, slot, value), guardColumn(guardIdx)), [setState]);

  const setGuardSatchelItem = useCallback((guardIdx, slotIdx, field, value) =>
    setState(s => reduceSetGuardSatchelItem(s, guardIdx, slotIdx, field, value), guardColumn(guardIdx)), [setState]);

  const toggleExpandedSatchel = useCallback((guardIdx) =>
    setState(s => {
      const expanded = !s.guards[guardIdx].expandedSatchel;
      const guards   = s.guards.map((g, i) => i === guardIdx ? { ...g, expandedSatchel: expanded } : g);
      return { ...s, guards };
    }, guardColumn(guardIdx)), [setState]);

  // ── Stash ────────────────────────────────────────────────────────────────
  const adjustStash = useCallback((itemName, delta) =>
    setState(s => reduceAdjustStash(s, itemName, delta), 'stash'), [setState]);

  // ── Stonebound ───────────────────────────────────────────────────────────
  const setStoneboundMax = useCallback((delta) =>
    setState(s => reduceSetStoneboundMax(s, delta), 'stash'), [setState]);

  const addStoneboundLocation = useCallback(() =>
    setState(s => reduceAddStoneboundLocation(s), 'stash'), [setState]);

  const removeStoneboundLocation = useCallback((idx) =>
    setState(s => reduceRemoveStoneboundLocation(s, idx), 'stash'), [setState]);

  const updateStoneboundLocation = useCallback((id, field, value) =>
    setState(s => reduceUpdateStoneboundLocation(s, id, field, value), 'stash'), [setState]);

  // ── Campaign ─────────────────────────────────────────────────────────────
  const setEventToken = useCallback((region, delta) =>
    setState(s => reduceSetEventToken(s, region, delta), 'campaign'), [setState]);

  const resetEventToken = useCallback((region) =>
    setState(s => reduceResetEventToken(s, region), 'campaign'), [setState]);

  const setCampaignLocation = useCallback((key, value) =>
    setState(s => reduceSetCampaignLocation(s, key, value), 'campaign'), [setState]);

  const addDynamicLocation = useCallback((type) =>
    setState(s => reduceAddDynamicLocation(s, type), 'campaign'), [setState]);

  const updateDynamicLocation = useCallback((type, id, label) =>
    setState(s => reduceUpdateDynamicLocation(s, type, id, label), 'campaign'), [setState]);

  const removeDynamicLocation = useCallback((type, id) =>
    setState(s => reduceRemoveDynamicLocation(s, type, id), 'campaign'), [setState]);

  const addPlan = useCallback((text) =>
    setState(s => reduceAddPlan(s, text), 'campaign'), [setState]);

  const togglePlan = useCallback((id) =>
    setState(s => reduceTogglePlan(s, id), 'campaign'), [setState]);

  const deletePlan = useCallback((id) =>
    setState(s => reduceDeletePlan(s, id), 'campaign'), [setState]);

  const toggleEncounterComplete = useCallback((encounterId) =>
    setState(s => reduceToggleEncounterComplete(s, encounterId), 'campaign'), [setState]);

  const toggleBountyComplete = useCallback((bountyId) =>
    setState(s => reduceToggleBountyComplete(s, bountyId), 'campaign'), [setState]);

  const togglePuzzleQuestComplete = useCallback((puzzleQuestId) =>
    setState(s => reduceTogglePuzzleQuestComplete(s, puzzleQuestId), 'campaign'), [setState]);

  const setCampaign = useCallback((campaignId) =>
    setState(s => reduceSetCampaign(s, campaignId), 'campaign'), [setState]);

  const setFtIstraBuilding = useCallback((buildingName, state) => {
    setState(s => ({
      ...s,
      campaign: {
        ...s.campaign,
        ftIstraBuildings: {
          ...s.campaign.ftIstraBuildings,
          [buildingName]: state,
        },
      },
    }), 'campaign');
  }, [setState]);

  // ── Save data ────────────────────────────────────────────────────────────
  const exportState = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `guards-ledger-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importState = useCallback((file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          const healed = healState(migrateV1(imported));
          if (!healed) { resolve({ success: false, error: 'Invalid save file.' }); return; }

          const newState = addLog(healed, 'Save file imported');

          // Discard any pending old-state writes — the import replaces everything.
          pendingSections.current.clear();
          if (upsertTimer.current) {
            clearTimeout(upsertTimer.current);
            upsertTimer.current = null;
          }

          // Drop the undo snapshot — it predates the state replacement (AVE-524).
          undoSnapshot.current = null;
          setUndoLabel(null);

          setState(newState, null);

          // Propagate to all players when a campaign is active (AVE-374).
          syncRef.current.replaceRow?.(newState).then(r => {
            if (r?.error) console.error('Import failed to sync to campaign:', r.error);
          });

          resolve({ success: true });
        } catch {
          resolve({ success: false, error: 'Invalid save file.' });
        }
      };
      reader.onerror = () => resolve({ success: false, error: 'Failed to read file.' });
      reader.readAsText(file);
    });
  }, [setState]);

    const resetState = useCallback(() => {
    const newState = createInitialState();

    // Discard any pending old-state writes — the reset replaces everything.
    pendingSections.current.clear();
    if (upsertTimer.current) {
      clearTimeout(upsertTimer.current);
      upsertTimer.current = null;
    }

    // Drop the undo snapshot — it predates the state replacement (AVE-524).
    undoSnapshot.current = null;
    setUndoLabel(null);

    setState(newState, null);

    // Propagate to all players when a campaign is active (AVE-374).
    syncRef.current.replaceRow?.(newState).then(r => {
      if (r?.error) console.error('Reset failed to sync to campaign:', r.error);
    });
  }, [setState]);

    // ── Leave campaign — also compact tombstones ───────────────────────────
    // Clearing campaignId means no merge to defeat, so tombstones become dead
    // weight. Hard-drop them immediately (AVE-368).
    const leaveCampaign = useCallback(() => {
      setRaw(prev => compactTombstones(prev));
      sync.leaveCampaign();
    }, [sync]);

  return {
    state,
    corruption,             // { reason, raw } | null — drives the corruption banner
    dismissCorruption,      // hide the banner and clear the backed-up raw string
    saveError,              // string | null — set when a localStorage write is rejected
    dismissSaveError,       // hide the save-error banner (reappears if the next save also fails)
    sync: { ...sync, leaveCampaign }, // override leaveCampaign to include compaction
    setActiveGuard,
    setPartySlot,
    setSil, setLux,
    adjustGuardHp, adjustGuardMaxHp,
    setGuardEquipment, setGuardSatchelItem, toggleExpandedSatchel,

    adjustStash,
    setStoneboundMax, addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
    setEventToken, resetEventToken,
    setCampaignLocation,
    addDynamicLocation, updateDynamicLocation, removeDynamicLocation,
    addPlan, togglePlan, deletePlan,
    toggleEncounterComplete,
    toggleBountyComplete,
    togglePuzzleQuestComplete,
    setCampaign,
    setFtIstraBuilding,
    setState, exportState, importState, resetState,
    undoLabel, undoLastAction,
  };
}
