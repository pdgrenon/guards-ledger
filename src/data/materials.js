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
      'Dusk Tuna', 'Emerald Koi', 'Foxtail Carp', 'Amethyst Trout',
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
    items: [
      'Coastal Bluecaps', 'Midnight Hydrangea', 'Falmundia Rosehips',
      'Purifying Seed', 'Ancient Roots', 'Jade', 'Onyx', 'Black Diamond',
    ],
  },
];

export const ALL_MATERIALS = MATERIAL_CATEGORIES.flatMap(c => c.items).sort();

// Pre-computed { item, category } pairs for the stash UI — avoids re-deriving in components.
export const ALL_ITEMS_WITH_CATEGORY = MATERIAL_CATEGORIES.flatMap(cat =>
  cat.items.map(item => ({ item, category: cat.label }))
);

export const RESOURCE_NODE_ITEMS = [
  ...MATERIAL_CATEGORIES.find(c => c.id === 'ores').items,
  ...MATERIAL_CATEGORIES.find(c => c.id === 'timber').items,
].sort();

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

export const WEAPONS = [
  'Alloy Driver', 'Alloy Hand Axes', 'Alloy Short Sword', 'Argent Blade',
  'Bleeding Heart Dagger', 'Cerulean Pike', 'Cerulean Staff', 'Contorted Staff',
  'Dangerous Duo', 'Drakonbow', 'Euphonic Edge', 'Falmundian Bow', 'Final Wish',
  "Forteller's Staff", 'Glorious', 'Golden Mallet', 'Golden Scythe', 'Ground Shaker',
  'Guardian Lance', "Hunter's Pride", "Hunter's Spear", 'Jade Sword', 'Lapis Blade',
  "Magi's Command", 'Ornate Cleavers', 'Partisan', 'Radiance', 'Reckoning Tides',
  'Relic Glove', 'Revelation', 'Rosewind Staff', 'Ryban Glaive', 'Scaled Dagger',
  'Silver Bow', 'Silver Flame', 'Silver Hammer', 'Sky Splitter', 'Star Blade',
  'Swift Gale', 'Sword of Isofar', 'Sword of Truth', "Vanguard's Promise",
  'Volk Blade', 'Wind Cutters',
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
  'Aegis Shield', 'Carapace Helmet', 'Chrono Locket', 'Chronos Boots',
  'Cleansing Amulet', 'Concealing Cloak', 'Feathered Mantle', 'Goat Skull Mask',
  'Leather Gauntlets', "Nomad's Trap", 'Pendant of Wisdom', 'Power Belt',
  'Scale Shield', 'Stonebound Talisman', 'Traveling Boots', 'Twilight Guantlet',
  'Wolf Head Tunic', 'Wolf Tooth Ring',
];

export const ITEMS = [
  'Barrier Tonic', 'Bottled Courage', 'Expanded Satchel', 'Invigorating Potion',
  'Purifying Dust', 'Ruinous Dust', 'Smoke Bomb', 'Tent', "Zoya's Elixir",
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
