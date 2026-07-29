/**
 * recipes.test.js
 *
 * Unit tests for the pure recipe/crafting helpers in src/data/recipes.js.
 * Pure functions, no React, no localStorage — low effort, high regression
 * value: 101 recipes with city-specific pricing, the prestige-discount math
 * (qty vs qty2R), combined stash+satchel inventory, and guard-restricted
 * filtering all live here.
 */
import { describe, it, expect } from 'vitest';
import {
  RECIPES,
  minCraftCost,
  craftCostForCity,
  craftCities,
  availableInCity,
  craftStatus,
  shortageCount,
  buildCombined,
  parseItemReq,
  PREREQ_UPGRADES_TO,
} from './recipes';
import { ALL_MATERIALS } from './materials';

// ─── Test fixtures ───────────────────────────────────────────────────────────

// Guard's Tunic: standard recipe, Mir only, flat 10 sil, 2 mats with discount.
const tunic = RECIPES.find(r => r.name === "Guard's Tunic");

// Reinforced Tunic: multi-city with per-city pricing.
const reinforced = RECIPES.find(r => r.name === 'Reinforced Tunic');

// Raiding Armor: Ft. Istra endgame, no sil cost, 50 lux, qty2R null.
const raidingArmor = RECIPES.find(r => r.name === 'Raiding Armor');

// Barrier Tonic: Ft. Istra Apothecary — no materials, no sil/lux cost. The whole
// requirement is its itemReq string ("Coastal Bluecaps, Midnight Hydrangea").
const barrierTonic = RECIPES.find(r => r.name === 'Barrier Tonic');

// Purifying Dust: same shape, but its itemReq carries a quantity ("Purifying Seed x2").
const purifyingDust = RECIPES.find(r => r.name === 'Purifying Dust');

// Zoya's Elixir: the only recipe with BOTH materials and an itemReq.
const zoyasElixir = RECIPES.find(r => r.name === "Zoya's Elixir");

function fullStash(recipe) {
  const stash = {};
  for (const mat of recipe.materials) {
    stash[mat.name] = mat.qty * 10;
  }
  return stash;
}

function emptyStash() {
  return {};
}

// ─── minCraftCost ────────────────────────────────────────────────────────────

describe('minCraftCost', () => {
  it('returns the flat cost for a number-typed recipe', () => {
    expect(minCraftCost(tunic)).toBe(10);
  });

  it('returns the minimum of per-city costs for an object-typed recipe', () => {
    // Reinforced Tunic: Razdor 20, Silny 20, Ryba 15 → min 15
    expect(minCraftCost(reinforced)).toBe(15);
  });

  it('returns null when there is no sil cost (lux-only or free)', () => {
    expect(minCraftCost(raidingArmor)).toBe(null);
  });
});

// ─── craftCostForCity ────────────────────────────────────────────────────────

describe('craftCostForCity', () => {
  it('returns the per-city cost for a multi-city recipe', () => {
    expect(craftCostForCity(reinforced, 'Ryba')).toBe(15);
    expect(craftCostForCity(reinforced, 'Razdor')).toBe(20);
  });

  it('returns null for a city not in the recipe', () => {
    expect(craftCostForCity(reinforced, 'Mir')).toBe(null);
  });

  it('returns the flat cost for a number-typed recipe regardless of city', () => {
    expect(craftCostForCity(tunic, 'Mir')).toBe(10);
    expect(craftCostForCity(tunic, 'Razdor')).toBe(10);
  });

  it('returns null for lux-only recipes', () => {
    expect(craftCostForCity(raidingArmor, 'Mir')).toBe(null);
  });
});

// ─── craftCities ─────────────────────────────────────────────────────────────

describe('craftCities', () => {
  it('returns a single-element array for a single-city recipe', () => {
    expect(craftCities(tunic)).toEqual(['Mir']);
  });

  it('splits and trims a multi-city city field', () => {
    expect(craftCities(reinforced)).toEqual(['Razdor', 'Ryba', 'Silny']);
  });

  it('returns an empty array for a recipe with no cost field', () => {
    const free = { name: 'x', type: 'Item', city: '', isFtIstra: false, stars: 1,
      craftCost: null, luxCost: null, prereq: null, itemReq: null, limitedTo: [], materials: [] };
    expect(craftCities(free)).toEqual([]);
  });
});

// ─── availableInCity ─────────────────────────────────────────────────────────

