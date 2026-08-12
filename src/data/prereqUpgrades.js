// src/data/prereqUpgrades.js
//
// Maps each item name that is a `prereq` of some recipe to the lowest-star
// recipe it unlocks. StashTab renders it as the inline "→ Item Name ★★★"
// upgrade hint beside a held item.
//
// This is DERIVED data, committed as a literal rather than computed from
// RECIPES at module load — and that is the whole point of the file. StashTab is
// one of the three eagerly-bundled tabs, so importing this map from recipes.js
// pulled all 101 recipes (≈39 kB raw / 4.9 kB gzip) into the entry chunk to
// serve an eleven-entry lookup. Extracted, recipes.js follows CraftTab into its
// own lazily-loaded chunk.
//
// The derivation rule itself is NOT duplicated: `derivePrereqUpgrades` in
// recipes.js is still the single implementation, and `recipes.test.js` asserts
// this literal deep-equals its output over the live RECIPES array. If you add
// or retier a recipe with a `prereq`, that test fails and prints the diff —
// paste the new value in here rather than reaching for the derivation at
// runtime, which would put recipes.js back on the critical path.
//
// Shape: prereq item name → { name, stars, isFtIstra } of the unlocked recipe.
export const PREREQ_UPGRADES_TO = {
  "Guard's Tunic": { name: "Reinforced Tunic", stars: 2, isFtIstra: false },
  "Reinforced Tunic": { name: "Bear Tunic", stars: 2, isFtIstra: false },
  "Horned Cuirass": { name: "Guard's Armor", stars: 4, isFtIstra: false },
  "Iron Short Sword": { name: "Alloy Short Sword", stars: 2, isFtIstra: false },
  "Captain's Blade": { name: "Volk Blade", stars: 1, isFtIstra: false },
  "Iron Hand Axes": { name: "Alloy Hand Axes", stars: 2, isFtIstra: false },
  "Guard's Spear": { name: "Hunter's Spear", stars: 2, isFtIstra: false },
  "Long Bow": { name: "Falmundian Bow", stars: 1, isFtIstra: false },
  "Iron Hammer": { name: "Silver Hammer", stars: 2, isFtIstra: false },
  "Traveling Boots": { name: "Chronos Boots", stars: 5, isFtIstra: true },
  "Leather Gauntlets": { name: "Twilight Guantlet", stars: 5, isFtIstra: true },
};
