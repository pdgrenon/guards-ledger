# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run deploy     # Build + publish to GitHub Pages
```

No test suite is configured.

## Architecture

Single-page React 19 app (Vite) for tracking game state in *The Isofarian Guard* board game. Deployed to GitHub Pages at `/guards-ledger/`.

### State management

All game state lives in one custom hook: `src/hooks/useGameState.js`. It owns:
- loading from / saving to `localStorage` key `guards_ledger_v1` after every action (falls back to legacy key `isofarian_companion_v1` for migration)
- 30+ action functions (validate → mutate → log → return new state)
- export/import of full state as a dated JSON file (`guards-ledger-save-YYYY-MM-DD.json`)

`App.jsx` calls `useGameState()` and passes state + action callbacks down via props. There is no context, no state library — pure prop drilling.

### Component structure

- **`App.jsx`** — shell: tab nav, top bar with "The Guard's Ledger" wordmark, party strip (Sil/Lux trackers), settings overlay trigger
- **`GuardPanel.jsx`** — HP, AP, equipment, satchel, chip bag per guard
- **`CitiesTab.jsx`** — prestige pips (0–3), puzzle quest checkbox, two bounties per city
- **`StashTab.jsx`** — Fort Istra crafting material inventory + stonebound cube tracker
- **`SettingsPanel.jsx`** — overlay for max HP, starting chips, export/import/reset
- **`Autocomplete.jsx`** — reusable custom dropdown (no external library); max 12 results, case-insensitive

### Static data

- `src/data/constants.js` — guard names, city names, chip types, and the `createInitialState()` factory
- `src/data/materials.js` — 6 crafting material categories (ores, timber, animal, tenebris, fish, consumables). Add new materials here when needed.

### Guards

8 playable guards: Grigory, Alek, Catherine, Yury, Kharzin, Vera, Pavel, Yana. Each has a unique identity color defined in `GUARD_COLOR_MAP` in `App.jsx` and corresponding CSS variables in `src/index.css`.

### Styling

Single `src/index.css` with CSS custom properties (`--c-bg`, `--c-text`, `--font-display`, `--font-ui`, etc.) for light/dark theming. Dark mode is automatic via `prefers-color-scheme`. No UI library; all components are custom CSS. Typography uses Cinzel (display) and system UI fonts.

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → GitHub Pages. The Vite base path is set to `'./'` in `vite.config.js`, which makes all asset paths relative and works regardless of the repo name.