describe('availableInCity', () => {
  it('returns true for a city in the recipe', () => {
    expect(availableInCity(tunic, 'Mir')).toBe(true);
  });

  it('returns false for a city not in the recipe', () => {
    expect(availableInCity(tunic, 'Razdor')).toBe(false);
  });
});

// ─── craftStatus ─────────────────────────────────────────────────────────────

describe('craftStatus', () => {
  describe('basic material satisfaction', () => {
    it('returns "ready" when all materials and sil are satisfied', () => {
      expect(craftStatus(tunic, fullStash(tunic), 100, 0, null, 0)).toBe('ready');
    });

    it('returns "partial" when at least one material is present but not all', () => {
      const stash = { 'Metal Frag.': 2 }; // missing 'Rough Leather'
      expect(craftStatus(tunic, stash, 100, 0, null, 0)).toBe('partial');
    });

    it('returns "missing" when no required materials are in stash', () => {
      expect(craftStatus(tunic, emptyStash(), 100, 0, null, 0)).toBe('missing');
    });

    it('returns "partial" when all materials are satisfied but sil is short', () => {
      // All mat types are met (so totalHave === totalNeeded), but costOk is false
      // because sil is short. The function falls through to "partial" because at
      // least one material type is supplied. This means: "ready to craft, just
      // need more sil."
      expect(craftStatus(tunic, fullStash(tunic), 5, 0, null, 0)).toBe('partial');
    });

    it('returns "ready" only when both materials and sil are satisfied', () => {
      // Full mats, exactly enough sil
      expect(craftStatus(tunic, fullStash(tunic), 10, 0, null, 0)).toBe('ready');
    });
  });

  describe('Ft. Istra lux cost gating', () => {
    it('returns "ready" when lux is sufficient for a lux-only recipe', () => {
      expect(craftStatus(raidingArmor, fullStash(raidingArmor), 0, 100, null, 0)).toBe('ready');
    });

    it('returns "partial" when all materials are satisfied but lux is short', () => {
      // Raiding Armor needs 50 lux, we have 10. All mats are met, so partial.
      expect(craftStatus(raidingArmor, fullStash(raidingArmor), 0, 10, null, 0)).toBe('partial');
    });

    it('returns "missing" when no materials are present even if lux is plentiful', () => {
      expect(craftStatus(raidingArmor, emptyStash(), 0, 100, null, 0)).toBe('missing');
    });

    it('does not require any sil for lux-only recipes', () => {
      // Zero sil, plenty of lux → still ready.
      expect(craftStatus(raidingArmor, fullStash(raidingArmor), 0, 100, null, 0)).toBe('ready');
    });
  });

  describe('city-specific cost', () => {
    it('uses minCraftCost when no city is selected', () => {
      // Reinforced Tunic: min cost is 15 (Ryba). With 15 sil + full mats → ready.
      expect(craftStatus(reinforced, fullStash(reinforced), 15, 0, null, 0)).toBe('ready');
    });

    it('uses the selected city\'s cost when one is set', () => {
      // Razdor is 20 sil. With 20 sil → ready. With 15 sil → partial (mats met, cost short).
      expect(craftStatus(reinforced, fullStash(reinforced), 20, 0, 'Razdor', 0)).toBe('ready');
      expect(craftStatus(reinforced, fullStash(reinforced), 15, 0, 'Razdor', 0)).toBe('partial');
    });

    it('treats city-not-in-recipe as no sil cost (costOk=true), and reports the missing mats', () => {
      // Mir is not a valid city for Reinforced Tunic → cost is null → costOk=true.
      // But mats are still checked, so empty stash → missing.
      expect(craftStatus(reinforced, emptyStash(), 0, 0, 'Mir', 0)).toBe('missing');
    });
  });

  describe('prestige discount (qty2R)', () => {
    it('uses qty2R when selectedCity has prestige ≥ 2 and recipe is not Ft. Istra', () => {
      // Tunic: Metal Frag. qty 2 / qty2R 1, Rough Leather qty 4 / qty2R 2.
      // Discount city, prestige 2 → needs 1 Metal Frag. + 2 Rough Leather.
      const stash = { 'Metal Frag.': 1, 'Rough Leather': 2 };
      expect(craftStatus(tunic, stash, 100, 0, 'Mir', 2)).toBe('ready');
    });

    it('does NOT use the discount when prestige is below 2', () => {
      // Same stash (1 Metal, 2 Leather) but prestige 1 → needs full qty (2, 4).
      // Neither material type is fully supplied, so the function returns 'missing'.
      // (The function only counts a material as "have" if stash >= required qty
      // — partial supplies don't register as "partial" status.)
      const stash = { 'Metal Frag.': 1, 'Rough Leather': 2 };
      expect(craftStatus(tunic, stash, 100, 0, 'Mir', 1)).toBe('missing');
    });

    it('does NOT use the discount for Ft. Istra recipes (isFtIstra forces full qty)', () => {
      // Raiding Armor has qty2R=null on all mats. Even at prestige 5, full qty is
      // required. We give only some mats to confirm missing.
      const stash = { 'Scales': 0, 'Carapace': 0, 'Diamond': 0 };
      expect(craftStatus(raidingArmor, stash, 0, 100, 'Mir', 5)).toBe('missing');
    });

    it('does NOT use the discount when no city is selected', () => {
      // Stash with just qty2R amounts (1 Metal, 2 Leather) — without discount path
      // the full qty (2, 4) is needed; neither is fully supplied → 'missing'.
      const stash = { 'Metal Frag.': 1, 'Rough Leather': 2 };
      expect(craftStatus(tunic, stash, 100, 0, null, 5)).toBe('missing');
    });

    it('uses full qty for Ft. Istra recipes with non-null qty2R (data quirk)', () => {
      // The discount is gated on !recipe.isFtIstra, so isFtIstra recipes never
      // use qty2R regardless of what the data says. Verify by giving a stash
      // that meets qty2R but not qty, and confirming the recipe is NOT ready
      // at prestige 5.
      // Raiding Armor mats: Scales 4, Carapace 2, Diamond 2. Give half of each
      // (Scales 2, Carapace 1, Diamond 1) — would be ready under discount, but
      // isFtIstra blocks it. None of the per-type requirements are met → missing.
      const stash = { 'Scales': 2, 'Carapace': 1, 'Diamond': 1 };
      expect(craftStatus(raidingArmor, stash, 0, 100, 'Mir', 5)).toBe('missing');
    });
  });

  describe('material with no discount (qty2R null) on a normal recipe', () => {
    it('still requires the full qty even at prestige 2', () => {
      // Hand-crafted recipe with one material having qty2R=null.
      const weird = {
        name: 'Test', type: 'Item', city: 'Mir', isFtIstra: false, stars: 1,
        craftCost: 5, luxCost: null, prereq: null, itemReq: null, limitedTo: [],
        materials: [
          { name: 'X', qty: 2, qty2R: null, isSpeakingStone: false },
        ],
      };
      // 1 unit is not enough even at prestige 2 (qty2R is null → use qty=2).
      // Stash with 1 X → 0 mat types satisfied → missing.
      expect(craftStatus(weird, { X: 1 }, 100, 0, 'Mir', 2)).toBe('missing');
      expect(craftStatus(weird, { X: 2 }, 100, 0, 'Mir', 2)).toBe('ready');
    });
  });
});

