// src/data/materials.js

// ─── GEAR LISTS ───────────────────────────────────────────────────────────────
// These are defined first so MATERIAL_CATEGORIES can reference them.

export const WEAPONS = [
  'Alloy Driver', 'Alloy Hand Axes', 'Alloy Short Sword', 'Argent Blade',
  'Bleeding Heart Dagger', 'Cerulean Pike', 'Cerulean Staff', 'Contorted Staff',
  'Dangerous Duo', 'Drakonbow', 'Euphonic Edge', 'Falmundian Bow', 'Final Wish',
  "Forteller's Staff", 'Glorious', 'Golden Mallet', 'Golden Scythe', 'Ground Shaker',
  'Guardian Lance', "Hunter's Pride", "Hunter's Spear", 'Jade Sword', 'Lapis Blade',
  "Magi's Command", 'Nadya', 'Ornate Cleavers', 'Partisan', 'Radiance', 'Reckoning Tides',
  'Relic Glove', 'Revelation', 'Rosewind Staff', 'Ryban Glaive', 'Sapphire Staff',
  'Scaled Dagger', 'Silver Bow', 'Silver Flame', 'Silver Hammer', 'Sky Splitter',
  'Snow Hunter Bow', 'Star Blade', "Squire's Blade", 'Swift Gale', 'Sword of Isofar',
  'Sword of Truth', "Vanguard's Promise", 'Volk Blade', 'Wind Cutters',
];

export const ARMOR = [
  "Adventurer's Garb", 'Bear Tunic', 'Bone Armor', 'Brigandine',
  "Brother's Keeper", 'Crimson Vest', 'Drakondor Armor', "Guard's Armor",
  "Guard's Tunic", 'Guild Cuirass', "Hero's Armor", 'Horned Cuirass',
  "Hunter's Tunic", 'Journey Attire', "Prophet's Jacket", 'Raiding Armor',
  'Red Scale Armor', 'Reinforced Tunic', "Scholar's Tunic", 'Stardust Jacket',
  'Tenebris Scale', 'Tunic of the Wild', "Veteran's Coat", 'Volkrok Tunic',
  'Wanderer of the Fields', 'Woven Spine Armor', "Zephyr's Tunic",
];

export const ACCESSORIES = [
  'Adamant Ring', 'Aegis Shield', 'Ancient Gloves', 'Carapace Helmet',
  'Chrono Locket', 'Chronos Boots', 'Cleansing Amulet', 'Concealing Cloak',
  'Feathered Mantle', 'Goat Skull Mask', "Karst's Signet", 'Leather Gauntlets',
  'Mirror Fragment', "Nomad's Trap", 'Obsidian Ring', "Ophelia's Brush",
  'Pendant of Wisdom', 'Power Belt', 'Ring of Fate', 'Ring of Healing',
  'Ring of Life', 'Ring of Lux', 'Ring of Power', 'Ring of Shielding',
  'Scale Shield', 'Seal of Mir', 'Star Fragment Amulet', 'Stonebound Talisman',
  'Traveling Boots', 'Twilight Guantlet', 'Umbral Ring', 'Wolf Head Tunic', 'Wolf Tooth Ring',
];

export const ITEMS = [
  'Aged Drink', 'Barrier Tonic', 'Bottled Courage', 'Cooked Fish',
  'Expanded Satchel', 'Invigorating Potion', 'Natural Remedies Volume 1',
  'Natural Remedies Volume 2', 'Natural Remedies Volume 3', 'Order from Chaos',
  'Pickaxe', 'Purifying Dust', 'Ruinous Dust', 'Smoke Bomb',
  'Spicy Stew', 'Tent', 'The Foundations of Telios', 'Wood Chopping Axe',
  'Zamar', "Zoya's Elixir",
];

// ─── MATERIAL CATEGORIES ──────────────────────────────────────────────────────

