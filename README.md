# The Guard's Ledger

A digital campaign companion for *The Isofarian Guard* board game. Tracks all per-guard and per-city state so you can focus on playing the game rather than shuffling tokens.

**Live app:** [pdgrenon.github.io/isofarian-companion](https://pdgrenon.github.io/isofarian-companion/)

---

## Why I built this

*The Isofarian Guard* is a beautifully complex co-op game — but the physical upkeep is relentless. Each of up to 8 guards has HP, AP, a chip bag, a satchel, equipment, and speaking stones with cooldown states. Cities have prestige pips derived from three separate quest types. The stash has 60+ craftable materials. Keeping all of that in sync across a table, on paper, while also playing the actual game is genuinely painful.

I built this app to solve that problem for my own playgroup. The goal was a tool that was fast to tap on a phone, never lost state between sessions, and handled the fiddly bookkeeping invisibly — so the game itself could stay front and center.

---

## What it tracks

**Guards** (up to 8 playable: Alek, Grigory, Dasha, Zoya, Borya, Mila, Seva, Kira)
- HP and AP (gray permanent + temporary)
- Attack and defense stat blocks, including temporary defense
- Equipment slots (weapon, armor, accessory, item)
- Satchel (4 or 8 slots with item names and quantities)
- Speaking stones with cooldown toggling (ready/cooling)
- Chip bag counts (black, green, red, purple)

**Cities** (Mir, Razdor, Ryba, Silny, Strofa, Vouno)
- Prestige pips (0–3) derived from completed activities
- Puzzle quest and two bounties per city

**Fort Istra Stash**
- Crafting material inventory across 7 categories
- Searchable by name

**Stonebound**
- Cube placement per location (City, Resource node, or Enemy node)
- Total cubes used vs. cap

**Campaign globals**
- Sil and Lux Essence totals
- Round tracker with end-round action
- Session log of all state changes (last 100 events)

---

## Tech decisions

**No state library.** All state lives in a single `useGameState` hook that owns loading, saving, and every mutation. Prop drilling is the only data transport. For an app of this scope, adding Redux or Zustand would have introduced indirection without benefit — the data flow is simple enough that you can read it top to bottom. This was a deliberate choice to keep the code reviewable.

**No UI library.** Every component is hand-rolled with plain CSS. This added upfront time but gave me full control over touch targets, theming, and the specific interaction patterns the game requires (large tap buttons, pip tracks, toggles). A component library would have fought me on all of these.

**Plain CSS with custom properties.** Light/dark theming is handled entirely via `prefers-color-scheme` and a small set of semantic CSS variables (`--c-bg`, `--c-text`, `--c-purple`, etc.). No CSS-in-JS, no Tailwind — just a single stylesheet that's easy to diff and reason about. The display font (Cinzel) and UI font (system-ui) are applied through CSS custom properties so they're consistently available everywhere.

**localStorage.** Game state is serialized as JSON and written to `localStorage` on every action. There's no server, no auth, no sync — which is exactly right for a local co-op board game companion. Import/export as JSON gives an escape hatch for backups and device transfers. A migration layer handles loading saves from older schema versions without crashing.

---

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173/isofarian-companion/
```

State saves to `localStorage` automatically. Use **Settings** (⚙) to export a dated JSON snapshot or import a previous save.

---

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # ESLint
npm run deploy    # Build + publish to GitHub Pages
```

---

## Tech stack

- React 19 (no state library — single `useGameState` hook, prop drilling)
- Vite
- Plain CSS with custom properties for light/dark theming
- Google Fonts: Cinzel (display), system-ui (UI)
- No external UI library

---

## License

MIT