// ─── parseItemReq (AVE-782) ──────────────────────────────────────────────────

describe('parseItemReq', () => {
  it('parses a comma-separated list as qty 1 each', () => {
    expect(parseItemReq('Coastal Bluecaps, Midnight Hydrangea')).toEqual([
      { name: 'Coastal Bluecaps', qty: 1 },
      { name: 'Midnight Hydrangea', qty: 1 },
    ]);
  });

  it('parses a trailing xN suffix as a quantity', () => {
    expect(parseItemReq('Purifying Seed x2')).toEqual([{ name: 'Purifying Seed', qty: 2 }]);
  });

  it('trims surrounding whitespace from names', () => {
    expect(parseItemReq('  Jade  ,   Onyx  ')).toEqual([
      { name: 'Jade', qty: 1 },
      { name: 'Onyx', qty: 1 },
    ]);
  });

  it('returns [] for null, undefined and empty input', () => {
    expect(parseItemReq(null)).toEqual([]);
    expect(parseItemReq(undefined)).toEqual([]);
    expect(parseItemReq('')).toEqual([]);
  });

  it('every parsed name across all recipes is a known material', () => {
    // The parser is only safe to check against the stash because each name it
    // produces is a real stash key. Guards the whole class of "requirement can
    // never be satisfied" bugs (cf. AVE-543).
    for (const recipe of RECIPES.filter(r => r.itemReq)) {
      for (const req of parseItemReq(recipe.itemReq)) {
        expect(ALL_MATERIALS, `${recipe.name} → ${req.name}`).toContain(req.name);
        expect(req.qty).toBeGreaterThan(0);
      }
    }
  });
});

