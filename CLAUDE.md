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

Single-page React 19 app (Vite) for tracking game state in *The Isofarian Guard* board game. Deployed to GitHub Pages at `/isofarian-companion/`.

### State management

All game state lives in one custom hook: `src/hooks/useGameState.js`. It owns:
- loading from / saving to `localStorage` key `guards_ledger_v1` after every action (falls back to legacy key `isofarian_companion_v1` for migration)
- 30+ action functions (validate → mutate → log → return new state)
- export/import of full state as a dated JSON file (`guards-ledger-save-YYYY-MM-DD.json`)

`App.jsx` calls `useGameState()` and passes state + action callbacks down via props. There is no context, no state library — pure prop drilling.

### Component structure

- **`App.jsx`** — shell: tab nav, top bar with "The Guard's Ledger" wordmark, party strip (Sil/Lux/round trackers), settings overlay trigger
- **`GuardPanel.jsx`** — HP, AP, equipment, satchel, speaking stones, chip bag per guard
- **`CitiesTab.jsx`** — prestige pips (0–3), puzzle quest checkbox, two bounties per city
- **`StashTab.jsx`** — Fort Istra crafting material inventory + stonebound cube tracker
- **`SettingsPanel.jsx`** — overlay for max HP, starting chips, stone slots, export/import/reset
- **`Autocomplete.jsx`** — reusable custom dropdown (no external library); max 12 results, case-insensitive

### Static data

- `src/data/constants.js` — guard names, city names, chip types, and the `createInitialState()` factory
- `src/data/materials.js` — 6 crafting material categories (ores, timber, animal, tenebris, fish, consumables). Add new materials here when needed.

### Styling

Single `src/index.css` with CSS custom properties (`--c-bg`, `--c-text`, `--font-display`, `--font-ui`, etc.) for light/dark theming. Dark mode is automatic via `prefers-color-scheme`. No UI library; all components are custom CSS. Typography uses Cinzel (display) and system UI fonts.

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → GitHub Pages. The Vite base path `/isofarian-companion/` is set in `vite.config.js` and must stay in sync with the repo name.