export const MATERIAL_CATEGORIES = [
  {
    id: 'ores',
    label: 'Ores',
    items: ['Iron', 'Silver', 'Gold', 'Agate', 'Crystal', 'Diamond'],
  },
  {
    id: 'timber',
    label: 'Timber',
    items: ['Pine', 'Rosewood', 'Ash', 'Autumn Blaze', 'Dogwood', 'Cedar', 'Cherry', 'Ancient Oak'],
  },
  {
    id: 'animal',
    label: 'Animal drops',
    items: [
      'Metal Frag.', 'Bone Frag.', 'Feathers', 'Wolf Pelt', 'Rough Leather',
      'Animal Hide', 'Claw', 'Bear Pelt', 'Horn', 'Spines', 'Scales', 'Carapace',
    ],
  },
  {
    id: 'tenebris',
    label: 'Tenebris drops',
    items: ['Tenebris Shards', 'Tenebris Skull', 'Tenebris Essence'],
  },
  {
    id: 'fish',
    label: 'Fish & food',
    items: [
      'Cooked Fish', 'Dusk Tuna', 'Emerald Koi', 'Foxtail Carp', 'Amethyst Trout',
      'Ryba Blue Fins', 'Golden Potato', 'Clayhorn Steak', 'Mir Bread',
    ],
  },
  {
    id: 'market',
    label: 'Market & misc',
    items: ['Health Potion', 'Tent'],
  },
  {
    id: 'special',
    label: 'Special ingredients',
    // Jade, Black Diamond, and Ancient Roots are also speaking stones —
    // they're tracked here as a single quantity usable for either purpose.
    items: [
      'Coastal Bluecaps', 'Midnight Hydrangea', 'Falmundian Rosehips',
      'Purifying Seed', 'Ruinous Seed', 'Ancient Roots', 'Jade', 'Onyx', 'Black Diamond',
    ],
  },
  {
    id: 'speaking_stones',
    label: 'Speaking stones',
    // Excludes Jade, Black Diamond, Ancient Roots (tracked in Special ingredients)
    // and Diamond (tracked in Ores). All are the same physical item regardless of use.
    items: [
      'Adamant', 'Aquamarine', 'Aventurine', 'Carnelian',
      'Garnet', 'Lapis Lazuli', 'Obsidian', 'Orichalcum',
      'Rainbow Obsidian', 'Star Fragment', 'Star Quartz',
    ],
  },
  {
    id: 'gear',
    label: 'Gear',
    items: [...new Set([...WEAPONS, ...ARMOR, ...ACCESSORIES, ...ITEMS])].sort(),
  },
];

// ─── DERIVED EXPORTS ──────────────────────────────────────────────────────────

export const ALL_MATERIALS = MATERIAL_CATEGORIES.flatMap(c => c.items).sort();

// Pre-computed { item, category } pairs for the stash UI — avoids re-deriving in components.
export const ALL_ITEMS_WITH_CATEGORY = MATERIAL_CATEGORIES.flatMap(cat =>
  cat.items.map(item => ({ item, category: cat.label }))
);

// Set of all known item names — used for custom item detection in StashTab.
export const ALL_KNOWN_ITEMS = new Set(ALL_MATERIALS);

export const RESOURCE_NODE_ITEMS = [
  ...MATERIAL_CATEGORIES.find(c => c.id === 'ores').items,
  ...MATERIAL_CATEGORIES.find(c => c.id === 'timber').items,
].sort();

const RESOURCE_NODE_ITEMS_SET = new Set(RESOURCE_NODE_ITEMS);

// Ores and Timber (e.g. Iron, Dogwood) stack higher in a satchel slot than other materials.
export function satchelStackLimit(item) {
  return RESOURCE_NODE_ITEMS_SET.has(item) ? 8 : 4;
}

// Items that can drop from enemies — used for Stonebound cube placement.
export const ENEMY_DROPS = [
  ...MATERIAL_CATEGORIES.find(c => c.id === 'animal').items,
  ...MATERIAL_CATEGORIES.find(c => c.id === 'tenebris').items,
].sort();