// ─── craftStatus + itemReq (AVE-782 / AVE-783) ───────────────────────────────

describe('craftStatus with itemReq', () => {
  describe('apothecary recipes (no materials, no cost) — AVE-782', () => {
    it('returns "missing" when no required items are in stash', () => {
      expect(craftStatus(barrierTonic, emptyStash(), 9999, 9999, null, 0)).toBe('missing');
    });

    it('returns "partial" when only some required items are in stash', () => {
      expect(craftStatus(barrierTonic, { 'Coastal Bluecaps': 1 }, 0, 0, null, 0)).toBe('partial');
    });

    it('returns "ready" when every required item is in stash', () => {
      const stash = { 'Coastal Bluecaps': 1, 'Midnight Hydrangea': 1 };
      expect(craftStatus(barrierTonic, stash, 0, 0, null, 0)).toBe('ready');
    });

    it('honors the xN quantity in the requirement', () => {
      // Purifying Dust needs Purifying Seed ×2 and nothing else. One seed does
      // not satisfy its single requirement, and — consistently with how
      // materials are counted — a partially-supplied requirement does not
      // register as "have", so the status is 'missing' rather than 'partial'.
      expect(craftStatus(purifyingDust, { 'Purifying Seed': 1 }, 0, 0, null, 0)).toBe('missing');
      expect(craftStatus(purifyingDust, { 'Purifying Seed': 2 }, 0, 0, null, 0)).toBe('ready');
    });

    it('lets every Apothecary recipe reach "ready" once its items are stocked', () => {
      // Before AVE-782 these five returned a constant 'partial' and could never
      // appear under the "Can craft" filter.
      const apothecary = RECIPES.filter(
        r => r.materials.length === 0 && !r.craftCost && !r.luxCost && r.itemReq
      );
      expect(apothecary.length).toBeGreaterThan(0);
      for (const recipe of apothecary) {
        const stash = {};
        for (const req of parseItemReq(recipe.itemReq)) stash[req.name] = req.qty;
        expect(craftStatus(recipe, stash, 0, 0, null, 0), recipe.name).toBe('ready');
      }
    });
  });

  describe('recipes with both materials and an itemReq — AVE-783', () => {
    it('is NOT "ready" when the materials are satisfied but the items are not', () => {
      // The regression: this returned 'ready' and the card promised a craft the
      // player could not make.
      expect(craftStatus(zoyasElixir, fullStash(zoyasElixir), 9999, 9999, null, 0)).toBe('partial');
    });

    it('is "ready" only when materials AND required items are satisfied', () => {
      const stash = { ...fullStash(zoyasElixir), 'Midnight Hydrangea': 1, 'Health Potion': 1 };
      expect(craftStatus(zoyasElixir, stash, 9999, 9999, null, 0)).toBe('ready');
    });

    it('is "partial" when the items are satisfied but the materials are not', () => {
      const stash = { 'Midnight Hydrangea': 1, 'Health Potion': 1 };
      expect(craftStatus(zoyasElixir, stash, 9999, 9999, null, 0)).toBe('partial');
    });
  });

  describe('recipes without an itemReq are unaffected', () => {
    it('returns the same status as before for a plain recipe', () => {
      expect(craftStatus(tunic, fullStash(tunic), 100, 0, null, 0)).toBe('ready');
      expect(craftStatus(tunic, emptyStash(), 100, 0, null, 0)).toBe('missing');
    });

    it('still applies the prestige discount to materials', () => {
      const stash = { 'Metal Frag.': 1, 'Rough Leather': 2 };
      expect(craftStatus(tunic, stash, 100, 0, 'Mir', 2)).toBe('ready');
      expect(craftStatus(tunic, stash, 100, 0, 'Mir', 1)).toBe('missing');
    });
  });
});

// ─── shortageCount ───────────────────────────────────────────────────────────

