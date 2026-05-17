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

export const CHIP_TYPES = [
  { id: 'black',  label: 'Black',  color: 'chip-black'  },
  { id: 'green',  label: 'Green',  color: 'chip-green'  },
  { id: 'red',    label: 'Red',    color: 'chip-red'    },
  { id: 'purple', label: 'Purple', color: 'chip-purple' },
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
    chips:           { black: 8, green: 0, red: 0, purple: 0 },
    startingBlack:   8,
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

export function createInitialState() {
  return {
    sil:            0,
    lux:            0,
    activeGuardIdx: 0,
    activeParty:    ['Alek', 'Grigory'],
    guards:         GUARDS.map(makeGuard),
    cities:         CITIES.map(c => makeCity(c.id, c.name)),
    stash:          {},
    stonebound:     { max: 4, locations: [] },
    log:            [],
    settings:       { initialized: true },
    campaign: {
      eventTokens: { mountain: 0, forest: 0, plains: 0, sea: 0 },
      locations: {
        party: '', caravan: '', mainQuest: '', boat: '',
        sideQuests: [],
        bounties: [],
      },
      plans: [],
    },
  };
}
