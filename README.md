# The Guard's Ledger

A digital campaign tracker for the board game *The Isofarian Guard*. Built to eliminate the table clutter of tracking per-guard stats, city prestige, crafting materials, and stonebound cubes — so players can focus on the game.

[**Live demo →**](https://pdgrenon.github.io/isofarian-companion/)

---

## Why I built this

*The Isofarian Guard* is a mechanically rich co-op game, but maintaining 8 character sheets, 6 city boards, and a sprawling crafting inventory mid-session is genuinely painful. I built this companion app as a personal project to practice React state management and to ship something I'd actually use.

The result is a single-page app that persists all game state to `localStorage`, supports export/import of dated JSON snapshots, and runs entirely offline — no server, no login.

---

## What it tracks

**Guards** (up to 8 playable: Alek, Grigory, Dasha, Zoya, Borya, Mila, Seva, Kira)
- HP and AP (gray permanent + temporary)
- Attack and defense stat blocks, including temporary defense
- Equipment slots (weapon, armor, accessory, item) with autocomplete from a full item database
- Satchel (4 or 8 slots with item names and quantities)
- Speaking stones with cooldown toggling (ready/cooling)
- Chip bag counts (black, green, red, and status effect chips: weaken, break, freeze, poison, corrupt)

**Cities** (Mir, Razdor, Ryba, Silny, Strofa, Vouno)
- Prestige pips (0–3) derived from completed activities
- Puzzle quest and two bounties per city

**Fort Istra Stash**
- Crafting material inventory across 7 categories
- Searchable by name

**Stonebound**
- Manage cubes per location rather than per cube
- Each location has a type (City, Resource node, or Enemy node) with context-aware selection

**Campaign globals**
- Sil and Lux Essence totals with step-selectable increments (1 / 5 / 10)
- Round tracker with "End round" (advances round, refreshes cooled-down stones)
- Session log of all state changes (last 100 events)

---

## Tech decisions

**No state library.** All game state lives in a single `useGameState` hook that owns loading, saving, and every action. With ~8 guards and no async data, React's built-in `useState` plus prop drilling is sufficient — adding Redux or Zustand would be complexity without benefit.

**No UI library.** The entire interface is hand-rolled CSS with custom properties for light/dark theming. This kept the bundle small and gave full control over the design language.

**Plain CSS over CSS-in-JS.** A single `index.css` file with CSS custom properties (`--c-bg`, `--c-text`, etc.) handles both light and dark mode automatically via `prefers-color-scheme`. No runtime overhead, no tooling dependency.

**localStorage for persistence.** The app runs offline and requires no backend. State is serialized to JSON after every action and can be exported as a dated snapshot or imported from a previous session.

---

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173/isofarian-companion/
```

All state saves to `localStorage` automatically. Use **Settings** (⚙) to export a dated JSON snapshot or import a previously saved one.

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # ESLint
npm run deploy    # Build + publish to GitHub Pages
```

## Tech stack

- React 19 (no state library — single `useGameState` hook, prop drilling)
- Vite
- Plain CSS with custom properties for light/dark theming (automatic via `prefers-color-scheme`)
- No external UI library

## Deployment

Push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds and publishes to GitHub Pages.