// Full enemy name list — kept for reference, not used in Stonebound UI.
export const ENEMIES = [
  'Armored Zhuk', 'Brigand Archer', 'Brigand Chief', 'Brigand Marauder',
  'Broken Plough Soldier', 'Cave Stalker', 'Clayhorn', 'Corrupted Brigand',
  'Corrupted Fylakes', 'Corrupted Guard', 'Corrupted Lobster', 'Corrupted Priest',
  'Corrupted Soldier', 'Disruptor', 'Drakondor', 'Dusk Stalker',
  'Eye of Uvidet', 'Falmund Scout', 'Flesh Eating Fish', 'Glacial Worm',
  'Golden Scythe Soldier', 'Hand of Uvidet', 'Kingsguard', 'Metal Eater',
  'Mountain Bear', 'Plains Strider', 'Seer Acolyte', "Seer's Assassin",
  'Seer Zealot', 'Stone Guardian', 'Stonehunter', 'Tenebris Clayhorn',
  'Tenebris Colossus', 'Tenebris Drakondor', 'Tenebris Guard', 'Tenebris Hunter',
  'Tenebris Strider', 'Tenebris Zhuk', 'Timber Wolf', 'Tumani Hunter',
  'Tumani Mender', 'Tumani Raider', 'Volrok', 'Waste Nomad', 'Waste Prowler',
];

export const WEAPON_STATS = {
  'Alloy Driver': 2, 'Alloy Hand Axes': 1, 'Alloy Short Sword': 1,
  'Argent Blade': 2, 'Bleeding Heart Dagger': 2, 'Cerulean Pike': 4,
  'Cerulean Staff': 1, 'Contorted Staff': 4, 'Dangerous Duo': 4,
  'Drakonbow': 4, 'Euphonic Edge': 2, 'Falmundian Bow': 1,
  'Final Wish': 5, "Forteller's Staff": 3, 'Glorious': 4,
  'Golden Mallet': 3, 'Golden Scythe': 3, 'Ground Shaker': 4,
  'Guardian Lance': 5, "Hunter's Pride": 3, "Hunter's Spear": 1,
  'Jade Sword': 6, 'Lapis Blade': 4, "Magi's Command": 5,
  // Quest-reward weapons
  'Nadya': 2,
  'Sapphire Staff': 2,
  'Snow Hunter Bow': 2,
  "Squire's Blade": 1,
  'Ornate Cleavers': 2, 'Partisan': 2, 'Radiance': 3,
  'Reckoning Tides': 3, 'Relic Glove': 2, 'Revelation': 5,
  'Rosewind Staff': 2, 'Ryban Glaive': 3, 'Scaled Dagger': 2,
  'Silver Bow': 2, 'Silver Flame': 2, 'Silver Hammer': 1,
  'Sky Splitter': 3, 'Star Blade': 5, 'Swift Gale': 3,
  'Sword of Isofar': 5, 'Sword of Truth': 1, "Vanguard's Promise": 5,
  'Volk Blade': 1, 'Wind Cutters': 5,
};

export const ARMOR_STATS = {
  "Adventurer's Garb": 0, 'Bear Tunic': 1, 'Bone Armor': 6,
  'Brigandine': 5, "Brother's Keeper": 5, 'Crimson Vest': 5,
  'Drakondor Armor': 2, "Guard's Armor": 3, "Guard's Tunic": 0,
  'Guild Cuirass': 2, "Hero's Armor": 4, 'Horned Cuirass': 2,
  "Hunter's Tunic": 2, 'Journey Attire': 1, "Prophet's Jacket": 5,
  'Raiding Armor': 4, 'Red Scale Armor': 3, 'Reinforced Tunic': 1,
  "Scholar's Tunic": 5, 'Stardust Jacket': 5, 'Tenebris Scale': 5,
  'Tunic of the Wild': 3, "Veteran's Coat": 5, 'Volkrok Tunic': 1,
  'Wanderer of the Fields': 3, 'Woven Spine Armor': 2, "Zephyr's Tunic": 3,
};

// ─── MATERIAL SOURCES ────────────────────────────────────────────────────────
// Used by MaterialSourcePopup to answer "where do I get this?"
// Each entry has up to six optional fields:
//   enemies     — enemy names that drop this material
//   market      — { city, price } pairs for city market buy prices (Sil)
//   sell        — { city, price } pairs for city market sell prices (Sil)
//   ftIstraSell — number: Ft. Istra Apothecary sell price (pays Lux Essence)
//   nodes       — node labels for resource harvesting (ores + timber)
//   ftIstra     — { label, luxPer4 } for Ft. Istra building purchases

