# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run test       # Vitest — runs pure reducer unit tests in src/hooks/gameReducers.test.js
npm run deploy     # Build + publish to GitHub Pages
```

## Architecture

Single-page React 19 app (Vite) for tracking game state in *The Isofarian Guard* board game. Deployed to GitHub Pages at `https://pdgrenon.github.io/guards-ledger/`.

### State management

All game state lives in one custom hook: `src/hooks/useGameState.js`. It owns:
- loading from / saving to `localStorage` key `guards_ledger_v1` after every action
- action functions (validate → mutate → log → return new state)
- export/import of full state as a dated JSON file (`guards-ledger-save-YYYY-MM-DD.json`)

Pure state logic is extracted into `src/hooks/gameReducers.js` — no React, no side-effects, fully unit-testable. `useGameState` is a thin wiring layer on top.

`App.jsx` calls `useGameState()` and passes state + action callbacks down via props. There is no context, no state library — pure prop drilling.

### Component structure

- **`App.jsx`** — shell: tab nav (`Guard`, `Cities`, `Stash`, `Session log`), top bar with "The Guard's Ledger" wordmark, party strip, settings overlay trigger
- **`GuardPanel.jsx`** — HP number display, combat stats (Atk/Def with equipment bonuses), equipment, satchel, chip bag per guard. Guard portraits load from `public/guards/<name>.webp`; falls back to initials if missing.
- **`CitiesTab.jsx`** — prestige pips (0–3, derived via `cityPrestige()`), puzzle quest checkbox, two bounties per city
- **`StashTab.jsx`** — Party resources (Sil/Lux), stonebound cube tracker, Fort Istra crafting material inventory
- **`SettingsPanel.jsx`** — overlay for max HP, starting chips, export/import/reset
- **`Autocomplete.jsx`** — reusable searchable dropdown (no external library); max 12 results, case-insensitive

### Static data

- `src/data/constants.js` — guard names, city names, chip types, `GUARD_COLOR_MAP` (single source of truth for guard identity colors), and `createInitialState()`
- `src/data/materials.js` — crafting material categories, equipment lists, `ALL_ITEMS_WITH_CATEGORY` (pre-computed for stash UI), `WEAPON_STATS`, `ARMOR_STATS`

### Guards

8 playable guards: Grigory, Alek, Catherine, Yury, Kharzin, Vera, Pavel, Yana. Each guard tracks:
- HP (current and max)
- Base attack and defense (base stats + equipment bonuses displayed in UI)
- Equipment (weapon, armor, accessory, item)
- Satchel (4 or 8 slots, each with item name and quantity)
- Chip bag (black, green, red, purple counts)

**Guard identity colors** are defined in `GUARD_COLOR_MAP` in `src/data/constants.js` and used by `App.jsx`, `GuardPanel.jsx`, and `SettingsPanel.jsx`. Each entry has a `key` (CSS variable suffix), `border`, `bg`, and `text` color var. Do not duplicate this map in component files.

Portrait images live in `public/guards/` and are named in lowercase after the guard (e.g. `grigory.webp`). The `GuardAvatar` component in `GuardPanel.jsx` handles the `onError` fallback to initials automatically.

### Cities

City prestige is **derived** from the three quest booleans — it is not stored in state. Always use `cityPrestige(city)` from `gameReducers.js` to compute it. The city state shape is: `{ id, name, puzzleQuestDone, bounty1Done, bounty2Done }`.

### Styling

Single `src/index.css` with CSS custom properties (`--c-bg`, `--c-text`, `--font-display`, `--font-ui`, etc.) for light/dark theming. Dark mode is automatic via `prefers-color-scheme`. No UI library; all components are custom CSS. Typography uses Cinzel (display) and system UI fonts.

Guard avatars are circular (`border-radius: 50%`) with a 2px identity-colored border. The `.resource-value` class styles the large numeric display for Sil and Lux Essence.

### Testing

`src/hooks/gameReducers.test.js` covers all pure reducer functions using Vitest. Run with `npm test`. Component tests are not configured.
