# Isofarian Companion

A digital companion app for the board game *The Isofarian Guard*. Tracks all the fiddly per-guard and per-city state so you can focus on playing the game.

## What it tracks

**Guards** (up to 8 playable: Alek, Grigory, Dasha, Zoya, Borya, Mila, Seva, Kira)
- HP and AP (gray permanent + temporary)
- Attack and defense stat blocks, including temporary defense
- Equipment slots (weapon, armor, accessory, item)
- Satchel (4 or 8 slots with item names and quantities)
- Speaking stones with cooldown toggling (ready/cooling)
- Chip bag counts (black, green, red, and status effect chips: weaken, break, freeze, poison, corrupt)

**Cities** (Mir, Razdor, Ryba, Silny, Strofa, Vouno)
- Prestige pips (0–3) derived from completed activities
- Puzzle quest and two bounties per city

**Fort Istra Stash**
- Crafting material inventory across 7 categories (ores, timber, animal drops, tenebris drops, fish & food, market & misc, special ingredients)
- Searchable by name

**Stonebound**
- Manage cubes per location rather than per cube
- Each location has a type (City, Resource node, or Enemy node) followed by a context-aware selection:
  - *City* → pick from the 6 cities
  - *Resource node* → pick any ore or timber
  - *Enemy node* → pick from the full enemy bestiary
- Cube count per location (1–4), capped against your total cube maximum
- Add and remove locations freely; total cubes used shown against the cap

**Campaign globals**
- Sil and Lux Essence totals with step-selectable increments (1 / 5 / 10)
- Round tracker with "End round" (advances round, refreshes cooled-down stones)
- Session log of all state changes (last 100 events)

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173/isofarian-companion/
```

All state saves to `localStorage` automatically. Use **Settings** (⚙) to export a dated JSON snapshot or import a previously saved one.

## Settings

- Adjust max HP and starting chip counts per guard
- Set stone slot count per guard
- Configure base attack and defense values per guard
- Export / import / reset all game data

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

Push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds and publishes to GitHub Pages. Update the `homepage` field in `package.json` with your actual GitHub username before deploying.
