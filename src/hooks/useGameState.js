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
import {
  addLog,
  reduceSetPartySlot,
  reduceSetSil,
  reduceSetLux,
  reduceAdjustGuardHp,
  reduceAdjustGuardMaxHp,
  reduceSetGuardEquipment,
  reduceSetGuardSatchelItem,

  reduceToggleCityQuest,
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
  reduceSetCampaign,
} from './gameReducers';
import { useSupabaseSync, guardColumn } from './useSupabaseSync';

// v2: state is split into sync sections (resources, cities, guards, stash, campaign).
// v1 saves (flat shape) are migrated automatically on first load.
const STORAGE_KEY             = 'guards_ledger_v2';
const STORAGE_KEY_V1          = 'guards_ledger_v1';
const CORRUPTED_BACKUP_KEY    = 'guards_ledger_corrupted_backup';

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateV1(v1) {
  return {
    sil:            v1.sil            ?? 0,
    lux:            v1.lux            ?? 0,
    cities:         v1.cities         ?? createInitialCities().cities,
    guards:         v1.guards         ?? createInitialGuards().guards,
    activeParty:    v1.activeParty    ?? createInitialGuards().activeParty,
    // activeGuardIdx is local-only UI state — always reset to default on load
    // so each player starts viewing the first guard in their own party.
    activeGuardIdx: createInitialGuards().activeGuardIdx,
    stash:          v1.stash          ?? createInitialStash().stash,
    stonebound:     v1.stonebound     ?? createInitialStash().stonebound,
    campaign:       v1.campaign       ?? createInitialCampaign().campaign,
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
    satchel:           Array.isArray(raw.satchel) && raw.satchel.length === SATCHEL_EXPANDED_SIZE
                         ? raw.satchel.map(s => isPlainObject(s)
                             ? { item: healString(s.item), qty: healNumber(s.qty, 1) }
                             : { item: '', qty: 1 })
                         : fresh.satchel,
    equipment:         isPlainObject(raw.equipment)
                         ? { weapon:    healString(raw.equipment.weapon),
                             armor:     healString(raw.equipment.armor),
                             accessory: healString(raw.equipment.accessory),
                             item:      healString(raw.equipment.item) }
                         : fresh.equipment,

  };
}

function healState(parsed) {
  if (!isPlainObject(parsed)) return null;

  const resInit    = createInitialResources();
  const citiesInit = createInitialCities();
  const guardsInit = createInitialGuards();
  const stashInit  = createInitialStash();
  const campInit   = createInitialCampaign();

  const guardsArr = Array.isArray(parsed.guards) ? parsed.guards : [];
  const guards = Array.from({ length: 8 }, (_, i) => healGuard(guardsArr[i]));

  return {
    sil:            healNumber(parsed.sil, resInit.sil),
    lux:            healNumber(parsed.lux, resInit.lux),
    cities:         Array.isArray(parsed.cities) && parsed.cities.length > 0
                       ? parsed.cities.map(c => isPlainObject(c)
                           ? { ...citiesInit.cities[0], ...c,
                               name: healString(c.name, citiesInit.cities[0].name) }
                           : citiesInit.cities[0])
                       : citiesInit.cities,
    guards,
    activeParty:    Array.isArray(parsed.activeParty) && parsed.activeParty.length === 2
                       ? parsed.activeParty.map(healString)
                       : guardsInit.activeParty,
    // activeGuardIdx is local UI nav — always reset.
    activeGuardIdx: guardsInit.activeGuardIdx,
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
                             completedEncounters: Array.isArray(parsed.campaign.completedEncounters)
                               ? parsed.campaign.completedEncounters
                               : [] }
                        : campInit.campaign,
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

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGameState() {
    const [state, setRaw]     = useState(() => loadState().state);
    const [corruption, setCorruption] = useState(() => loadState().corruption);
    const saveTimer = useRef(null);
    const upsertTimer = useRef(null);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    function dismissCorruption() {
      setCorruption(null);
      try { localStorage.removeItem(CORRUPTED_BACKUP_KEY); } catch { /* ignore */ }
    }

    useEffect(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveState(state);
      }, 400);
      return () => clearTimeout(saveTimer.current);
    }, [state]);

    useEffect(() => {
      const flush = () => saveState(state);
      window.addEventListener('beforeunload', flush);
      return () => window.removeEventListener('beforeunload', flush);
    }, [state]);

    // ── Remote change handler (called by useSupabaseSync on Realtime event) ──
    // Merges remote state into local, preserving local-only keys.
    const handleRemoteChange = useCallback((remoteState) => {
      setRaw(prev => ({
        ...remoteState,
        log:            prev.log,            // local-only: session log
        settings:       prev.settings,       // local-only: app settings
        activeGuardIdx: prev.activeGuardIdx, // local-only: which guard tab each player is viewing
      }));
    }, []);

    const sync = useSupabaseSync(state, handleRemoteChange);

    // ── Core setState — persists locally and upserts the changed section(s) ──
    // sectionName: which Supabase column this change belongs to, or null for local-only.
    // Multiple distinct sections may be touched within one debounce window (e.g.
    // edits to two different guards); each is collected and flushed, so no
    // pending upsert is dropped.

      const pendingSections = useRef(new Set());

      const setState = useCallback((updater, sectionName = null) => {
        setRaw(prev => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          return next;
        });
        if (sectionName) {
          pendingSections.current.add(sectionName);
          if (upsertTimer.current) clearTimeout(upsertTimer.current);
          upsertTimer.current = setTimeout(() => {
            const sections = Array.from(pendingSections.current);
            pendingSections.current.clear();
            for (const section of sections) {
              sync.upsertSection(section, stateRef.current);
            }
          }, 400);
        }
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

  // ── Cities ───────────────────────────────────────────────────────────────
  const toggleCityQuest = useCallback((cityIdx, field) =>
    setState(s => reduceToggleCityQuest(s, cityIdx, field), 'cities'), [setState]);

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

  const updateStoneboundLocation = useCallback((idx, field, value) =>
    setState(s => reduceUpdateStoneboundLocation(s, idx, field, value), 'stash'), [setState]);

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
          setState(addLog(migrateV1(imported), 'Save file imported'), null);
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
    setState(createInitialState(), null);
  }, [setState]);

  return {
    state,
    corruption,             // { reason, raw } | null — drives the corruption banner
    dismissCorruption,      // hide the banner and clear the backed-up raw string
    sync, // expose sync handle so SettingsPanel can call createCampaign / joinCampaign / leaveCampaign
    setActiveGuard,
    setPartySlot,
    setSil, setLux,
    adjustGuardHp, adjustGuardMaxHp,
    setGuardEquipment, setGuardSatchelItem, toggleExpandedSatchel,

    toggleCityQuest,
    adjustStash,
    setStoneboundMax, addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
    setEventToken, resetEventToken,
    setCampaignLocation,
    addDynamicLocation, updateDynamicLocation, removeDynamicLocation,
    addPlan, togglePlan, deletePlan,
    toggleEncounterComplete,
    setCampaign,
    setFtIstraBuilding,
    setState, exportState, importState, resetState,
  };
}
