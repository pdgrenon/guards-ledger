# The Guard's Ledger

> A campaign companion for *The Isofarian Guard* — tracks all per-guard and per-city state so you can focus on playing, not shuffling tokens.

**[→ Open the app](https://isofarian.averageideas.dev)**

---

## What it does

*The Isofarian Guard* generates a lot of bookkeeping. Each guard has HP, attack, defense, a chip bag, a satchel, and four equipment slots. Six cities each have prestige and three quest tracks. A shared stash holds 60+ crafting materials. A stonebound cube tracker covers the campaign map. Managing all of that on paper, mid-session, is genuinely painful.

This app handles that bookkeeping on your phone, saves automatically after every action, and stays out of the way of the game itself.

---

## Features

### Guard tab

Two guards are active at a time. The active party is configured in Settings; the switcher at the top of the Guard tab toggles between whichever two guards are currently selected.

Each guard card shows:

- **HP** — large numeric display (current / max) with +/− controls
- **Combat stats** — Attack and Defense, each showing the base value plus any equipment bonus, with a breakdown (e.g. "2 base + 3 weapon")
- **Equipment** — Weapon, Armor, Accessory, and Item slots, each with a searchable autocomplete pulling from the full item lists
- **Satchel** — 4 slots by default, expandable to 8 via a toggle. Each slot has a material name (autocomplete) and a quantity (1–4)
- **Chip bag** — Black, Green, Red, and Purple chip counts with +/− controls and a one-tap reset back to each guard's configured starting count

Portrait images load from `public/guards/<name>.webp`. If a portrait is missing the avatar shows the guard's initials instead.

### Cities tab

Six cities: Mir, Razdor, Ryba, Silny, Strofa, and Vouno. Each city card shows:

- **Prestige pips** (0–3) — derived automatically from completed quests; no separate input needed
- **Quest rows** — Puzzle quest, Bounty 1, Bounty 2. Tapping a row toggles it done/undone and the prestige pip count updates instantly

### Stash tab

**Party resources** — Sil and Lux Essence totals, each with step-size buttons (×1, ×5, ×10) and +/− controls.

**Stonebound** — Tracks cube placement across the campaign map. Add location entries, pick a City, Resource node, or Enemy node from grouped dropdowns, set a cube count per location, and adjust the overall cube cap. The header shows cubes used vs. cap and turns red if over budget.

**Fort Istra stash** — Inventory for all craftable materials across 7 categories: Ores, Timber, Animal drops, Tenebris drops, Fish & food, Market & misc, and Special ingredients. Only items with a non-zero count are shown. A filter input narrows by name. A search panel at the bottom lets you add items not yet in the stash.

Items in the stash that serve as a prerequisite for a craftable recipe show an inline "→ Item Name ★★★" hint so you know what they upgrade into.

Any string can also be added as a **custom item** if it doesn't match the predefined material list. Custom items appear under a "Custom items" category and are tracked like any other material.

Tapping a material name in the stash opens a source sheet (see Material sources below).

### Craft tab

A stash-aware recipe reference for all 101 craftable items — weapons, armor, accessories, and consumables.

**Craftability** is calculated against both the Fort Istra stash and the active guards' satchel contents combined, so anything a guard is carrying counts toward the "have" total.

**Filters:**

- **Search** — matches item names, ingredient names, cities, and prereq item names
- **Type** — All / Weapon / Armor / Accessory / Item
- **City** — narrows to recipes craftable in a specific city; affects cost display and prestige discounts
- **Star tier** — minimum tier filter (★ through ★★★★★); 5-star Ft. Istra items are styled distinctly in red
- **Can craft** — hides any recipe that isn't currently ready given your stash, sil, and lux

Results are grouped by type (Weapon, Armor, Accessory, Item) and each card shows:

- Name, type, stat bonus, and bonus chip
- A **Ready / Partial / Missing** status badge
- Guard restriction note (for guard-specific items)
- Prerequisite equipment required (`prereq`)
- Special ingredient requirement for apothecary items (`itemReq`)
- Effect text for accessories and consumables
- Per-ingredient have/need counts; ingredients in the satchel count toward the total
- City and Sil/Lux cost

**Prestige discount** — when a city with prestige 2 or higher is selected, material quantities for standard recipes are reduced (the `qty2R` value). Discounted quantities are shown with the original struck through and the reduced amount beside it. A `2★` badge on the card confirms the discount is active.

Guard-restricted recipes are hidden entirely unless a matching guard is in the active party.

Tapping an ingredient name opens the material source popup.

### Campaign tab

- **Event tokens** — Mountain, Forest, Plains, and Sea token counters (0–3 each). At 3, a "Resolve event" button replaces the +/− controls. Resolving resets the counter to 0.
- **Locations** — Fixed fields for Party, Caravan, Main quest, and Boat. Dynamic lists for Side quests and Bounties (add, edit, and remove entries freely).
- **Session plans** — A simple checklist for anything you want to accomplish this session. Add, check off, and delete entries.

### Session log tab

A reverse-chronological log of all state changes in the current session, capped at 100 entries. Each entry shows a timestamp and a plain-English description of what changed. Guard names in log messages are color-coded to their identity color; "Party" and "Stash" keywords are highlighted in brand ochre; system events (imports, resets) are gray. Each entry has a matching left-border color.

### Material source popup

Tapping any material name in the Stash or Craft tab opens a bottom-sheet with:

- **Enemy drops** — enemies that drop the material
- **Resource nodes** — nodes where it can be farmed (including Ft. Istra acquisition if applicable)
- **Buy at market** — cities that sell it and the price in Sil
- **Sell at market** — cities that buy it and the sell price in Sil; Ft. Istra Apothecary sell prices are shown in Lux Essence

Items with no sell value (Ft. Istra gear, some special items) simply omit the sell section.

Not all materials have source data. The sheet closes by tapping the backdrop, the ✕ button, or pressing Escape.

### Settings

A bottom-sheet overlay (gear icon in the top bar) with:

- **Active party** — two dropdowns to select which guards are in your current party (all 8 guards are always tracked; only the two active ones appear in the Guard tab switcher)
- **Per-guard config** (active party only) — max HP adjustment and starting black chip count
- **Multiplayer** — create or join a campaign for real-time sync with a co-player (see below)
- **Export** — downloads a dated JSON snapshot (`guards-ledger-save-YYYY-MM-DD.json`)
- **Import** — restores from a previously exported file
- **Reset** — wipes all state back to defaults (with confirmation)

---

## Persistence

All state saves to `localStorage` under the key `guards_ledger_v2` automatically after every action. On first load with no saved data the app opens a demo save so the UI isn't empty.

Saves from the previous `v1` format are migrated automatically on first load — no manual action needed.

---

## Multiplayer sync

Two players can share a live campaign using Supabase Realtime. State is split into five independently-synced sections so players writing to different sections simultaneously never clobber each other:

| Section | Keys | Natural owner |
|---|---|---|
| `resources` | `sil`, `lux` | Player tracking currency |
| `cities` | `cities` | Player tracking city quests |
| `guards` | `guards`, `activeParty` | Shared |
| `stash` | `stash`, `stonebound` | Shared |
| `campaign` | `campaign` | Player tracking campaign state |

`activeGuardIdx` (which guard tab each player is viewing) is intentionally excluded — each player controls their own view independently.

**How it works:**

1. One player taps **Create** in Settings → Multiplayer and receives a short code (e.g. `WOLF42`)
2. The co-player taps **Join**, enters the code, and their app loads the current campaign state
3. From that point, every change is pushed to Supabase and received by all connected devices in real time (~100–300ms)
4. If a device goes offline, changes are queued in memory and flushed automatically on reconnect
5. The session log remains local-only on each device — it is not synced

While connected, a campaign pill in the top bar shows the campaign code and a colored dot indicating sync status (green = synced, amber = syncing, gray = offline, red = error). Tapping the pill opens Settings scrolled directly to the Multiplayer section.

Sync is optional. Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured, the app runs as a fully local single-player tool with no errors or degraded functionality.

---

## Tech notes

**Single hook for all state.** Everything lives in `src/hooks/useGameState.js`. It exposes action callbacks and owns loading/saving. All pure state logic is extracted into `src/hooks/gameReducers.js` as plain functions with no React or side-effects, which makes them unit-testable. `App.jsx` wires state and callbacks down via props — no context, no state library.

**Sync is a separate hook.** `src/hooks/useSupabaseSync.js` owns all Supabase interaction — client setup, campaign creation and joining, Realtime subscription, section upserts, and the offline queue. `useGameState` calls `sync.upsertSection(sectionName, state)` after each action; the sync hook is otherwise invisible to the rest of the app.

**Graceful degradation.** The Supabase client is instantiated only when env vars are present. When they are absent — as in a portfolio or local-only deployment — `useSupabaseSync` returns `isConfigured: false` and all sync calls are no-ops. The Multiplayer section in Settings shows a single explanatory line rather than the create/join UI.

**No UI library.** Every component is hand-rolled with plain CSS. This trades upfront effort for full control over touch targets, theming, and interaction patterns: large tap areas, chip counters, custom autocomplete.

**CSS custom properties for theming.** Light and dark mode are handled entirely via `prefers-color-scheme` and a set of semantic tokens (`--c-bg`, `--c-text`, `--c-brand`, `--c-hp`, `--c-green`, eight guard identity color triples, etc.) defined in `src/index.css`. No runtime theming logic needed.

**Guard identity colors** are defined once in `src/data/constants.js` (`GUARD_COLOR_MAP`) and imported wherever needed. There is no duplicate color map in any component file.

**Craft tab is read-only.** `CraftTab` takes `stash`, `sil`, `lux`, `activeParty`, `guards`, and `cities` as props and derives everything from them. It introduces no new state, no reducers, and no localStorage keys.

**Tests.** `src/hooks/gameReducers.test.js` covers all pure reducer functions using Vitest. Run with `npm test`.

**Stack:** React 19 · Vite · Plain CSS · Vitest · Supabase · Cloudflare Pages

---

## Project structure

```
src/
  App.jsx                  # Shell: tabs, top bar, campaign pill, log view, settings trigger
  index.css                # Single stylesheet with CSS custom properties (light + dark)
  components/
    GuardPanel.jsx         # Per-guard card: HP, combat stats, equipment, satchel, chips
    CitiesTab.jsx          # City grid: prestige pips + quest checkboxes
    StashTab.jsx           # Party resources (Sil/Lux), stonebound, Fort Istra stash, custom items
    CraftTab.jsx           # Stash-aware recipe reference: 101 items, filters, prestige discounts
    MaterialSourcePopup.jsx  # Bottom-sheet: where to find or sell a given material/item
    SettingsPanel.jsx      # Bottom-sheet: active party, per-guard config, multiplayer, save/load/reset
    Autocomplete.jsx       # Reusable searchable dropdown (no external library)
  hooks/
    useGameState.js        # All state + action callbacks; loads/saves localStorage; wires sync
    useSupabaseSync.js     # Supabase Realtime sync: campaign create/join, section upserts, offline queue
    gameReducers.js        # Pure state-transition functions (unit-testable, no React)
    gameReducers.test.js   # Vitest unit tests for all reducers
  data/
    constants.js           # Guard names, city names, chip types, GUARD_COLOR_MAP, section factories, createInitialState()
    materials.js           # Item lists, MATERIAL_SOURCES (enemy drops, nodes, market buy/sell prices)
    recipes.js             # All 101 crafting recipes + craftStatus/shortageCount/PREREQ_UPGRADES_TO helpers
    demoSave.json          # Shown on first load when no localStorage save exists
supabase/
  schema.sql               # Campaigns table, RLS policies, Realtime setup — run once in Supabase SQL editor
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

To add a new crafting material: add its name to the appropriate category array in `src/data/materials.js`.

### Supabase setup (multiplayer only)

1. Run `supabase/schema.sql` in the Supabase SQL editor
2. In the Supabase dashboard go to **Database → Replication** and enable Realtime for the `campaigns` table
3. Copy `.env.example` to `.env` and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. `npm install @supabase/supabase-js`
