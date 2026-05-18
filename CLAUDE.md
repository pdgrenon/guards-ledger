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

- **`App.jsx`** — shell: tab nav (`Guard`, `Cities`, `Stash`, `Campaign`, `Session log`), top bar, party switcher, session log view, settings overlay trigger
- **`GuardPanel.jsx`** — HP number display, combat stats (Atk/Def with equipment bonuses shown), equipment, satchel, chip bag per guard
- **`CitiesTab.jsx`** — city grid: prestige pips (derived, not stored) + quest checkboxes
- **`StashTab.jsx`** — party resources (Sil/Lux), stonebound cube tracker, Fort Istra stash
- **`CampaignTab.jsx`** — event token tracks, locations (fixed + dynamic lists), plans checklist
- **`SettingsPanel.jsx`** — bottom-sheet overlay: active party selectors, per-guard max HP and starting chips, export/import/reset
- **`Autocomplete.jsx`** — reusable searchable dropdown (no external library); max 12 results, case-insensitive

### Static data

- **`src/data/constants.js`** — guard names, city names, chip types, `GUARD_COLOR_MAP` (single source of truth for guard identity colors), `FALLBACK_COLOR`, `SATCHEL_SIZE` (4), `SATCHEL_EXPANDED_SIZE` (8), `MAX_HP` (20), `MAX_PRESTIGE` (3), and `createInitialState()`
- **`src/data/materials.js`** — `WEAPONS`, `ARMOR`, `ACCESSORIES`, `ITEMS`, `MATERIAL_CATEGORIES`, `ALL_MATERIALS`, `ALL_ITEMS_WITH_CATEGORY`, `ALL_KNOWN_ITEMS`, `RESOURCE_NODE_ITEMS`, `ENEMY_DROPS`, `ENEMIES`, `WEAPON_STATS`, `ARMOR_STATS`
- **`src/data/demoSave.json`** — loaded on first run when no localStorage key exists

`gameReducers.js` also exports two derived sets used for validation: `ALL_EQUIPMENT` (union of all weapon/armor/accessory/item names) and `ALL_MATERIALS_SET` (set of all material names).

### Guards

8 playable guards with fixed roles:

| Guard | Role | Color key |
|---|---|---|
| Grigory | The Tactician | `amber` |
| Alek | The Apothecary | `gold` |
| Catherine | The Remnant | `forest` |
| Yury | The Marauder | `vermilion` |
| Kharzin | The Sentinel | `indigo` |
| Vera | The Vanguard | `teal` |
| Pavel | The Watchman | `rose` |
| Yana | The Prophet | `cerulean` |

Guard roles (`GUARD_ROLES`) are defined locally in `GuardPanel.jsx`, not in `constants.js`. Do not move them to constants unless you also update the import.

Two guards are active at a time (`state.activeParty`, a 2-element name array). The active party is selected in SettingsPanel. The guard tab shows a switcher between the two active guards; `state.activeGuardIdx` tracks which one is currently visible.

Each guard in state has: `name`, `hp`, `maxHp`, `baseAtk`, `baseDef`, `expandedSatchel`, `satchel` (8-slot array of `{ item, qty }`), `equipment` (`{ weapon, armor, accessory, item }`), `chips` (`{ black, green, red, purple }`), `startingBlack`.

**Guard identity colors** are defined in `GUARD_COLOR_MAP` in `src/data/constants.js`. Each entry: `{ key, border, bg, text }` where `key` is the CSS variable suffix (e.g. `'amber'` → `--c-guard-amber-*`). Import from constants — do not redefine this map in any component file. The inline comments in `index.css` next to the guard color variables use placeholder names and do not match the actual guard-to-color assignments; `GUARD_COLOR_MAP` is the authoritative mapping.

Portrait images live in `public/guards/` named in lowercase (e.g. `grigory.webp`). `GuardAvatar` in `GuardPanel.jsx` falls back to initials automatically on `onError`.

### Equipment stat bonuses

`WEAPON_STATS` and `ARMOR_STATS` in `materials.js` map item names → integer attack/defense bonus. These are looked up at render time in `GuardPanel.jsx` — bonuses are **never stored in state**. `totalAtk = baseAtk + (WEAPON_STATS[weapon] ?? 0)`, same pattern for defense. Accessories have no numeric bonus in the current data model.

### Cities

6 cities: Mir, Razdor, Ryba, Silny, Strofa, Vouno.

City state shape: `{ id, name, puzzleQuestDone, bounty1Done, bounty2Done }`.

**Prestige is never stored.** Always derive it with `cityPrestige(city)` from `gameReducers.js`, which counts the three boolean quest fields. Do not add a `prestige` field to city state.

### Stash

`state.stash` is a plain object mapping item name → integer count. Keys are omitted when count reaches 0 (cleaned up by `reduceAdjustStash`). All known item names are defined in `MATERIAL_CATEGORIES` in `materials.js`. `ALL_KNOWN_ITEMS` is a `Set` of all of them and is used by `StashTab` to detect custom items (stash keys not in any category).

