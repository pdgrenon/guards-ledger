// src/data/search.js
// Pure, read-only cross-dataset search powering the global search overlay.
// Searches recipes, materials, enemies, encounters, and cities in one pass.
// Live state (stash counts, city quest progress) is passed in; everything else
// is static module data, so the only per-call work is the filtering itself.

import { RECIPES } from './recipes';
import { ALL_MATERIALS, MATERIAL_SOURCES, ENEMIES } from './materials';
import { TRAINING_YARD_FIGHTS, SPIRIT_BOSSES } from './encounters';

// Reverse index: enemy name → sorted list of materials that list it as a drop.
// MATERIAL_SOURCES maps item → { enemies: [...] }; we invert it once at load.
const ENEMY_DROP_MAP = (() => {
  const map = {};
  for (const [item, src] of Object.entries(MATERIAL_SOURCES)) {
    if (!src?.enemies) continue;
    for (const enemy of src.enemies) {
      (map[enemy] ??= []).push(item);
    }
  }
  for (const key of Object.keys(map)) map[key].sort();
  return map;
})();

export function enemyDrops(name) {
  return ENEMY_DROP_MAP[name] ?? [];
}

// Every name we treat as a "material" for search: predefined materials plus any
// item that has source data (some sellable/quest items live only in SOURCES).
const MATERIAL_NAMES = [...new Set([...ALL_MATERIALS, ...Object.keys(MATERIAL_SOURCES)])].sort();

export const MIN_QUERY_LENGTH = 2;
const PER_GROUP_LIMIT = 8;

function includes(haystack, needle) {
  return haystack != null && haystack.toLowerCase().includes(needle);
}

// Returns null when the query is too short to search; otherwise a grouped result
// object. `total` is the combined count across all groups (0 = searched, no hits).
export function searchAll(rawQuery, { stash = {}, cities = [] } = {}) {
  const q = (rawQuery ?? '').trim().toLowerCase();
  if (q.length < MIN_QUERY_LENGTH) return null;

  const recipes = RECIPES.filter(r =>
    includes(r.name, q) ||
    includes(r.city, q) ||
    includes(r.prereq, q) ||
    r.materials.some(m => includes(m.name, q))
  ).slice(0, PER_GROUP_LIMIT);

  const materials = MATERIAL_NAMES
    .filter(name => includes(name, q))
    .slice(0, PER_GROUP_LIMIT)
    .map(name => ({ name, count: stash[name] ?? 0 }));

  const enemies = ENEMIES
    .filter(name => includes(name, q) || enemyDrops(name).some(d => includes(d, q)))
    .slice(0, PER_GROUP_LIMIT)
    .map(name => ({ name, drops: enemyDrops(name) }));

  const matchEncounter = f =>
    includes(f.name, q) ||
    includes(f.reward, q) ||
    includes(f.campaignReq, q) ||
    includes(f.guardReq, q);
  const encounters = [
    ...TRAINING_YARD_FIGHTS.filter(matchEncounter).map(e => ({ encounter: e, kind: 'training' })),
    ...SPIRIT_BOSSES.filter(matchEncounter).map(e => ({ encounter: e, kind: 'spirit' })),
  ].slice(0, PER_GROUP_LIMIT);

  const cityResults = (cities ?? [])
    .filter(c => includes(c.name, q))
    .map(c => ({ city: c }));

  const total =
    recipes.length + materials.length + enemies.length + encounters.length + cityResults.length;

  return { recipes, materials, enemies, encounters, cities: cityResults, total };
}
