export const CITIES = [
  { id: 'mir', name: 'Mir' },
  { id: 'razdor', name: 'Razdor' },
  { id: 'ryba', name: 'Ryba' },
  { id: 'silny', name: 'Silny' },
  { id: 'strofa', name: 'Strofa' },
  { id: 'vouno', name: 'Vouno' },
];

export const GUARDS = ['Alek', 'Grigory'];

export const CHIP_TYPES = [
  { id: 'black',  label: 'Black',  color: 'chip-black'  },
  { id: 'green',  label: 'Green',  color: 'chip-green'  },
  { id: 'red',    label: 'Red',    color: 'chip-red'    },
  { id: 'purple', label: 'Purple', color: 'chip-purple' },
];

export const SATCHEL_SIZE = 4;
export const SATCHEL_EXPANDED_SIZE = 8;
export const MAX_HP = 20;
export const MAX_PRESTIGE = 3;

const GUARD_DEFAULTS = {
  'Alek':    { baseAtk: 2, baseDef: 1 },
  'Grigory': { baseAtk: 3, baseDef: 2 },
};

function makeGuard(name) {
  const defaults = GUARD_DEFAULTS[name];
  return {
    name,
    hp: MAX_HP,
    maxHp: MAX_HP,
    baseAtk: defaults.baseAtk,
    baseDef: defaults.baseDef,
    expandedSatchel: false,
    satchel: Array(SATCHEL_EXPANDED_SIZE).fill(null).map(() => ({ item: '', qty: 1 })),
    equipment: { weapon: '', armor: '', accessory: '', item: '' },
    chips: { black: 8, green: 0, red: 0, purple: 0 },
    startingBlack: 8,
  };
}

function makeCity(id, name) {
  return {
    id, name,
    prestige: 0,
    puzzleQuestDone: false,
    bounty1Done: false,
    bounty2Done: false,
  };
}

export function createInitialState() {
  return {
    sil: 0,
    lux: 0,
    activeGuardIdx: 0,
    guards: GUARDS.map(makeGuard),
    cities: CITIES.map(c => makeCity(c.id, c.name)),
    stash: {},
    stonebound: { max: 4, locations: [] },
    log: [],
    settings: { initialized: true },
  };
}
