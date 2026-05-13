# Isofarian Companion

A digital companion app for the board game *The Isofarian Guard*. Tracks all the fiddly per-guard and per-city state so you can focus on playing the game.

## What it tracks

**Guards** (up to 8 playable: Alek, Grigory, Dasha, Zoya, Borya, Mila, Seva, Kira)
- HP and AP (gray permanent + temporary)
- Equipment slots (weapon, armor, accessory, item)
- Satchel (4 or 8 slots with item names and quantities)
- Speaking stones with cooldown/broken state toggling
- Chip bag counts (black, green, red, and status chips)

**Cities** (Mir, Razdor, Ryba, Silny, Strofa, Vouno)
- Prestige pips (0–3) derived from completed activities
- Puzzle quest and two bounties per city

**Fort Istra Stash**
- Crafting material inventory across 6 categories (ores, timber, animal, tenebris, fish, consumables)
- Stonebound cube tracker (up to 4 slots with destination and type)

**Campaign globals**
- Sil and Lux currency totals
- Round and campaign number
- Action log of all state changes

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173/isofarian-companion/
```

The app saves all state to `localStorage` automatically. Use **Settings** to export a dated JSON snapshot or import a previously saved one.

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
- Vite 8
- Plain CSS with custom properties for light/dark theming (automatic via `prefers-color-scheme`)
- No external UI library

## Deployment

Push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds and publishes to GitHub Pages. Update the `homepage` field in `package.json` with your actual GitHub username before deploying. 
