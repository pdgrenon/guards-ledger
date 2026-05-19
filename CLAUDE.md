# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR → http://localhost:5173/
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run test       # Vitest — runs pure reducer unit tests
```

## Architecture

Single-page React 19 app (Vite) for tracking game state in *The Isofarian Guard* board game. Deployed to Cloudflare Pages at `https://isofarian.averageideas.dev`.

### State management

All game state lives in one custom hook: `src/hooks/useGameState.js`. It owns:
- loading from / saving to `localStorage` key `guards_ledger_v1` after every action
- all action callbacks (validate → mutate → log → return new state)
- export/import of full state as a dated JSON file (`guards-ledger-save-YYYY-MM-DD.json`)

All pure state logic is extracted into `src/hooks/gameReducers.js` — no React, no localStorage, no side-effects. This makes reducers trivially unit-testable. `useGameState` is a thin wiring layer on top.

`App.jsx` calls `useGameState()` and passes state + action callbacks down via props. There is no context, no state library — pure prop drilling.

### Component structure

- **`App.jsx`** — shell: tab nav (`Guard`, `Cities`, `Stash`, `Craft`, `Campaign`, `Session log`), top bar, party switcher, session log view, settings overlay trigger. Also owns `sourceItem` state and renders `MaterialSourcePopup` at the app level so it overlays everything correctly.
- **`GuardPanel.jsx`** — HP number display, combat stats (Atk/Def with equipment bonuses shown), equipment, satchel, chip bag per guard
- **`CitiesTab.jsx`** — city grid: prestige pips (derived, not stored) + quest checkboxes
- **`StashTab.jsx`** — party resources (Sil/Lux), stonebound cube tracker, Fort Istra stash. Accepts `onShowSource` prop; tapping a material name with source data calls it.
- **`CraftTab.jsx`** — read-only recipe reference; filters by type/tier/craftability; search matches item names, material names, and cities; shows stash-aware "have/need" quantities per ingredient; hides guard-restricted items unless that guard is in the active party. Accepts `onShowSource` prop; tapping any ingredient name with source data calls it.
- **`MaterialSourcePopup.jsx`** — bottom-sheet overlay showing where to acquire or sell a given material/item. Reads from `MATERIAL_SOURCES` in `materials.js`. Rendered at App level via a `fixed` backdrop. Closes on backdrop tap, ✕ button, or Escape key. No state of its own beyond the `item` prop passed from App.
- **`SettingsPanel.jsx`** — bottom-sheet overlay: active party selectors, per-guard max HP and starting chips, export/import/reset
- **`Autocomplete.jsx`** — reusable searchable dropdown (no external library); max 12 results, case-insensitive

### Static data

- **`src/data/constants.js`** — guard names, city names, chip types, `GUARD_COLOR_MAP` (single source of truth for guard identity colors), `FALLBACK_COLOR`, and `createInitialState()`
- **`src/data/materials.js`** — crafting material categories, `ALL_MATERIALS`, `ALL_ITEMS_WITH_CATEGORY` (pre-computed `{ item, category }` pairs for the stash UI), `RESOURCE_NODE_ITEMS`, `ENEMIES`, `WEAPONS`, `ARMOR`, `ACCESSORIES`, `ITEMS`, `WEAPON_STATS`, `ARMOR_STATS`, and `MATERIAL_SOURCES`
- **`src/data/recipes.js`** — all 101 crafting recipes as a static `RECIPES` array, plus helper functions `minCraftCost`, `craftCities`, `craftStatus`, and `shortageCount`. See the shape comment at the top of that file.
- **`src/data/demoSave.json`** — loaded on first run when no localStorage key exists

### MATERIAL_SOURCES

`MATERIAL_SOURCES` is a plain object exported from `materials.js` mapping item name → source descriptor. It is the sole data source for `MaterialSourcePopup`. Each entry has up to six optional fields:

```js
{
  enemies?: string[],           // enemy names that drop this material
  nodes?: string[],             // map node labels for ores/timber (e.g. 'Node 15')
  ftIstra?: { label: string, luxPer4: number }, // Ft. Istra building purchase option
  market?: { city: string, price: number }[],  // city market buy prices in Sil
  sell?: { city: string, price: number }[],    // city market sell prices in Sil
  ftIstraSell?: number,         // Ft. Istra Apothecary sell price (pays Lux Essence, not Sil)
}
```

Source data covers: all animal/tenebris drops (from the Common Bestiary), all ores and timber (from Ft. Istra Buildings sheet — node numbers and Lumbermill/Lapidary Lux costs), market-buyable materials and consumables (from the Market Guide sheet), sell prices for all market items and craftable gear (from the Market Guide, Armor-Weapon Guide, and Accessory-Item Guide sheets). Speaking stones and special ingredients are not included.

Items that cannot be sold (spreadsheet shows `–`) simply omit the `sell` and `ftIstraSell` fields. Ft. Istra gear (luxCost items) generally cannot be sold. The `ftIstraSell` field is distinct from `sell` because it pays out in Lux Essence rather than Sil — the popup labels it accordingly.

`MATERIAL_SOURCES` also includes entries for craftable gear (armor, weapons, accessories, items) that have sell prices, even when those items have no other source data (no enemy drop, no market buy). This means gear names appear as tappable source triggers in the stash just like materials do.

The trigger affordance is a `<button>` with class `mat-source-trigger` replacing the `<span>` that would otherwise render the ingredient name. It has a full browser button reset in CSS so it is visually identical to the span. Only items present in `MATERIAL_SOURCES` get the button; others remain spans.