The stash supports **custom items** — any string can be a stash key, not just predefined names. `StashTab` groups unrecognized keys under a "Custom items" category. Do not assume `state.stash` only contains names from `ALL_KNOWN_ITEMS`.

### Stonebound

`state.stonebound`: `{ max: number, locations: Array<{ id, type, selection, count }> }`.

`type` is one of `'City'`, `'Resource node'`, `'Enemy drop'` and is derived from which `<optgroup>` the selection comes from in the UI — it is not independently editable. `id` is a string (e.g. `"loc-1"` in saved data, but generated as `Date.now() + Math.random()` for new entries in some paths — treat as opaque).

The stonebound UI prevents adding a location when `cubesAvailable <= 0`. The cube budget is enforced in the UI, not in the reducer.

### Campaign

`state.campaign` has three sub-objects:

```js
campaign: {
  eventTokens: { mountain: 0, forest: 0, plains: 0, sea: 0 },
  locations: {
    party: '',
    caravan: '',
    mainQuest: '',
    boat: '',
    sideQuests: [],   // Array<{ id, label }>
    bounties: [],     // Array<{ id, label }>
  },
  plans: [],          // Array<{ id, text, done }>
}
```

**Event tokens** — each region counts 0–3. Reaching 3 triggers an event (card flips to "Resolve event" button). Resolving resets the count to 0. Reducers: `reduceSetEventToken(s, region, delta)`, `reduceResetEventToken(s, region)`. Both write to the session log; location and plan mutations do not.

**Locations** — four fixed text fields and two dynamic lists. Dynamic entries are `{ id, label }` where `id` is a float from `Date.now() + Math.random()`. Never assume IDs are sequential integers. Reducers: `reduceSetCampaignLocation`, `reduceAddDynamicLocation`, `reduceUpdateDynamicLocation`, `reduceRemoveDynamicLocation`. None of these log.

**Plans** — a flat array of `{ id, text, done }`. Items are never reordered. Reducers: `reduceAddPlan`, `reduceTogglePlan`, `reduceDeletePlan`. None of these log.

**CampaignTab internals** — three sub-components, each a card:
- `EventTokensCard` — 2×2 grid; triggered state adds `.campaign-token-card.triggered` CSS class
- `LocationsCard` — fixed rows, then `<hr>` divider, then dynamic sections each with an "+ Add" link
- `PlansCard` — controlled input for new entries + list of `PlanRow` items

### Actions that intentionally do not log

Some `useGameState` actions mutate state without writing a session log entry because they are UI navigation or configuration, not game events:

- `setActiveGuard` — switches which guard is shown in the Guard tab
- `toggleExpandedSatchel` — expands/collapses satchel slots
- `setStartingBlack` — sets the chip reset target for a guard
- `reduceSetCampaignLocation`, `reduceAddDynamicLocation`, `reduceUpdateDynamicLocation`, `reduceRemoveDynamicLocation` — location text edits
- `reduceAddPlan`, `reduceTogglePlan`, `reduceDeletePlan` — plan checklist changes

Do not add logging to these unless there is a deliberate reason to make them appear in the session log.

### Save migration

`loadState()` in `useGameState.js` handles forward migration for old saves. Currently: if a loaded save is missing the `campaign` key (saved before the Campaign tab existed), it is back-filled from `createInitialState().campaign`.

**When adding a new top-level state key:** add it to `createInitialState()` in `constants.js`, then add a corresponding migration guard in `loadState()`:

```js
if (!parsed.newKey) {
  parsed.newKey = createInitialState().newKey;
}
```

Without this, existing player saves will be missing the key and the app may crash or behave incorrectly.

### Styling

Single `src/index.css` with CSS custom properties for light/dark theming. Dark mode via `prefers-color-scheme`. No UI library. Typography: Cinzel (display, via Google Fonts), system UI (body).

Key CSS conventions:
- Guard identity: `.guard-avatar.amber`, `.guard-avatar.gold`, etc. — class name matches the `key` from `GUARD_COLOR_MAP`
- Section labels inside guard cards: `.sec-label-primary` (uses `--guard-color` CSS var set on the card wrapper)
- Resource number displays (Sil, Lux): `.resource-value`
- City color: `--c-city` (alias of `--c-brand`)
- Campaign token triggered state: `.campaign-token-card.triggered` → `--c-red` / `--c-red-bg` (same tokens as HP danger)
- The inline comments beside guard color variables in `index.css` use old placeholder names and do not reflect the current guard assignments. `GUARD_COLOR_MAP` is authoritative.

### Testing

`src/hooks/gameReducers.test.js` covers all pure reducer functions. Run with `npm test`. There are no component tests.

When adding a new reducer function: add it to `gameReducers.js`, export it, wire it in `useGameState.js`, and add tests in `gameReducers.test.js`.
