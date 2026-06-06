// src/data/recipes.js
// Auto-generated from TIG_2E_Unofficial_Index_Companion_v22.xlsx
// 101 recipes: armor, weapons, accessories, items
//
// Shape per recipe:
//   name        string
//   type        'Armor' | 'Weapon' | 'Accessory' | 'Item'
//   city        string  (human-readable, comma-separated for multi-city)
//   isFtIstra   boolean
//   stars       1–5  (5 = Ft. Istra endgame tier)
//   statBonus   string | null   e.g. '3⛊' or '2👊'
//   bonusChip   string | null   e.g. '⛊⛊', 'Evade', '❤︎'
//   effect      string | null   (accessories/items only)
//   craftCost   number | object | null
//               number  → same price everywhere
//               object  → { CityName: price, ... } for multi-city variance
//               null    → no Sil cost (lux-only or ingredient-only)
//   luxCost     number | null
//   prereq      string | null   item that must be equipped first
//   itemReq     string | null   special ingredient required (apothecary items)
//   limitedTo   string[]        guard names; empty = available to all
//   materials   Array<{ name, qty, qty2R, isSpeakingStone }>
//               qty2R — reduced quantity at prestige 2+ in a qualifying city;
//               null means no discount applies (Ft. Istra, speaking-stone items, etc.)

