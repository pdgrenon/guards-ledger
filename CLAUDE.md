# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR → http://localhost:5173/
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run test       # Vitest — runs pure reducer unit tests
npm run deploy     # Build + publish to GitHub Pages
```

## Architecture

Single-page React 19 app (Vite) for tracking game state in *The Isofarian Guard* board game. Deployed to GitHub Pages at `https://pdgrenon.github.io/guards-ledger/`.

### State management

All game state lives in one custom hook: `src/hooks/useGameState.js`. It owns:
- loading from / saving to `localStorage` key `guards_ledger_v1` after every action
- all action callbacks (validate → mutate → log → return new state)
- export/import of full state as a dated JSON file (`guards-ledger-save-YYYY-MM-DD.json`)

All pure state logic is extracted into `src/hooks/gameReducers.js` — no React, no localStorage, no side-effects. This makes reducers trivially unit-testable. `useGameState` is a thin wiring layer on top.

`App.jsx` calls `useGameState()` and passes state + action callbacks down via props. There is no context, no state library — pure prop drilling.

### Component structure

- **`App.jsx`** — shell: tab nav (`Guard`, `Cities`, `Stash`, `Session log`), top bar, party switcher, session log view, settings overlay trigger
- **`GuardPanel.jsx`** — HP number display, combat stats (Atk/Def with equipment bonuses shown), equipment, satchel, chip bag per guard
- **`CitiesTab.jsx`** — city grid: prestige pips (derived, not stored) + quest checkboxes
- **`StashTab.jsx`** — party resources (Sil/Lux), stonebound cube tracker, Fort Istra stash
- **`SettingsPanel.jsx`** — bottom-sheet overlay: active party selectors, per-guard max HP and starting chips, export/import/reset
- **`Autocomplete.jsx`** — reusable searchable dropdown (no external library); max 12 results, case-insensitive

### Static data

- **`src/data/constants.js`** — guard names, city names, chip types, `GUARD_COLOR_MAP` (single source of truth for guard identity colors), `FALLBACK_COLOR`, and `createInitialState()`
- **`src/data/materials.js`** — crafting material categories, `ALL_MATERIALS`, `ALL_ITEMS_WITH_CATEGORY` (pre-computed `{ item, category }` pairs for the stash UI), `RESOURCE_NODE_ITEMS`, `ENEMIES`, `WEAPONS`, `ARMOR`, `ACCESSORIES`, `ITEMS`, `WEAPON_STATS`, `ARMOR_STATS`
- **`src/data/demoSave.json`** — loaded on first run when no localStorage key exists

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

### Styling

Single `src/index.css` with CSS custom properties for light/dark theming. Dark mode via `prefers-color-scheme`. No UI library. Typography: Cinzel (display, via Google Fonts), system UI (body).

Key CSS conventions:
- Guard identity: `.guard-avatar.amber`, `.guard-avatar.gold`, etc. — class name matches the `key` from `GUARD_COLOR_MAP`
- Section labels inside guard cards: `.sec-label-primary` (uses `--guard-color` CSS var set on the card wrapper)
- Resource number displays (Sil, Lux): `.resource-value`
- City color: `--c-city` (alias of `--c-brand`)

### Testing

`src/hooks/gameReducers.test.js` covers all pure reducer functions. Run with `npm test`. There are no component tests.

When adding a new reducer function: add it to `gameReducers.js`, export it, wire it in `useGameState.js`, and add tests in `gameReducers.test.js`.
