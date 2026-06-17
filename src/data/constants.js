export const CITIES = [
  { id: 'mir',    name: 'Mir'    },
  { id: 'razdor', name: 'Razdor' },
  { id: 'ryba',   name: 'Ryba'   },
  { id: 'silny',  name: 'Silny'  },
  { id: 'strofa', name: 'Strofa' },
  { id: 'vouno',  name: 'Vouno'  },
];

// All 8 guards in campaign order
export const GUARDS = [
  'Grigory',
  'Alek',
  'Catherine',
  'Yury',
  'Kharzin',
  'Vera',
  'Pavel',
  'Yana',
];

// Guard identity colors — single source of truth used by App.jsx, GuardPanel.jsx,
// SettingsPanel.jsx, and the session log colorizer.
// key: CSS variable suffix (e.g. 'amber' → --c-guard-amber-*)
export const GUARD_COLOR_MAP = {
  Grigory:   { key: 'amber',     border: 'var(--c-guard-amber-border)',     bg: 'var(--c-guard-amber-bg)',     text: 'var(--c-guard-amber-text)'     },
  Alek:      { key: 'gold',      border: 'var(--c-guard-gold-border)',      bg: 'var(--c-guard-gold-bg)',      text: 'var(--c-guard-gold-text)'      },
  Catherine: { key: 'forest',    border: 'var(--c-guard-forest-border)',    bg: 'var(--c-guard-forest-bg)',    text: 'var(--c-guard-forest-text)'    },
  Yury:      { key: 'vermilion', border: 'var(--c-guard-vermilion-border)', bg: 'var(--c-guard-vermilion-bg)', text: 'var(--c-guard-vermilion-text)' },
  Kharzin:   { key: 'indigo',    border: 'var(--c-guard-indigo-border)',    bg: 'var(--c-guard-indigo-bg)',    text: 'var(--c-guard-indigo-text)'    },
  Vera:      { key: 'teal',      border: 'var(--c-guard-teal-border)',      bg: 'var(--c-guard-teal-bg)',      text: 'var(--c-guard-teal-text)'      },
  Pavel:     { key: 'rose',      border: 'var(--c-guard-rose-border)',      bg: 'var(--c-guard-rose-bg)',      text: 'var(--c-guard-rose-text)'      },
  Yana:      { key: 'cerulean',  border: 'var(--c-guard-cerulean-border)',  bg: 'var(--c-guard-cerulean-bg)',  text: 'var(--c-guard-cerulean-text)'  },
};

export const FALLBACK_COLOR = { key: 'gold', border: 'var(--c-guard-gold-border)', bg: 'var(--c-guard-gold-bg)', text: 'var(--c-guard-gold-text)' };

export const SATCHEL_SIZE          = 4;
export const SATCHEL_EXPANDED_SIZE = 8;
export const MAX_HP                = 20;
export const MAX_PRESTIGE          = 3;

// Verified base stats from physical game dashboards.
// All guards start with 20 HP.
const GUARD_DEFAULTS = {
  Grigory:   { baseAtk: 3, baseDef: 2 },
  Alek:      { baseAtk: 2, baseDef: 1 },
  Catherine: { baseAtk: 2, baseDef: 1 },
  Yury:      { baseAtk: 3, baseDef: 1 },
  Kharzin:   { baseAtk: 2, baseDef: 2 },
  Vera:      { baseAtk: 2, baseDef: 1 },
  Pavel:     { baseAtk: 3, baseDef: 2 },
  Yana:      { baseAtk: 2, baseDef: 1 },
};

function makeGuard(name) {
  const defaults = GUARD_DEFAULTS[name];
  return {
    name,
    hp:              MAX_HP,
    maxHp:           MAX_HP,
    baseAtk:         defaults.baseAtk,
    baseDef:         defaults.baseDef,
    expandedSatchel: false,
    satchel:         Array(SATCHEL_EXPANDED_SIZE).fill(null).map(() => ({ item: '', qty: 1 })),
    equipment:       { weapon: '', armor: '', accessory: '', item: '' },
  };
}

// prestige is NOT stored — it is always derived from the three quest booleans.
function makeCity(id, name) {
  return {
    id, name,
    puzzleQuestDone: false,
    bounty1Done:     false,
    bounty2Done:     false,
  };
}