export const RECIPES = [
  // ── ARMOR ────────────────────────────────────────────────────────────────
  {
    name: "Guard's Tunic", type: 'Armor', city: 'Mir', isFtIstra: false, stars: 1,
    statBonus: '0⛊', bonusChip: null, effect: null,
    craftCost: 10, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Woven Spine Armor', type: 'Armor', city: 'Mir', isFtIstra: false, stars: 2,
    statBonus: '2⛊', bonusChip: '⛊⛊', effect: null,
    craftCost: 25, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Bone Frag.', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Spines', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Reinforced Tunic', type: 'Armor', city: 'Razdor, Ryba, Silny', isFtIstra: false, stars: 2,
    statBonus: '1⛊', bonusChip: null, effect: null,
    craftCost: { Razdor: 20, Silny: 20, Ryba: 15 }, luxCost: null,
    prereq: "Guard's Tunic", itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Bear Tunic', type: 'Armor', city: 'Silny, Strofa', isFtIstra: false, stars: 2,
    statBonus: '1⛊', bonusChip: null, effect: null,
    craftCost: { Strofa: 35, Silny: 30 }, luxCost: null,
    prereq: 'Reinforced Tunic', itemReq: null, limitedTo: [],
    materials: [
      { name: 'Bear Pelt', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Horned Cuirass', type: 'Armor', city: 'Mir, Ryba', isFtIstra: false, stars: 3,
    statBonus: '2⛊', bonusChip: null, effect: null,
    craftCost: { Mir: 36, Ryba: 48 }, luxCost: null,
    prereq: 'Reinforced Tunic', itemReq: null, limitedTo: [],
    materials: [
      { name: 'Claw', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Horn', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Guild Cuirass', type: 'Armor', city: 'Razdor', isFtIstra: false, stars: 3,
    statBonus: '2⛊', bonusChip: '❤︎', effect: null,
    craftCost: 56, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Spines', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Scales', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Volkrok Tunic', type: 'Armor', city: 'Strofa', isFtIstra: false, stars: 3,
    statBonus: '1⛊', bonusChip: 'Evade', effect: null,
    craftCost: 48, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Claw', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: "Guard's Armor", type: 'Armor', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '3⛊', bonusChip: null, effect: null,
    craftCost: 56, luxCost: null, prereq: 'Horned Cuirass', itemReq: null, limitedTo: [],
    materials: [
      { name: 'Animal Hide', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Scales', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Gold', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: "Hero's Armor", type: 'Armor', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '4⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: 80, luxCost: null, prereq: "Guard's Tunic", itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Agate', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Crystal', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Raiding Armor', type: 'Armor', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '4⛊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Carapace', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 2, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Bone Armor', type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '6⛊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Bone Frag.', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Horn', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Tunic of the Wild', type: 'Armor', city: 'Strofa', isFtIstra: false, stars: 3,
    statBonus: '3⛊', bonusChip: null, effect: null,
    craftCost: 60, luxCost: null, prereq: null, itemReq: null,
    limitedTo: ['Grigory', 'Kharzin', 'Pavel'],
    materials: [
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Claw', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Bear Pelt', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Scales', qty: 1, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Tenebris Scale', type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Grigory'],
    materials: [
      { name: 'Scales', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Black Diamond', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Veteran's Coat", type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Kharzin'],
    materials: [
      { name: 'Animal Hide', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Onyx', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Brother's Keeper", type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Pavel'],
    materials: [
      { name: 'Animal Hide', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Journey Attire', type: 'Armor', city: 'Ryba', isFtIstra: false, stars: 3,
    statBonus: '1⛊', bonusChip: 'Evade', effect: null,
    craftCost: 42, luxCost: null, prereq: null, itemReq: null,
    limitedTo: ['Alek', 'Yury'],
    materials: [
      { name: 'Bone Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Crystal', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: "Zephyr's Tunic", type: 'Armor', city: 'Razdor', isFtIstra: false, stars: 4,
    statBonus: '3⛊', bonusChip: 'Evade', effect: null,
    craftCost: 68, luxCost: null, prereq: null, itemReq: null,
    limitedTo: ['Alek', 'Yury'],
    materials: [
      { name: 'Feathers', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Crystal', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Stardust Jacket', type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Alek'],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 3, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Brigandine', type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Yury'],
    materials: [
      { name: 'Animal Hide', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Lapis Lazuli', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Adventurer's Garb", type: 'Armor', city: 'Ryba', isFtIstra: false, stars: 3,
    statBonus: '0⛊', bonusChip: 'Evade x2', effect: null,
    craftCost: 42, luxCost: null, prereq: null, itemReq: null,
    limitedTo: ['Catherine', 'Vera', 'Yana'],
    materials: [
      { name: 'Bone Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Crystal', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: "Hunter's Tunic", type: 'Armor', city: 'Silny', isFtIstra: false, stars: 3,
    statBonus: '2⛊', bonusChip: '1 AP', effect: null,
    craftCost: 65, luxCost: null, prereq: 'Reinforced Tunic', itemReq: null,
    limitedTo: ['Catherine', 'Vera', 'Yana'],
    materials: [
      { name: 'Wolf Pelt', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Animal Hide', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Bear Pelt', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Red Scale Armor', type: 'Armor', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '3⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: ['Catherine'],
    materials: [
      { name: 'Scales', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 4, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Drakondor Armor', type: 'Armor', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '4⛊', bonusChip: 'Evade', effect: null,
    craftCost: 80, luxCost: null, prereq: null, itemReq: null, limitedTo: ['Catherine'],
    materials: [
      { name: 'Feathers', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Claw', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Carapace', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Wanderer of the Fields', type: 'Armor', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '3⛊', bonusChip: 'Evade', effect: null,
    craftCost: 80, luxCost: null, prereq: null, itemReq: null, limitedTo: ['Vera'],
    materials: [
      { name: 'Carapace', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Crystal', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: "Scholar's Tunic", type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Alek'],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Topaz', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Crimson Vest', type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Catherine'],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Star Fragment', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Prophet's Jacket", type: 'Armor', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5⛊', bonusChip: '❤︎', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Yana'],
    materials: [
      { name: 'Wolf Pelt', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Aventurine', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },

  // ── WEAPONS ──────────────────────────────────────────────────────────────
  {
    name: 'Alloy Short Sword', type: 'Weapon', city: 'Razdor, Ryba, Silny', isFtIstra: false, stars: 2,
    statBonus: '1👊', bonusChip: null, effect: null,
    craftCost: 12, luxCost: null, prereq: 'Iron Short Sword', itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Pine', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Scaled Dagger', type: 'Weapon', city: 'Ryba', isFtIstra: false, stars: 2,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: 20, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Gold', qty: 2, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Relic Glove', type: 'Weapon', city: "Ft. Istra (The Brothers' Anvil)", isFtIstra: true, stars: 5,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 50, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Silver', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Aquamarine', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Bleeding Heart Dagger', type: 'Weapon', city: 'Ryba', isFtIstra: false, stars: 3,
    statBonus: '2👊', bonusChip: '❤︎', effect: null,
    craftCost: 32, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Garnet', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Volk Blade', type: 'Weapon', city: 'Mir', isFtIstra: false, stars: 1,
    statBonus: '1👊', bonusChip: null, effect: null,
    craftCost: 10, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Pine', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Argent Blade', type: 'Weapon', city: 'Mir, Ryba', isFtIstra: false, stars: 2,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: { Mir: 18, Ryba: 22 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Horn', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Radiance', type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 75, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Carapace', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Dogwood', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Lapis Blade', type: 'Weapon', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '4👊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Lapis Lazuli', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Sword of Isofar', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Topaz', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Golden Scythe', type: 'Weapon', city: 'Strofa', isFtIstra: false, stars: 3,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: 45, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Autumn Blaze', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Agate', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Silver Flame', type: 'Weapon', city: 'Razdor, Silny', isFtIstra: false, stars: 3,
    statBonus: '2👊', bonusChip: '❤︎', effect: null,
    craftCost: { Razdor: 42, Silny: 36 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Horn', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Autumn Blaze', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Swift Gale', type: 'Weapon', city: 'Silny', isFtIstra: false, stars: 3,
    statBonus: '2👊', bonusChip: 'Evade', effect: null,
    craftCost: 45, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Carapace', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Dogwood', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Star Blade', type: 'Weapon', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '4👊', bonusChip: '🗡️⛊', effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Star Fragment', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Jade Sword', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: 'Evade', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Peridot', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Sword of Truth', type: 'Weapon', city: 'Silny, Strofa', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: { Strofa: 52, Silny: 44 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 3, qty2R: 2, isSpeakingStone: false },
      { name: 'Rosewood', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Euphonic Edge', type: 'Weapon', city: 'Silny, Strofa', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: { Strofa: 52, Silny: 44 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Sky Splitter', type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '4👊', bonusChip: null, effect: null,
    craftCost: 75, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Carapace', qty: 3, qty2R: 2, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Glorious', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Star Quartz', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Revelation', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '6👊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Gold', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Coral', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Alloy Hand Axes', type: 'Weapon', city: 'Razdor, Silny', isFtIstra: false, stars: 2,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: { Razdor: 18, Silny: 15 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Ash', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Ornate Cleavers', type: 'Weapon', city: 'Strofa', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 48, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Horn', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Autumn Blaze', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Reckoning Tides', type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '4👊', bonusChip: '⛊⛊', effect: null,
    craftCost: 75, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Dogwood', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Dangerous Duo', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: '⛊⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Ancient Oak', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Carnelian', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Wind Cutters', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: 'Evade', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Ancient Oak', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Aventurine', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Hunter's Spear", type: 'Weapon', city: 'Mir, Silny', isFtIstra: false, stars: 2,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: { Mir: 14, Silny: 18 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Pine', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Iron', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Partisan', type: 'Weapon', city: 'Strofa', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 44, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Horn', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Ash', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Ryban Glaive', type: 'Weapon', city: 'Ryba', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 48, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Carapace', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Tenebris Shards', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Cedar', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Agate', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Cerulean Pike', type: 'Weapon', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '4👊', bonusChip: null, effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Lapis Lazuli', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Guardian Lance', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: '⛊⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Star Quartz', qty: 4, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Falmundian Bow', type: 'Weapon', city: 'Razdor', isFtIstra: false, stars: 1,
    statBonus: '1👊', bonusChip: null, effect: null,
    craftCost: 12, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Ash', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Silver Bow', type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 40, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Horn', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Autumn Blaze', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Dogwood', qty: 1, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: "Hunter's Pride", type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '4👊', bonusChip: null, effect: null,
    craftCost: 75, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Agate', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Drakonbow', type: 'Weapon', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '4👊', bonusChip: 'Evade', effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Vanguard's Promise", type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: '❤︎', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Black Diamond', qty: 3, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Silver Hammer', type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 2,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: 24, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rosewood', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Alloy Driver', type: 'Weapon', city: 'Mir', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 34, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Horn', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Autumn Blaze', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Golden Mallet', type: 'Weapon', city: 'Strofa', isFtIstra: false, stars: 4,
    statBonus: '4👊', bonusChip: null, effect: null,
    craftCost: 60, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Carapace', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Dogwood', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Gold', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Agate', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Ground Shaker', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: '⛊⛊', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Final Wish', type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: '❤︎', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Ancient Oak', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Gold', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Topaz', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Cerulean Staff', type: 'Weapon', city: 'Silny', isFtIstra: false, stars: 2,
    statBonus: '2👊', bonusChip: null, effect: null,
    craftCost: 20, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Pine', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Aquamarine', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Rosewind Staff', type: 'Weapon', city: 'Razdor', isFtIstra: false, stars: 3,
    statBonus: '3👊', bonusChip: null, effect: null,
    craftCost: 40, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Autumn Blaze', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Jade', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Forteller's Staff", type: 'Weapon', city: 'Vouno', isFtIstra: false, stars: 4,
    statBonus: '4👊', bonusChip: null, effect: null,
    craftCost: 56, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Dogwood', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Garnet', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Contorted Staff', type: 'Weapon', city: "Ft. Istra (Blacksmith)", isFtIstra: true, stars: 5,
    statBonus: '4👊', bonusChip: '❤︎', effect: null,
    craftCost: null, luxCost: 50, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Tenebris Shards', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Black Diamond', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: "Magi's Command", type: 'Weapon', city: "Ft. Istra (Baren's Forge)", isFtIstra: true, stars: 5,
    statBonus: '5👊', bonusChip: '1 AP', effect: null,
    craftCost: null, luxCost: 75, prereq: null, itemReq: null, limitedTo: ['Yana'],
    materials: [
      { name: 'Tenebris Skull', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 8, qty2R: null, isSpeakingStone: false },
      { name: 'Carnelian', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },

  // ── ACCESSORIES ──────────────────────────────────────────────────────────
  {
    name: 'Aegis Shield', type: 'Accessory', city: 'Ft. Istra (Anvil Artistry)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Each time a ⛊⛊ is drawn by this Guard, add ⛊+1 to bag.',
    craftCost: 50, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Cedar', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Ancient Oak', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Carapace Helmet', type: 'Accessory', city: 'Vouno', isFtIstra: false, stars: 2,
    statBonus: null, bonusChip: null,
    effect: 'Immune to red stun, and AP may not be exhausted by enemies.',
    craftCost: 28, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Carapace', qty: 1, qty2R: 1, isSpeakingStone: false },
      { name: 'Agate', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Chrono Locket', type: 'Accessory', city: 'Ft. Istra (The Cottage Smith)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Look through AI draw deck of 1 enemy, and choose 1 card to place on top.',
    craftCost: 85, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Gold', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Ancient Roots', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Chronos Boots', type: 'Accessory', city: 'Ft. Istra (The Cottage Smith)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Each time a 🗡️⛊ chip is drawn, gain Evade.',
    craftCost: 55, luxCost: null, prereq: 'Traveling Boots', itemReq: null, limitedTo: [],
    materials: [
      { name: 'Animal Hide', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Jade', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Cleansing Amulet', type: 'Accessory', city: 'Ft. Istra (Anvil Artistry)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Remove 1 Green AP from this Guard to remove 1 negative chip from both bags.',
    craftCost: 75, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Silver', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Jade', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Concealing Cloak', type: 'Accessory', city: 'Razdor', isFtIstra: false, stars: 2,
    statBonus: null, bonusChip: null,
    effect: 'While equipped, add 1 Evasion Chip to the event bag.',
    craftCost: 20, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [],
  },
  {
    name: 'Feathered Mantle', type: 'Accessory', city: 'Strofa', isFtIstra: false, stars: 2,
    statBonus: null, bonusChip: null,
    effect: "While equipped, add 1 purple Evasion Chip to Guard's bag.",
    craftCost: 30, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Feathers', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Goat Skull Mask', type: 'Accessory', city: 'Strofa', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'Once per turn, you may redraw 1 drawn chip.',
    craftCost: 15, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 1, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Leather Gauntlets', type: 'Accessory', city: 'Mir', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: "At the start of battle, add 1 👊+1 to Guard's bag.",
    craftCost: 14, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Claw', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Leather Gauntlets', type: 'Accessory', city: "Ft. Istra (The Brothers' Anvil)", isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: "At the start of battle, add 1 👊+1 to Guard's bag.",
    craftCost: 10, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Claw', qty: 1, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: "Nomad's Trap", type: 'Accessory', city: 'Silny', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'After an enemy attacks, that enemy exhausts 1 AP.',
    craftCost: 10, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Silver', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Pendant of Wisdom', type: 'Accessory', city: 'Ft. Istra (Anvil Artistry)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'While equipped gain 3 stone slots.',
    craftCost: 80, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Gold', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Agate', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 4, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Power Belt', type: 'Accessory', city: 'Ft. Istra (The Cottage Smith)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: "Each time a Yellow Stonebound ability is activated, add 1 👊+1 to Guard's bag.",
    craftCost: 70, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Gold', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Adamant', qty: 2, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Scale Shield', type: 'Accessory', city: 'Ryba', isFtIstra: false, stars: 3,
    statBonus: null, bonusChip: null,
    effect: "At the start of battle, add 3 ⛊+1 to Guard's bag.",
    craftCost: 36, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 4, qty2R: 2, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Scale Shield', type: 'Accessory', city: 'Ft. Istra (The Misty Forge)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: "At the start of battle, add 3 ⛊+1 to Guard's bag.",
    craftCost: 45, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Scales', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Iron', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Stonebound Talisman', type: 'Accessory', city: 'Ft. Istra (Anvil Artistry)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Whenever this Guard activates a Stonebound ability, heal ally by 1 ❤︎.',
    craftCost: 50, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Gold', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Crystal', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Diamond', qty: 4, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Traveling Boots', type: 'Accessory', city: 'Mir', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'During the exploration phase, you may mulligan once per node.',
    craftCost: 8, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 1, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Traveling Boots', type: 'Accessory', city: 'Ft. Istra (The Cottage Smith)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'During the exploration phase, you may mulligan once per node.',
    craftCost: 5, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 2, qty2R: null, isSpeakingStone: false },
      { name: 'Iron', qty: 1, qty2R: null, isSpeakingStone: false },
    ],
  },
  {
    name: 'Twilight Guantlet', type: 'Accessory', city: "Ft. Istra (The Brothers' Anvil)", isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Standard attacks heal this Guard by 1 ❤︎.',
    craftCost: 40, luxCost: null, prereq: 'Leather Gauntlets', itemReq: null, limitedTo: [],
    materials: [
      { name: 'Agate', qty: 4, qty2R: null, isSpeakingStone: false },
      { name: 'Obsidian', qty: 1, qty2R: null, isSpeakingStone: true },
    ],
  },
  {
    name: 'Wolf Head Tunic', type: 'Accessory', city: 'Silny', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: "At the start of battle, add 1 Bolster chip to Guard's bag.",
    craftCost: 10, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Wolf Pelt', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Wolf Tooth Ring', type: 'Accessory', city: 'Ryba, Silny', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'Negate 2 red chips per battle.',
    craftCost: 8, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },

  // ── ITEMS ─────────────────────────────────────────────────────────────────
  {
    name: 'Barrier Tonic', type: 'Item', city: 'Ft. Istra (Apothecary)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Add 5 ⛊+1 to both bags.',
    craftCost: null, luxCost: null, prereq: null,
    itemReq: 'Coastal Bluecaps, Midnight Hydrangea', limitedTo: [],
    materials: [],
  },
  {
    name: 'Bottled Courage', type: 'Item', city: 'Ft. Istra (Apothecary)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'This Guard gains 2 👊+1 and 2 blue defense cubes.',
    craftCost: null, luxCost: null, prereq: null,
    itemReq: 'Coastal Bluecaps, Falmundian Rosehips', limitedTo: [],
    materials: [],
  },
  {
    name: 'Expanded Satchel', type: 'Item', city: 'Strofa', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'Equip to satchel slot. Store up to 4 cards underneath this card.',
    craftCost: 10, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Rough Leather', qty: 4, qty2R: 2, isSpeakingStone: false },
    ],
  },
  {
    name: 'Invigorating Potion', type: 'Item', city: 'Ft. Istra (Apothecary)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Gain 2 green AP.',
    craftCost: null, luxCost: null, prereq: null,
    itemReq: 'Midnight Hydrangea, Purifying Seed', limitedTo: [],
    materials: [],
  },
  {
    name: 'Purifying Dust', type: 'Item', city: 'Ft. Istra (Apothecary)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Remove all negative chips from both bags.',
    craftCost: null, luxCost: null, prereq: null,
    itemReq: 'Purifying Seed x2', limitedTo: [],
    materials: [],
  },
  {
    name: 'Ruinous Dust', type: 'Item', city: 'Ft. Istra (Apothecary)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: 'Add 2 ⛊-1 to all enemies.',
    craftCost: null, luxCost: null, prereq: null,
    itemReq: 'Ruinous Seed x2', limitedTo: [],
    materials: [],
  },
  {
    name: 'Smoke Bomb', type: 'Item', city: 'Silny, Strofa', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'Both Guards gain 2 Evasion Chips.',
    craftCost: { Strofa: 10, Silny: 8 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 1, qty2R: 1, isSpeakingStone: false },
      { name: 'Iron', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: 'Tent', type: 'Item', city: 'Silny, Strofa', isFtIstra: false, stars: 1,
    statBonus: null, bonusChip: null,
    effect: 'Create a save point at current node and heal both Guards by 10 ❤︎.',
    craftCost: { Strofa: 15, Silny: 10 }, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
    materials: [
      { name: 'Animal Hide', qty: 1, qty2R: 1, isSpeakingStone: false },
      { name: 'Rosewood', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
  {
    name: "Zoya's Elixir", type: 'Item', city: 'Ft. Istra (Apothecary)', isFtIstra: true, stars: 5,
    statBonus: null, bonusChip: null,
    effect: "Add 5 green ❤︎ to this Guard's bag.",
    craftCost: null, luxCost: null, prereq: null,
    itemReq: 'Midnight Hydrangea, Health Potion', limitedTo: [],
    materials: [
      { name: 'Metal Frag.', qty: 2, qty2R: 1, isSpeakingStone: false },
      { name: 'Silver', qty: 2, qty2R: 1, isSpeakingStone: false },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimum Sil cost across all cities for a recipe (null if no Sil cost)
export function minCraftCost(recipe) {
  if (recipe.craftCost === null) return null;
  if (typeof recipe.craftCost === 'number') return recipe.craftCost;
  return Math.min(...Object.values(recipe.craftCost));
}

// Sil cost for a specific city (falls back to flat cost or null)
export function craftCostForCity(recipe, cityName) {
  if (recipe.craftCost === null) return null;
  if (typeof recipe.craftCost === 'number') return recipe.craftCost;
  return recipe.craftCost[cityName] ?? null;
}

// All city names where a recipe can be crafted
export function craftCities(recipe) {
  if (!recipe.craftCost && !recipe.luxCost) return [];
  const cityStr = recipe.city;
  return cityStr.split(',').map(s => s.trim()).filter(Boolean);
}

// Whether a recipe is available in a given city
export function availableInCity(recipe, cityName) {
  return craftCities(recipe).some(c => c === cityName);
}

// Craftability check given current stash, sil, lux, and optional city context.
// selectedCity: string | null — if set, checks cost for that city only and
//   applies qty2R quantities when that city has prestige >= 2.
// cityPrestige: number — prestige of selectedCity (ignored if selectedCity is null).
// Returns: 'ready' | 'partial' | 'missing'
export function craftStatus(recipe, stash, sil, lux, selectedCity = null, cityPrestigeLevel = 0) {
  const useDiscount = selectedCity !== null && cityPrestigeLevel >= 2 && !recipe.isFtIstra;
  const mats = recipe.materials;

  if (mats.length === 0 && !recipe.craftCost && !recipe.luxCost) {
    return recipe.itemReq ? 'partial' : 'missing';
  }

  let totalNeeded = mats.length;
  let totalHave = 0;
  for (const mat of mats) {
    const needed = (useDiscount && mat.qty2R !== null) ? mat.qty2R : mat.qty;
    if ((stash[mat.name] ?? 0) >= needed) totalHave++;
  }

  const costOk = checkCost(recipe, sil, lux, selectedCity);
  const allMatsOk = totalHave === totalNeeded;

  if (allMatsOk && costOk) return 'ready';
  if (totalHave > 0) return 'partial';
  return 'missing';
}

function checkCost(recipe, sil, lux, selectedCity) {
  if (recipe.luxCost !== null && recipe.luxCost !== undefined) {
    return lux >= recipe.luxCost;
  }
  if (recipe.craftCost !== null && recipe.craftCost !== undefined) {
    const cost = selectedCity !== null
      ? craftCostForCity(recipe, selectedCity)
      : minCraftCost(recipe);
    if (cost === null) return true;
    return sil >= cost;
  }
  return true;
}

// Shortage count — number of distinct materials where stash < needed
export function shortageCount(recipe, stash, useDiscount = false) {
  return recipe.materials.filter(m => {
    const needed = (useDiscount && m.qty2R !== null) ? m.qty2R : m.qty;
    return (stash[m.name] ?? 0) < needed;
  }).length;
}

// Maps each item name that is a prerequisite to the next recipe it unlocks.
export const PREREQ_UPGRADES_TO = (() => {
  const map = {};
  for (const r of RECIPES) {
    if (!r.prereq) continue;
    const existing = map[r.prereq];
    if (!existing || r.stars < existing.stars) {
      map[r.prereq] = { name: r.name, stars: r.stars, isFtIstra: r.isFtIstra };
    }
  }
  return map;
})();