describe('shortageCount', () => {
  it('returns 0 when all materials are satisfied', () => {
    expect(shortageCount(tunic, fullStash(tunic))).toBe(0);
  });

  it('counts materials that are missing', () => {
    expect(shortageCount(tunic, emptyStash())).toBe(2);
  });

  it('counts materials that are partially supplied', () => {
    // Tunic needs 2 Metal Frag. and 4 Rough Leather. We have 1 and 4 → 1 short.
    const stash = { 'Metal Frag.': 1, 'Rough Leather': 4 };
    expect(shortageCount(tunic, stash)).toBe(1);
  });

  it('respects the useDiscount flag', () => {
    // 1 Metal Frag. is enough with discount (qty2R=1) but not without (qty=2).
    const stash = { 'Metal Frag.': 1, 'Rough Leather': 4 };
    expect(shortageCount(tunic, stash, false)).toBe(1);
    expect(shortageCount(tunic, stash, true)).toBe(0);
  });

  it('counts short required items alongside materials (AVE-783)', () => {
    expect(shortageCount(zoyasElixir, emptyStash())).toBe(zoyasElixir.materials.length + 2);
  });

  it('does not count required items that are satisfied', () => {
    const stash = { 'Midnight Hydrangea': 1, 'Health Potion': 1 };
    expect(shortageCount(zoyasElixir, stash)).toBe(zoyasElixir.materials.length);
  });

  it('counts required items for a materials-free apothecary recipe', () => {
    expect(shortageCount(barrierTonic, emptyStash())).toBe(2);
    expect(shortageCount(barrierTonic, { 'Coastal Bluecaps': 1, 'Midnight Hydrangea': 1 })).toBe(0);
  });
});

// ─── buildCombined ───────────────────────────────────────────────────────────

