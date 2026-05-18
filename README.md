# The Guard's Ledger

> A campaign companion for *The Isofarian Guard* — tracks all per-guard and per-city state so you can focus on playing, not shuffling tokens.

**[→ Open the app](https://isofarian.averageideas.dev)**

---

## What it does

*The Isofarian Guard* generates a lot of bookkeeping. Each guard has HP, attack, defense, a chip bag, a satchel, and four equipment slots. Six cities each have prestige and three quest tracks. A shared stash holds 60+ crafting materials. A stonebound cube tracker covers the campaign map. Campaign-level state — event tokens, locations, side quests, bounties, and session plans — adds another layer of tracking on top of all that. Managing it on paper mid-session is genuinely painful.

This app handles all of that bookkeeping on your phone, saves automatically after every action, and stays out of the way of the game itself.

---

## Features

### Guard tab

Two guards are active at a time. The active party is configured in Settings; the switcher at the top of the Guard tab toggles between whichever two guards are currently selected.

Each guard card shows:

- **HP** — large numeric display (current / max) with +/− controls
- **Combat stats** — Attack and Defense, each showing the base value plus any equipment bonus, with a breakdown (e.g. "2 base + 3 weapon")
- **Equipment** — Weapon, Armor, Accessory, and Item slots, each with a searchable autocomplete drawing from the full item lists in the game
- **Satchel** — 4 slots by default, expandable to 8 via a toggle. Each slot has a material name (autocomplete) and a quantity (1–4)
- **Chip bag** — Black, Green, Red, and Purple chip counts with +/− controls and a one-tap reset back to each guard's configured starting count

Each guard is identified by name, a role title, a colored portrait avatar, and a colored accent applied to their card. Portrait images load from `public/guards/<name>.webp`; if a portrait is missing the avatar falls back to the guard's initials.

The 8 guards and their roles:

| Guard | Role |
|---|---|
| Grigory | The Tactician |
| Alek | The Apothecary |
| Catherine | The Remnant |
| Yury | The Marauder |
| Kharzin | The Sentinel |
| Vera | The Vanguard |
| Pavel | The Watchman |
| Yana | The Prophet |

### Cities tab

Six cities: Mir, Razdor, Ryba, Silny, Strofa, and Vouno. Each city card shows:

- **Prestige pips** (0–3) — derived automatically from completed quests; no separate input needed
- **Quest rows** — Puzzle quest, Bounty 1, Bounty 2. Tapping a row toggles it done/undone and the prestige pip count updates instantly

### Stash tab

**Party resources** — Sil and Lux Essence totals with step-size buttons (×1, ×5, ×10) and +/− controls.

**Stonebound** — Tracks cube placement across the campaign map. Add location entries, pick a City, Resource node, or Enemy drop from grouped dropdowns, set a cube count per location, and adjust the overall cube cap. The header shows cubes used vs. cap and turns red if over budget. You cannot add a new location if no cubes remain.

**Fort Istra stash** — Inventory across 9 categories:

| Category | Contents |
|---|---|
| Ores | Iron, Silver, Gold, Agate, Crystal, Diamond |
| Timber | Pine, Rosewood, Ash, Autumn Blaze, Dogwood, Cedar, Cherry, Ancient Oak |
| Animal drops | Pelts, hides, bones, claws, and other creature materials |
| Tenebris drops | Tenebris Shards, Skull, Essence |
| Fish & food | Fish varieties, Golden Potato, Clayhorn Steak, Mir Bread |
| Market & misc | Health Potion, Tent |
| Special ingredients | Rare crafting components and dual-use speaking stones (Jade, Black Diamond, Ancient Roots) |
| Speaking stones | Adamant, Aquamarine, Aventurine, Carnelian, and others |
| Gear | All weapons, armor, accessories, and usable items |

Only items with a non-zero count are shown. A filter input narrows the visible list by name. A search panel at the bottom adds items not yet in the stash — typing a name that doesn't match any known item offers an "Add as custom item" option, so one-off or house-rule items can be tracked too.

### Campaign tab

Tracks campaign-level state across three cards:

**Event Tokens** — Four regional token tracks (Mountain, Forest, Plains, Sea), each with a 3-pip display. Use +/− to advance a region's token count. When a track reaches 3 the card flips to a highlighted "Resolve event" button; tapping it resets that region's count to 0 and logs the resolution.

**Locations** — A quick-reference board for where things are on the campaign map. Four fixed fields (Party, Caravan, Main Quest, Boat) accept free-text entries. Below those, dynamic lists for **Side Quests** and **Bounties** let you add, edit, and remove entries as the campaign evolves.

**Plans** — A simple checklist for session intentions or reminders. Type a note and press Add; tap the checkbox to mark it done; tap × to delete it. Done items are struck through and visually muted.

### Session log tab

A reverse-chronological log of all state changes in the current session, capped at 100 entries. Each entry shows a timestamp and a plain-English description of what changed. Guard name entries are color-coded to their identity color; party and stash events use the brand ochre; system events (imports, resets) are gray.

### Settings

A bottom-sheet overlay (gear icon in the top bar) with:

- **Active party** — two dropdowns to select which guards are in your current party. All 8 guards are always tracked; only the two active ones appear in the Guard tab switcher
- **Per-guard config** (active party only) — max HP adjustment and starting black chip count. Starting black is the value chip counts reset to when "Reset chips" is tapped
- **Export** — downloads a dated JSON snapshot (`guards-ledger-save-YYYY-MM-DD.json`)
- **Import** — restores from a previously exported file
- **Reset** — wipes all state back to defaults (with a confirmation prompt)

---

## Persistence

All state saves to `localStorage` under the key `guards_ledger_v1` automatically after every action. On first load with no saved data the app opens a demo save so the UI isn't empty. Saves created before the Campaign tab existed are automatically migrated — the `campaign` key is back-filled with defaults on load.

---

## Tech notes

**Single hook for all state.** Everything lives in `src/hooks/useGameState.js`. It exposes action callbacks and owns loading/saving. All pure state logic is extracted into `src/hooks/gameReducers.js` as plain functions with no React or side-effects, which makes them unit-testable. `App.jsx` wires state and callbacks down via props — no context, no state library.

**No UI library.** Every component is hand-rolled with plain CSS. This trades upfront effort for full control over touch targets, theming, and interaction patterns: large tap areas, chip counters, custom autocomplete.

**CSS custom properties for theming.** Light and dark mode are handled entirely via `prefers-color-scheme` and a set of semantic tokens defined in `src/index.css`. No runtime theming logic needed.

**Guard identity colors** are defined once in `src/data/constants.js` (`GUARD_COLOR_MAP`) and imported wherever needed. There is no duplicate color map in any component file.

**Equipment stat bonuses** are looked up at render time from `WEAPON_STATS` and `ARMOR_STATS` in `src/data/materials.js`. Attack and defense values shown in the UI are always `baseAtk/baseDef + equipment bonus` — the bonus is never stored in state.

**Tests.** `src/hooks/gameReducers.test.js` covers all pure reducer functions using Vitest. Run with `npm test`.

**Stack:** React 19 · Vite · Plain CSS · Vitest · Cloudflare Pages

---

## Project structure

```
src/
  App.jsx                  # Shell: tabs, top bar, party switcher, log view, settings trigger
  index.css                # Single stylesheet with CSS custom properties (light + dark)
  components/
    GuardPanel.jsx         # Per-guard card: HP, combat stats, equipment, satchel, chips
    CitiesTab.jsx          # City grid: prestige pips + quest checkboxes
    StashTab.jsx           # Party resources (Sil/Lux), stonebound, Fort Istra stash
    CampaignTab.jsx        # Event tokens, locations (fixed + dynamic), plans checklist
    SettingsPanel.jsx      # Bottom-sheet: active party, per-guard config, save/load/reset
    Autocomplete.jsx       # Reusable searchable dropdown (no external library)
  hooks/
    useGameState.js        # All state + action callbacks; loads/saves localStorage
    gameReducers.js        # Pure state-transition functions (unit-testable, no React)
    gameReducers.test.js   # Vitest unit tests for all reducers
  data/
    constants.js           # Guard names, city names, chip types, GUARD_COLOR_MAP, createInitialState()
    materials.js           # Item lists: weapons, armor, accessories, consumables, materials, enemies
    demoSave.json          # Shown on first load when no localStorage save exists
public/
  guards/                  # Guard portrait images (*.webp, lowercase filenames)
```

---

## Development

```bash
npm install
npm run dev        # Vite dev server → http://localhost:5173/
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run test       # Vitest (reducer unit tests)
npm run lint       # ESLint
```

To add a new crafting material: add its name to the appropriate category array in `src/data/materials.js`. It will appear in the stash panel and satchel autocomplete automatically.

To add a weapon or armor with a stat bonus: add the item name to `WEAPONS` or `ARMOR`, and add its bonus value to `WEAPON_STATS` or `ARMOR_STATS`. Items with no entry in the stats lookups default to 0 bonus.

To add guard portraits: place a `.webp` file named in lowercase (e.g. `grigory.webp`) in `public/guards/`. The avatar component falls back to initials if the file is absent.

When adding new top-level state keys: add them to `createInitialState()` in `constants.js`, and add a migration guard in `loadState()` in `useGameState.js` (check if the key is missing on old saves and back-fill from `createInitialState()`).
