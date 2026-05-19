# The Guard's Ledger

> A campaign companion for *The Isofarian Guard* — tracks all per-guard and per-city state so you can focus on playing, not shuffling tokens.

**[→ Open the app](https://isofarian.averageideas.dev)**

---

## What it does

*The Isofarian Guard* generates a lot of bookkeeping. Each guard has HP, attack, defense, a chip bag, a satchel, and four equipment slots. Six cities each have prestige and three quest tracks. A shared stash holds 60+ crafting materials. A stonebound cube tracker covers the campaign map. Managing all of that on paper, mid-session, is genuinely painful.

This app handles that bookkeeping on your phone, saves automatically after every action, and stays out of the way of the game itself.

---

## Features

### Guard tab

Two guards are active at a time. The active party is configured in Settings; the switcher at the top of the Guard tab toggles between whichever two guards are currently selected.

Each guard card shows:

- **HP** — large numeric display (current / max) with +/− controls
- **Combat stats** — Attack and Defense, each showing the base value plus any equipment bonus, with a breakdown (e.g. "2 base + 3 weapon")
- **Equipment** — Weapon, Armor, Accessory, and Item slots, each with a searchable autocomplete pulling from the full item lists
- **Satchel** — 4 slots by default, expandable to 8 via a toggle. Each slot has a material name (autocomplete) and a quantity (1–4)
- **Chip bag** — Black, Green, Red, and Purple chip counts with +/− controls and a one-tap reset back to each guard's configured starting count

Portrait images load from `public/guards/<name>.webp`. If a portrait is missing the avatar shows the guard's initials instead.

### Cities tab

Six cities: Mir, Razdor, Ryba, Silny, Strofa, and Vouno. Each city card shows:

- **Prestige pips** (0–3) — derived automatically from completed quests; no separate input needed
- **Quest rows** — Puzzle quest, Bounty 1, Bounty 2. Tapping a row toggles it done/undone and the prestige pip count updates instantly

### Stash tab

**Party resources** — Sil and Lux Essence totals, each with step-size buttons (×1, ×5, ×10) and +/− controls.

**Stonebound** — Tracks cube placement across the campaign map. Add location entries, pick a City, Resource node, or Enemy node from grouped dropdowns, set a cube count per location, and adjust the overall cube cap. The header shows cubes used vs. cap and turns red if over budget.

**Fort Istra stash** — Inventory for all craftable materials across 7 categories: Ores, Timber, Animal drops, Tenebris drops, Fish & food, Market & misc, and Special ingredients. Only items with a non-zero count are shown. A filter input narrows by name. A search panel at the bottom lets you add items not yet in the stash.

Tapping a material name in the stash opens a source sheet (see Material sources below).

### Craft tab

A stash-aware recipe reference for all 101 craftable items — weapons, armor, accessories, and consumables. Answers mid-session questions like "do we have enough Spines for this?" and "what are we saving toward next?" without leaving the app.

**Filters** — a type dropdown (All / Weapon / Armor / Accessory / Item), a minimum-star tier selector (★ through ★★★★★), and a "Can craft" toggle that hides everything you can't currently make. Tapping a star tier dims everything below it so the filter reads as a threshold ("★★★ and above"), not an exact match. Five-star items are Ft. Istra endgame gear and are shown in red throughout.

**Search** — matches item names, material names, and city names. Typing "Spines" shows every recipe that uses Spines. Typing "Ryba" shows everything craftable at Ryba.

**Recipe cards** — each card shows the item name, type, stat bonus, bonus chip, and a color-coded left border (green = ready, amber = partially there, gray = far off). The materials list displays stash-aware "have X / need Y" quantities for every ingredient, with green for satisfied and red for short. Speaking stones appear in the materials list with a "· speaking stone" label since they draw from the same stash pool but have dual use. Prerequisites (must-equip items) and guard restrictions are shown inline; guard-restricted items are hidden entirely if no matching guard is in the active party. The city footer shows where to craft and the cost in Sil or Lux, with per-city price breakdowns for multi-city items.

Tapping a material name in the ingredients list opens a source sheet (see Material sources below).

**Craftability check** — "Ready" requires all materials in stash plus sufficient Sil (or Lux for Ft. Istra items). The check uses the cheapest available city price for multi-city items.

### Material sources

Tapping a material name in either the stash or a recipe card opens a bottom sheet showing where to acquire or sell that material. Sources are grouped into up to four sections depending on what applies:

- **Enemy drops** — enemies that drop the material, sourced from the bestiary
- **Resource nodes** — map node numbers for ores and timber, plus Ft. Istra building options (Lumbermill or Lapidary) with their Lux cost for ×4
- **Buy at market** — cities that sell the material and their buy price in Sil
- **Sell at market** — cities that buy the material/item and their sell price in Sil (shown in green). For crafting materials, the Ft. Istra Apothecary sell price is also shown where applicable — this pays out in Lux Essence rather than Sil. Items with no sell value (Ft. Istra gear, some special items) simply omit this section.

Not all materials have source data (speaking stones and special ingredients are excluded). The sheet closes by tapping the backdrop, the ✕ button, or pressing Escape.

### Session log tab

A reverse-chronological log of all state changes in the current session, capped at 100 entries. Each entry shows a timestamp and a plain-English description of what changed. Guard name entries are color-coded to their identity color; party and stash events use the brand ochre; system events (imports, resets) are gray.

### Settings

A bottom-sheet overlay (gear icon in the top bar) with:

- **Active party** — two dropdowns to select which guards are in your current party (all 8 guards are always tracked; only the two active ones appear in the Guard tab switcher)
- **Per-guard config** (active party only) — max HP adjustment and starting black chip count
- **Export** — downloads a dated JSON snapshot (`guards-ledger-save-YYYY-MM-DD.json`)
- **Import** — restores from a previously exported file
- **Reset** — wipes all state back to defaults (with confirmation)

---

## Persistence

All state saves to `localStorage` under the key `guards_ledger_v1` automatically after every action. On first load with no saved data the app opens a demo save so the UI isn't empty.

---

## Tech notes

**Single hook for all state.** Everything lives in `src/hooks/useGameState.js`. It exposes action callbacks and owns loading/saving. All pure state logic is extracted into `src/hooks/gameReducers.js` as plain functions with no React or side-effects, which makes them unit-testable. `App.jsx` wires state and callbacks down via props — no context, no state library.

**No UI library.** Every component is hand-rolled with plain CSS. This trades upfront effort for full control over touch targets, theming, and interaction patterns: large tap areas, chip counters, custom autocomplete.

**CSS custom properties for theming.** Light and dark mode are handled entirely via `prefers-color-scheme` and a set of semantic tokens (`--c-bg`, `--c-text`, `--c-brand`, `--c-hp`, `--c-green`, eight guard identity color triples, etc.) defined in `src/index.css`. No runtime theming logic needed.

**Guard identity colors** are defined once in `src/data/constants.js` (`GUARD_COLOR_MAP`) and imported wherever elsewhere. There is no duplicate color map in any component file.

**Craft tab is read-only.** `CraftTab` takes `stash`, `sil`, `lux`, and `activeParty` as props and derives everything from them. It introduces no new state, no reducers, and no localStorage keys.

**Tests.** `src/hooks/gameReducers.test.js` covers all pure reducer functions using Vitest. Run with `npm test`.

**Stack:** React 19 · Vite · Plain CSS · Vitest · Cloudflare Pages

---

## Project structure

```
src/
  App.jsx                  # Shell: tabs, top bar, party switcher, log view, settings trigger
  index.css                # Single stylesheet with CSS custom properties (light + dark)
  components/
    GuardPanel.jsx         # Per-guard card: HP, combat stats, equipment, satchel, chips
    CitiesTab.jsx          # City grid: prestige pips + quest checkboxes
    StashTab.jsx           # Party resources (Sil/Lux), stonebound, Fort Istra stash
    CraftTab.jsx           # Stash-aware recipe reference: 101 items, filters, craftability
    MaterialSourcePopup.jsx  # Bottom-sheet: where to find or sell a given material/item
    SettingsPanel.jsx      # Bottom-sheet: active party, per-guard config, save/load/reset
    Autocomplete.jsx       # Reusable searchable dropdown (no external library)
  hooks/
    useGameState.js        # All state + action callbacks; loads/saves localStorage
    gameReducers.js        # Pure state-transition functions (unit-testable, no React)
    gameReducers.test.js   # Vitest unit tests for all reducers
  data/
    constants.js           # Guard names, city names, chip types, GUARD_COLOR_MAP, createInitialState()
    materials.js           # Item lists, MATERIAL_SOURCES (enemy drops, nodes, market buy/sell prices)
    recipes.js             # All 101 crafting recipes + craftStatus/shortageCount helpers
    demoSave.json          # Shown on first load when no localStorage save exists
public/
  guards/                  # Guard portrait images (*.webp, lowercase filenames)
```

---

## Development

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173/
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run test       # Vitest (reducer unit tests)
npm run lint       # ESLint
```

To add a new crafting material: add its name to the appropriate category array in `src/data/materials.js`. It will appear in both the stash panel and satchel autocomplete automatically.

To add or update a crafting recipe: edit `src/data/recipes.js`. Each entry follows the shape documented at the top of that file. No component changes are needed.

To add or update material source data: edit the `MATERIAL_SOURCES` export in `src/data/materials.js`. Each entry supports `enemies`, `nodes`, `ftIstra`, `market`, `sell`, and `ftIstraSell` fields — all optional.