// ─── Sectioned initial state ──────────────────────────────────────────────────
//
// State is split into sync sections that map 1:1 to Supabase columns.
// Each section is independently updatable so two players can write
// different sections simultaneously without clobbering each other.
//
// Sections:
//   resources — sil, lux                          (player A owns)
//   cities    — city quest flags                  (player A owns)
//   guards    — guards, activeParty, activeGuardIdx (shared)
//   stash     — stash, stonebound                 (shared)
//   campaign  — eventTokens, locations, plans     (player B owns)
//
// log and settings remain local-only (never synced).

export function createInitialResources() {
  return { sil: 0, lux: 0 };
}

export function createInitialCities() {
  return { cities: CITIES.map(c => makeCity(c.id, c.name)) };
}

export function createInitialGuards() {
  return {
    guards:         GUARDS.map(makeGuard),
    activeParty:    ['Alek', 'Grigory'],
    activeGuardIdx: 0,
  };
}

export function createInitialStash() {
  return {
    stash:      {},
    stonebound: { max: 4, locations: [] },
  };
}

export const CAMPAIGNS = [
  { id: 1, label: 'Campaign 1',   subtitle: 'The Isofarian Guard' },
  { id: 2, label: 'Campaign 2',   subtitle: 'The Stonebound'      },
  { id: 3, label: 'Campaign 3',   subtitle: 'The Remnant'         },
  { id: 4, label: 'Campaign 4',   subtitle: 'The Prophecy'        },
];

export const CHAPTERS = [
  { id: 1,  campaign: 1, label: 'Ch. 1',  subtitle: 'A Call to Arms'      },
  { id: 2,  campaign: 1, label: 'Ch. 2',  subtitle: 'To Mir'              },
  { id: 3,  campaign: 1, label: 'Ch. 3',  subtitle: 'The Guilds of Mir'   },
  { id: 4,  campaign: 1, label: 'Ch. 4',  subtitle: 'Wanted: Dead or Alive' },
  { id: 5,  campaign: 1, label: 'Ch. 5',  subtitle: 'The Ruins'           },
  { id: 6,  campaign: 1, label: 'Ch. 6',  subtitle: 'The Remnant'         },
  { id: 7,  campaign: 2, label: 'Ch. 7',  subtitle: 'The Stonebound'      },
  { id: 8,  campaign: 2, label: 'Ch. 8',  subtitle: 'The Mad Alchemist'   },
  { id: 9,  campaign: 2, label: 'Ch. 9',  subtitle: 'The Hunt'           },
  { id: 10, campaign: 2, label: 'Ch. 10', subtitle: 'The Darkwood'        },
  { id: 11, campaign: 2, label: 'Ch. 11', subtitle: 'The Siege of Ryba'   },
  { id: 12, campaign: 2, label: 'Ch. 12', subtitle: 'The Fall'           },
  { id: 13, campaign: 3, label: 'Ch. 13', subtitle: 'The Survivors'      },
  { id: 14, campaign: 3, label: 'Ch. 14', subtitle: 'The Lost City'      },
  { id: 15, campaign: 3, label: 'Ch. 15', subtitle: 'The Escape'         },
  { id: 16, campaign: 3, label: 'Ch. 16', subtitle: 'The Conspiracy'     },
  { id: 17, campaign: 3, label: 'Ch. 17', subtitle: 'The Beast'          },
  { id: 18, campaign: 3, label: 'Ch. 18', subtitle: 'The Reckoning'      },
  { id: 19, campaign: 4, label: 'Ch. 19', subtitle: 'The Prodigal'       },
  { id: 20, campaign: 4, label: 'Ch. 20', subtitle: 'The Truth'          },
  { id: 21, campaign: 4, label: 'Ch. 21', subtitle: 'The Journey'        },
  { id: 22, campaign: 4, label: 'Ch. 22', subtitle: 'The Sacrifice'      },
  { id: 23, campaign: 4, label: 'Ch. 23', subtitle: 'The Awakening'      },
  { id: 24, campaign: 4, label: 'Ch. 24', subtitle: 'The End'            },
];

export function createInitialCampaign() {
  return {
    campaign: {
      eventTokens: { mountain: 0, forest: 0, plains: 0, sea: 0 },
      locations: {
        party: '', caravan: '', mainQuest: '', boat: '',
        sideQuests: [],
        bounties:   [],
      },
      plans: [],
      ftIstraBuildings: {},
      completedEncounters: [],
      campaignId: 0,
      chapterId: 0,
    },
  };
}

export function createInitialState() {
  return {
    ...createInitialResources(),
    ...createInitialCities(),
    ...createInitialGuards(),
    ...createInitialStash(),
    ...createInitialCampaign(),
    log:      [],
    settings: { initialized: true, hasSeenOnboarding: false },
  };
}