export const MATERIAL_SOURCES = {
  // ── Animal drops ────────────────────────────────────────────────────────────
  'Metal Frag.': {
    enemies: ['Corrupted Brigand', 'Corrupted Fylakes', 'Corrupted Soldier', 'Falmund Scout', 'Kingsguard', 'Metal Eater', 'Seer Acolyte', 'Seer Zealot'],
    sell: [{ city: 'Mir', price: 10 }, { city: 'Silny', price: 5 }],
    // ftIstraSell omitted — spreadsheet shows '-' (not sellable there)
  },
  'Bone Frag.': {
    enemies: ['Flesh Eating Fish', 'Metal Eater', 'Timber Wolf'],
    market: [{ city: 'Mir', price: 8 }, { city: 'Vouno', price: 8 }],
    sell: [{ city: 'Mir', price: 4 }, { city: 'Vouno', price: 4 }],
    ftIstraSell: 2,
  },
  'Feathers': {
    enemies: ['Drakondor', 'Tenebris Drakondor'],
    market: [{ city: 'Silny', price: 60 }],
    sell: [{ city: 'Silny', price: 30 }],
    ftIstraSell: 2,
  },
  'Wolf Pelt': {
    enemies: ['Timber Wolf', 'Tumani Hunter', 'Tumani Mender', 'Tumani Raider'],
    market: [{ city: 'Razdor', price: 16 }, { city: 'Silny', price: 8 }, { city: 'Strofa', price: 16 }],
    sell: [{ city: 'Razdor', price: 8 }, { city: 'Silny', price: 4 }, { city: 'Strofa', price: 8 }],
    ftIstraSell: 2,
  },
  'Rough Leather': {
    enemies: ['Clayhorn', 'Plains Strider', 'Stonehunter', 'Volrok'],
    market: [{ city: 'Mir', price: 16 }, { city: 'Strofa', price: 16 }],
    sell: [{ city: 'Mir', price: 8 }, { city: 'Strofa', price: 8 }],
    ftIstraSell: 4,
  },
  'Animal Hide': {
    enemies: ['Tumani Hunter', 'Tumani Raider'],
    market: [{ city: 'Strofa', price: 16 }, { city: 'Vouno', price: 16 }],
    sell: [{ city: 'Strofa', price: 8 }, { city: 'Vouno', price: 8 }],
    ftIstraSell: 4,
  },
  'Claw': {
    enemies: ['Disruptor', 'Dusk Stalker', 'Metal Eater', 'Tenebris Guard', 'Tenebris Hunter', 'Tenebris Zhuk', 'Timber Wolf', 'Waste Prowler'],
    market: [{ city: 'Razdor', price: 16 }, { city: 'Strofa', price: 16 }],
    sell: [{ city: 'Razdor', price: 8 }, { city: 'Strofa', price: 8 }],
    ftIstraSell: 4,
  },
  'Bear Pelt': {
    enemies: ['Mountain Bear', 'Tenebris Colossus'],
    market: [{ city: 'Silny', price: 16 }, { city: 'Vouno', price: 16 }],
    sell: [{ city: 'Silny', price: 8 }, { city: 'Vouno', price: 8 }],
    ftIstraSell: 4,
  },
  'Horn': {
    enemies: ['Armored Zhuk', 'Cave Stalker', 'Clayhorn', 'Corrupted Lobster', 'Metal Eater', 'Tenebris Clayhorn', 'Tenebris Colossus', 'Waste Prowler'],
    sell: [{ city: 'Razdor', price: 20 }, { city: 'Vouno', price: 8 }],
    ftIstraSell: 6,
  },
  'Spines': {
    enemies: ['Dusk Stalker', 'Plains Strider', 'Tenebris Clayhorn', 'Tenebris Strider'],
    sell: [{ city: 'Razdor', price: 20 }, { city: 'Vouno', price: 8 }],
    ftIstraSell: 6,
  },
  'Scales': {
    enemies: ['Armored Zhuk', 'Corrupted Lobster', 'Metal Eater', 'Tenebris Clayhorn', 'Tenebris Strider'],
    ftIstraSell: 8,
  },
  'Carapace': {
    enemies: ['Corrupted Lobster', 'Glacial Worm', 'Metal Eater', 'Tenebris Zhuk'],
    ftIstraSell: 10,
  },

  // ── Tenebris drops ──────────────────────────────────────────────────────────
  'Tenebris Shards': {
    enemies: ['Cave Stalker', 'Corrupted Priest', 'Disruptor', 'Dusk Stalker', 'Stone Guardian', 'Tenebris Colossus', 'Tenebris Guard', 'Tenebris Hunter'],
    ftIstraSell: 10,
  },
  'Tenebris Skull': {
    enemies: ['Tenebris Drakondor', 'Tenebris Hunter', 'Waste Prowler'],
    ftIstraSell: 15,
  },
  'Tenebris Essence': {
    enemies: ['Disruptor', 'Stone Guardian'],
  },

  // ── Ores ────────────────────────────────────────────────────────────────────
  'Iron': {
    nodes: ['Node 15', 'Node 88'],
    ftIstra: { label: 'Lapidary', luxPer4: 10 },
  },
  'Silver': {
    nodes: ['Node 24', 'Node 34'],
    ftIstra: { label: 'Lapidary', luxPer4: 12 },
  },
  'Gold': {
    nodes: ['Node 29'],
    ftIstra: { label: 'Lapidary', luxPer4: 14 },
  },
  'Agate': {
    nodes: ['Node 2'],
    ftIstra: { label: 'Lapidary', luxPer4: 20 },
  },
  'Crystal': {
    nodes: ['Ice Caves: Crystal Vein'],
    ftIstra: { label: 'Lapidary', luxPer4: 30 },
  },
  'Diamond': {
    nodes: ['Frozen Wastes: Diamond Vein'],
    ftIstra: { label: 'Lapidary', luxPer4: 40 },
  },

  // ── Timber ──────────────────────────────────────────────────────────────────
  'Pine': {
    nodes: ['Node 17', 'Node 86', 'Node 98'],
    ftIstra: { label: 'Lumbermill', luxPer4: 8 },
  },
  'Rosewood': {
    nodes: ['Node 86'],
    ftIstra: { label: 'Lumbermill', luxPer4: 10 },
  },
  'Ash': {
    nodes: ['Node 45'],
    ftIstra: { label: 'Lumbermill', luxPer4: 18 },
  },
  'Autumn Blaze': {
    nodes: ['Node 71'],
    ftIstra: { label: 'Lumbermill', luxPer4: 12 },
  },
  'Dogwood': {
    nodes: ['Node 25'],
    ftIstra: { label: 'Lumbermill', luxPer4: 20 },
  },
  'Cedar': {
    nodes: ['Node 41'],
    ftIstra: { label: 'Lumbermill', luxPer4: 16 },
  },
  'Cherry': {
    nodes: ['Node 71'],
    ftIstra: { label: 'Lumbermill', luxPer4: 14 },
  },
  'Ancient Oak': {
    nodes: ['Node 17'],
    ftIstra: { label: 'Lumbermill', luxPer4: 30 },
  },

  // ── Fish & food (market only) ────────────────────────────────────────────────
  'Dusk Tuna':       { market: [{ city: 'Ryba', price: 15 }], sell: [{ city: 'Ryba', price: 10 }] },
  'Emerald Koi':     { market: [{ city: 'Ryba', price: 20 }], sell: [{ city: 'Ryba', price: 10 }] },
  'Foxtail Carp':    { market: [{ city: 'Ryba', price: 20 }], sell: [{ city: 'Ryba', price: 10 }] },
  'Amethyst Trout':  { market: [{ city: 'Ryba', price: 25 }], sell: [{ city: 'Ryba', price: 10 }] },
  'Ryba Blue Fins':  { market: [{ city: 'Ryba', price: 10 }], sell: [{ city: 'Ryba', price: 5 }] },
  'Golden Potato':   { market: [{ city: 'Mir',  price: 5  }], sell: [{ city: 'Mir', price: 2 }] },
  'Clayhorn Steak':  { market: [{ city: 'Razdor', price: 5 }], sell: [{ city: 'Razdor', price: 2 }] },
  'Mir Bread':       { market: [{ city: 'Mir',  price: 5  }], sell: [{ city: 'Mir', price: 2 }] },

  // ── Market & misc ────────────────────────────────────────────────────────────
  'Health Potion': {
    market: [
      { city: 'Mir', price: 5 }, { city: 'Razdor', price: 5 },
      { city: 'Ryba', price: 5 }, { city: 'Silny', price: 5 },
      { city: 'Strofa', price: 10 }, { city: 'Vouno', price: 10 },
    ],
    sell: [
      { city: 'Mir', price: 2 }, { city: 'Razdor', price: 2 },
      { city: 'Ryba', price: 2 }, { city: 'Silny', price: 2 },
      { city: 'Strofa', price: 5 }, { city: 'Vouno', price: 5 },
    ],
  },
  'Tent': {
    market: [{ city: 'Silny', price: 20 }, { city: 'Strofa', price: 30 }],
    sell: [{ city: 'Silny', price: 10 }, { city: 'Strofa', price: 15 }],
  },

  // ── Armor ────────────────────────────────────────────────────────────────────
  "Guard's Tunic":          { sell: [{ city: 'Mir', price: 5 }] },
  'Woven Spine Armor':      { sell: [{ city: 'Mir', price: 15 }] },
  'Reinforced Tunic':       { sell: [{ city: 'Razdor', price: 15 }, { city: 'Silny', price: 15 }, { city: 'Ryba', price: 10 }] },
  'Bear Tunic':             { sell: [{ city: 'Strofa', price: 20 }, { city: 'Silny', price: 15 }] },
  'Horned Cuirass':         { sell: [{ city: 'Ryba', price: 24 }, { city: 'Mir', price: 18 }] },
  'Guild Cuirass':          { sell: [{ city: 'Razdor', price: 28 }] },
  'Volkrok Tunic':          { sell: [{ city: 'Strofa', price: 24 }] },
  "Guard's Armor":          { sell: [{ city: 'Vouno', price: 28 }] },
  "Hero's Armor":           { sell: [{ city: 'Vouno', price: 40 }] },
  'Tunic of the Wild':      { sell: [{ city: 'Strofa', price: 30 }] },
  'Journey Attire':         { sell: [{ city: 'Ryba', price: 21 }] },
  "Zephyr's Tunic":         { sell: [{ city: 'Razdor', price: 34 }] },
  "Adventurer's Garb":      { sell: [{ city: 'Ryba', price: 21 }] },
  "Hunter's Tunic":         { sell: [{ city: 'Silny', price: 33 }] },
  'Drakondor Armor':        { sell: [{ city: 'Vouno', price: 34 }] },
  'Wanderer of the Fields': { sell: [{ city: 'Mir', price: 38 }] },
  // Red Scale Armor: sell '-' — no entry
  // Ft. Istra armor (Raiding, Bone, Tenebris Scale, Veteran's Coat, Brother's Keeper,
  // Scholar's Tunic, Stardust Jacket, Crimson Vest, Prophet's Jacket, Brigandine): sell '-' — no entry

  // ── Weapons ──────────────────────────────────────────────────────────────────
  'Alloy Short Sword':  { sell: [{ city: 'Razdor', price: 6 }, { city: 'Ryba', price: 6 }, { city: 'Silny', price: 6 }] },
  'Volk Blade':         { sell: [{ city: 'Razdor', price: 8 }, { city: 'Silny', price: 8 }] },
  'Argent Blade':       { sell: [{ city: 'Mir', price: 20 }] },
  'Radiance':           { sell: [{ city: 'Razdor', price: 24 }] },
  'Golden Scythe':      { sell: [{ city: 'Mir', price: 23 }] },
  'Silver Flame':       { sell: [{ city: 'Vouno', price: 18 }] },
  'Swift Gale':         { sell: [{ city: 'Vouno', price: 24 }] },
  'Sword of Truth':     { sell: [{ city: 'Strofa', price: 15 }] },
  'Euphonic Edge':      { sell: [{ city: 'Razdor', price: 18 }] },
  'Sky Splitter':       { sell: [{ city: 'Razdor', price: 20 }] },
  'Alloy Hand Axes':    { sell: [{ city: 'Ryba', price: 6 }] },
  'Ornate Cleavers':    { sell: [{ city: 'Silny', price: 17 }] },
  'Reckoning Tides':    { sell: [{ city: 'Ryba', price: 24 }] },
  "Hunter's Spear":     { sell: [{ city: 'Mir', price: 10 }] },
  'Partisan':           { sell: [{ city: 'Strofa', price: 22 }] },
  'Ryban Glaive':       { sell: [{ city: 'Ryba', price: 24 }] },
  'Falmundian Bow':     { sell: [{ city: 'Razdor', price: 6 }] },
  'Silver Bow':         { sell: [{ city: 'Vouno', price: 20 }] },
  "Hunter's Pride":     { sell: [{ city: 'Strofa', price: 28 }] },
  'Silver Hammer':      { sell: [{ city: 'Vouno', price: 9 }] },
  'Alloy Driver':       { sell: [{ city: 'Mir', price: 17 }] },
  'Golden Mallet':      { sell: [{ city: 'Strofa', price: 30 }] },
  'Cerulean Staff':     { sell: [{ city: 'Silny', price: 10 }] },
  'Rosewind Staff':     { sell: [{ city: 'Razdor', price: 20 }] },
  "Forteller's Staff":  { sell: [{ city: 'Vouno', price: 28 }] },
  // Scaled Dagger, Relic Glove, Bleeding Heart Dagger: sell '-' — no entry
  // Quest-reward weapons (Nadya, Squire's Blade, Snow Hunter Bow, Sapphire Staff): sell '-' — no entry
  // Ft. Istra weapons (Lapis Blade, Star Blade, Jade Sword, Dangerous Duo, Wind Cutters,
  // Cerulean Pike, Guardian Lance, Drakonbow, Vanguard's Promise, Ground Shaker, Final Wish,
  // Glorious, Revelation, Contorted Staff, Magi's Command, Sword of Isofar): sell '-' — no entry

  // ── Accessories ──────────────────────────────────────────────────────────────
  'Carapace Helmet':   { sell: [{ city: 'Vouno', price: 14 }] },
  'Concealing Cloak':  { sell: [{ city: 'Razdor', price: 10 }] },
  'Expanded Satchel':  { sell: [{ city: 'Strofa', price: 5 }] },
  'Feathered Mantle':  { sell: [{ city: 'Strofa', price: 15 }] },
  'Goat Skull Mask':   { sell: [{ city: 'Strofa', price: 10 }] },
  'Leather Gauntlets': { sell: [{ city: 'Mir', price: 7 }] },
  "Nomad's Trap":      { sell: [{ city: 'Silny', price: 5 }] },
  'Scale Shield':      { sell: [{ city: 'Ryba', price: 18 }] },
  'Traveling Boots':   { sell: [{ city: 'Mir', price: 4 }] },
  'Wolf Head Tunic':   { sell: [{ city: 'Silny', price: 5 }] },
  'Wolf Tooth Ring':   { sell: [{ city: 'Ryba', price: 4 }, { city: 'Silny', price: 4 }] },
  // Aegis Shield, Chrono Locket, Chronos Boots, Cleansing Amulet, Pendant of Wisdom,
  // Power Belt, Stonebound Talisman, Twilight Guantlet: sell '-' — no entry
  // Quest/Ft. Istra accessories (Adamant Ring, Ancient Gloves, Umbral Ring, Ring of Shielding,
  // Ring of Healing, Ring of Power, Ring of Fate, Ring of Lux, Star Fragment Amulet,
  // Obsidian Ring, Mirror Fragment, Ring of Life, Ophelia's Brush, Karst's Signet,
  // Seal of Mir): sell data unknown — no entry

  // ── Items ─────────────────────────────────────────────────────────────────────
  'Smoke Bomb': { sell: [{ city: 'Strofa', price: 5 }, { city: 'Silny', price: 4 }] },
  // Barrier Tonic, Bottled Courage, Invigorating Potion, Zoya's Elixir,
  // Purifying Dust, Ruinous Dust, Expanded Satchel: sell '-' — no entry
  // Tent already handled above in Market & misc
  // Quest/Ft. Istra items (Aged Drink, Spicy Stew, Cooked Fish, Natural Remedies Vol 1-3,
  // Zamar, The Foundations of Telios, Order from Chaos, Wood Chopping Axe, Pickaxe): sell data unknown — no entry
};