### Guards

8 playable guards: Grigory, Alek, Catherine, Yury, Kharzin, Vera, Pavel, Yana.

Two guards are active at a time (`state.activeParty`, a 2-element name array). The active party is selected in SettingsPanel. The guard tab shows a switcher between the two active guards; `state.activeGuardIdx` tracks which one is currently visible.

Each guard in state has: `name`, `hp`, `maxHp`, `baseAtk`, `baseDef`, `expandedSatchel`, `satchel` (8-slot array of `{ item, qty }`), `equipment` (`{ weapon, armor, accessory, item }`), `chips` (`{ black, green, red, purple }`), `startingBlack`.

**Guard identity colors** are defined in `GUARD_COLOR_MAP` in `src/data/constants.js`. Each entry: `{ key, border, bg, text }` where `key` is the CSS variable suffix (e.g. `'amber'` → `--c-guard-amber-*`). Import from constants — do not redefine this map in component files.

Portrait images live in `public/guards/` named in lowercase (e.g. `grigory.webp`). `GuardAvatar` in `GuardPanel.jsx` falls back to initials automatically on `onError`.

### Cities

6 cities: Mir, Razdor, Ryba, Silny, Strofa, Vouno.

City state shape: `{ id, name, puzzleQuestDone, bounty1Done, bounty2Done }`.

**Prestige is never stored.** Always derive it with `cityPrestige(city)` from `gameReducers.js`, which counts the three boolean quest fields. Do not add a `prestige` field to city state.

### Stash

`state.stash` is a plain object mapping item name → integer count. Keys are omitted when count reaches 0 (cleaned up by `reduceAdjustStash`). All 60+ material names are defined in `MATERIAL_CATEGORIES` in `materials.js`.

### Stonebound

`state.stonebound`: `{ max: number, locations: Array<{ type, selection, count }> }`. `type` is one of `'City'`, `'Resource node'`, `'Enemy node'` and is derived from the selection when set — it is not independently editable in the UI.

### Craft tab

`CraftTab` is a **read-only** component. It receives `stash`, `sil`, `lux`, `activeParty`, `guards`, and `onShowSource` as props and derives all display state from them. It owns no state beyond local UI state (search string, active filters). Do not add crafting state to `useGameState` — the tab intentionally introduces no new persistence.

Recipe data lives entirely in `src/data/recipes.js`. Each recipe has this shape:

```js
{
  name: string,
  type: 'Armor' | 'Weapon' | 'Accessory' | 'Item',
  city: string,           // human-readable, comma-separated for multi-city
  isFtIstra: boolean,
  stars: 1–5,             // 5 = Ft. Istra endgame tier (shown in red)
  statBonus: string|null, // e.g. '3⛊' or '2👊'
  bonusChip: string|null,
  effect: string|null,    // accessories/items only
  craftCost: number | { CityName: number } | null,
  luxCost: number|null,
  prereq: string|null,    // item that must be equipped first
  itemReq: string|null,   // special ingredient (apothecary items)
  limitedTo: string[],    // guard names; empty = available to all
  materials: Array<{ name: string, qty: number, isSpeakingStone: boolean }>,
}
```

`craftStatus(recipe, stash, sil, lux)` returns `'ready' | 'partial' | 'missing'`:
- **ready** — all materials satisfied AND currency satisfied (min city price for multi-city Sil items, or Lux for Ft. Istra items)
- **partial** — at least one material present but not all requirements met
- **missing** — none of the required materials are in stash

Guard-restricted recipes (`limitedTo` is non-empty) are hidden entirely from the list if no matching guard is in `activeParty`. When a matching guard is active, a restriction note is shown on the card.

Speaking stones appear in `materials` with `isSpeakingStone: true`. They draw from the same `state.stash` pool as all other materials and are labeled "· speaking stone" inline on the material row for context.

Apothecary items (Barrier Tonic, Invigorating Potion, etc.) have no `materials` entries and use `itemReq` for their special ingredient string. These always show as `partial` since the special ingredients are not individually trackable in the stash.

### Styling

Single `src/index.css` with CSS custom properties for light/dark theming. Dark mode via `prefers-color-scheme`. No UI library. Typography: Cinzel (display, via Google Fonts), system UI (body).

Key CSS conventions:
- Guard identity: `.guard-avatar.amber`, `.guard-avatar.gold`, etc. — class name matches the `key` from `GUARD_COLOR_MAP`
- Section labels inside guard cards: `.sec-label-primary` (uses `--guard-color` CSS var set on the card wrapper)
- Resource number displays (Sil, Lux): `.resource-value`
- City color: `--c-city` (alias of `--c-brand`)
- Craft card status borders: `.craft-card--ready` (green), `.craft-card--partial` (amber), `.craft-card--missing` (muted)
- Craft star colors: `.craft-stars` (ochre brand), `.craft-stars--ft` (red, for 5-star Ft. Istra items)
- Material source trigger: `.mat-source-trigger` — full browser button reset; compound selectors `.stash-row-name.mat-source-trigger` and `.craft-mat-name.mat-source-trigger` explicitly set the correct `font-size` and `color` to match the spans they replace
- Source popup: `.source-popup-backdrop`, `.source-popup`, `.source-chip`, `.source-section-label` — bottom-sheet pattern matching the existing SettingsPanel
- Sell price chips: `.source-chip--sell` — green-tinted variant of `.source-chip` used exclusively in the "Sell at market" section of the source popup

### Testing

`src/hooks/gameReducers.test.js` covers all pure reducer functions. Run with `npm test`. There are no component tests.