describe('buildCombined', () => {
  it('returns the stash unchanged when there are no guards', () => {
    expect(buildCombined({ Iron: 3 }, [])).toEqual({ Iron: 3 });
  });

  it('returns an empty object for empty inputs', () => {
    expect(buildCombined({}, [])).toEqual({});
  });

  it('sums guard satchel items with stash', () => {
    const stash = { Iron: 3 };
    const guards = [
      { satchel: [{ item: 'Iron', qty: 2 }, { item: '', qty: 1 }] },
    ];
    expect(buildCombined(stash, guards)).toEqual({ Iron: 5 });
  });

  it('adds new items from satchel not present in stash', () => {
    const guards = [
      { satchel: [{ item: 'Wood', qty: 4 }] },
    ];
    expect(buildCombined({}, guards)).toEqual({ Wood: 4 });
  });

  it('aggregates across multiple guards', () => {
    const guards = [
      { satchel: [{ item: 'Iron', qty: 1 }, { item: 'Wood', qty: 2 }] },
      { satchel: [{ item: 'Iron', qty: 2 }, { item: 'Stone', qty: 1 }] },
    ];
    expect(buildCombined({ Iron: 5 }, guards)).toEqual({ Iron: 8, Wood: 2, Stone: 1 });
  });

  it('skips empty satchel slots', () => {
    const guards = [
      { satchel: [{ item: '', qty: 99 }, { item: 'Iron', qty: 1 }, { item: '', qty: 5 }] },
    ];
    expect(buildCombined({}, guards)).toEqual({ Iron: 1 });
  });

  it('tolerates a guard with no satchel field', () => {
    const guards = [{ /* no satchel */ }, { satchel: [{ item: 'Iron', qty: 1 }] }];
    expect(buildCombined({}, guards)).toEqual({ Iron: 1 });
  });

  it('does not mutate the input stash', () => {
    const stash = { Iron: 3 };
    const guards = [{ satchel: [{ item: 'Iron', qty: 1 }] }];
    buildCombined(stash, guards);
    expect(stash).toEqual({ Iron: 3 });
  });

  it('respects expandedSatchel — collapsed guard ignores hidden slots', () => {
    const guard = {
      expandedSatchel: false,
      satchel: [
        { item: 'Iron', qty: 2 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
        { item: 'Iron', qty: 4 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
      ],
    };
    expect(buildCombined({}, [guard])).toEqual({ Iron: 2 });
  });

  it('respects expandedSatchel — expanded guard counts all slots', () => {
    const guard = {
      expandedSatchel: true,
      satchel: [
        { item: 'Iron', qty: 2 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
        { item: 'Iron', qty: 4 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
        { item: '', qty: 1 },
      ],
    };
    expect(buildCombined({}, [guard])).toEqual({ Iron: 6 });
  });
});

// ─── PREREQ_UPGRADES_TO ──────────────────────────────────────────────────────

describe('PREREQ_UPGRADES_TO', () => {
  it('is a non-empty object', () => {
    expect(typeof PREREQ_UPGRADES_TO).toBe('object');
    expect(Object.keys(PREREQ_UPGRADES_TO).length).toBeGreaterThan(0);
  });

  it('maps each prereq to { name, stars, isFtIstra }', () => {
    for (const [prereq, target] of Object.entries(PREREQ_UPGRADES_TO)) {
      expect(typeof prereq).toBe('string');
      expect(target).toHaveProperty('name');
      expect(target).toHaveProperty('stars');
      expect(target).toHaveProperty('isFtIstra');
      expect(typeof target.name).toBe('string');
      expect(typeof target.stars).toBe('number');
      expect(typeof target.isFtIstra).toBe('boolean');
    }
  });

  it('maps Guard\'s Tunic (a 1-star prereq) to the lowest-star recipe requiring it', () => {
    // Guard's Tunic is the prereq for Reinforced Tunic (2★) AND Hero's Armor (4★).
    // The map keeps the lowest-star entry, so it should point to Reinforced Tunic.
    expect(PREREQ_UPGRADES_TO["Guard's Tunic"]).toEqual({
      name: 'Reinforced Tunic', stars: 2, isFtIstra: false,
    });
  });

  it('maps Horned Cuirass (a 3-star prereq)', () => {
    // Horned Cuirass is a prereq for Guard's Armor (4 stars).
    expect(PREREQ_UPGRADES_TO['Horned Cuirass']).toEqual({
      name: "Guard's Armor", stars: 4, isFtIstra: false,
    });
  });

  it('does not contain entries for items that are not prereqs', () => {
    // "Iron" is a material, not a prereq of any recipe.
    expect(PREREQ_UPGRADES_TO).not.toHaveProperty('Iron');
  });
});

// ─── RECIPES data integrity ──────────────────────────────────────────────────

describe('RECIPES data integrity', () => {
  it('every recipe has the required shape', () => {
    for (const r of RECIPES) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('type');
      expect(r).toHaveProperty('city');
      expect(r).toHaveProperty('isFtIstra');
      expect(r).toHaveProperty('stars');
      expect(r).toHaveProperty('materials');
      expect(Array.isArray(r.materials)).toBe(true);
    }
  });

  it('every recipe material name is a known material in ALL_MATERIALS', () => {
    for (const recipe of RECIPES) {
      for (const mat of recipe.materials) {
        expect(ALL_MATERIALS, `${recipe.name} → ${mat.name}`).toContain(mat.name);
      }
    }
  });

  it('every recipe itemReq name is a known material in ALL_MATERIALS', () => { for (const recipe of RECIPES) { for (const req of parseItemReq(recipe.itemReq)) { expect(ALL_MATERIALS, `${recipe.name} → ${req.name}`).toContain(req.name); } } });

  it('every material entry has name, qty, qty2R, isSpeakingStone', () => {
    for (const r of RECIPES) {
      for (const m of r.materials) {
        expect(m).toHaveProperty('name');
        expect(m).toHaveProperty('qty');
        expect(m).toHaveProperty('qty2R');
        expect(m).toHaveProperty('isSpeakingStone');
        expect(typeof m.qty).toBe('number');
      }
    }
  });

  it('most Ft. Istra recipes have qty2R === null on all materials', () => {
    // The discount path is gated on !isFtIstra, so any non-null qty2R on an Ft.
    // Istra recipe is data that has no effect. This test documents the current
    // data shape — at most a handful of Ft. Istra recipes (e.g. "Zoya's Elixir")
    // have stray non-null qty2R values that simply go unused.
    let totalFtIstraMats = 0;
    let nonNullCount     = 0;
    for (const r of RECIPES.filter(r => r.isFtIstra)) {
      for (const m of r.materials) {
        totalFtIstraMats++;
        if (m.qty2R !== null) nonNullCount++;
      }
    }
    expect(totalFtIstraMats).toBeGreaterThan(0);
    // The vast majority should be null. Allow a small number of stragglers.
    expect(nonNullCount).toBeLessThan(5);
  });

  it('every recipe has either a craftCost, a luxCost, or an itemReq (or some materials)', () => {
    // Loose sanity check: a recipe should never be entirely empty.
    for (const r of RECIPES) {
      const hasSomething = r.materials.length > 0
                        || r.craftCost !== null
                        || r.luxCost   !== null
                        || r.itemReq   !== null;
      expect(hasSomething).toBe(true);
    }
  });
});
