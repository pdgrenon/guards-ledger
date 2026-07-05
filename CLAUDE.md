# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR → http://localhost:5173/
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint
npm run test       # Vitest — runs pure reducer unit tests
```

## Architecture

Single-page React 19 app (Vite) for tracking game state in *The Isofarian Guard* board game. Deployed to Cloudflare Pages at `https://isofarian.averageideas.dev`.

### State management

All game state lives in one custom hook: `src/hooks/useGameState.js`. It owns:
- loading from / saving to `localStorage` key `guards_ledger_v2` after every action
- all action callbacks (validate → mutate → log → return new state)
- export/import of full state as a dated JSON file (`guards-ledger-save-YYYY-MM-DD.json`)
- wiring each action to its sync section via `useSupabaseSync`

All pure state logic is extracted into `src/hooks/gameReducers.js` — no React, no localStorage, no side-effects. This makes reducers trivially unit-testable. `useGameState` is a thin wiring layer on top.

`App.jsx` calls `useGameState()` and passes state + action callbacks down via props. There is no context, no state library — pure prop drilling.

#### State shape and sync sections

State is flat at the top level (no nesting by section). Sections are a conceptual grouping that maps to Supabase columns for sync purposes:

| Section | State keys | Supabase column |
|---|---|---|
| `resources` | `sil`, `lux` | `resources` |
| `cities` | `cities` | `cities` |
| `party` | `activeParty` | `party` |
| `guard_0` … `guard_7` | one element of `guards` each | `guard_0` … `guard_7` |
| `stash` | `stash`, `stonebound` | `stash` |
| `campaign` | `campaign` | `campaign` |
| local-only | `log`, `settings`, `activeGuardIdx` | — not synced — |

**Guards are split into one column per guard (`guard_0` … `guard_7`).** Each guard mutation in `useGameState` syncs to only that guard's column via `guardColumn(idx)`, so two players editing different guards at the same time never overwrite each other (AVE-83). The local state shape is unchanged — `state.guards` is still a flat 8-element array; the split exists only at the sync/column boundary. The shared two-element party selection (`activeParty`) lives in its own `party` section.

`activeGuardIdx` is local-only even though it lives alongside guards in state. It tracks which guard tab each player is viewing — a per-device UI concern, not shared campaign data. `setActiveGuard` passes `null` as the section name so it never triggers a sync upsert. `handleRemoteChange` in `useGameState` and the section maps in `useSupabaseSync` both exclude it so it is never overwritten by a remote update.

Each action in `useGameState` calls `setState(reducer, sectionName)` where `sectionName` is the section that action modifies. `setState` persists to localStorage and calls `sync.upsertSection(sectionName, nextState)` in one step.

#### localStorage versioning and migration

- Current key: `guards_ledger_v2`
- Previous key: `guards_ledger_v1` (flat shape, no section factories)
- On first load, if `v2` is absent but `v1` is present, `migrateV1()` in `useGameState.js` converts the old save and writes it under the new key. Migration runs once.
- `importState` also accepts v1-format JSON exports via the same migration path.
- `activeGuardIdx` is always reset to its initial value on load (regardless of what was saved), since it is local-only UI state that should not persist across sessions.

#### Section factories

`src/data/constants.js` exports individual section factory functions alongside `createInitialState`:

```js
createInitialResources()  // { sil, lux }
createInitialCities()     // { cities }
createInitialGuards()     // { guards, activeParty, activeGuardIdx }
createInitialStash()      // { stash, stonebound }
createInitialCampaign()   // { campaign }
createInitialState()      // all of the above + log + settings
```

Use the section factories in `migrateV1` and anywhere you need to initialize just one section without touching others. Do not add fields directly to `createInitialState` without also adding them to the appropriate section factory.

### Sync (Supabase Realtime)

`src/hooks/useSupabaseSync.js` owns all Supabase interaction. `useGameState` calls it and receives a `sync` handle; `App.jsx` passes `sync` to `SettingsPanel` for the create/join/leave UI.

**Key behaviors:**
- The Supabase client is `null` when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent. All sync calls silently no-op. The app runs as a fully local tool.
- `sync.upsertSection(sectionName, state)` extracts the relevant keys (or, for a `guard_N` column, that one guard object) and calls the **`merge_section` RPC** (not a raw `UPDATE`) — it never writes local-only keys (`log`, `settings`, `activeGuardIdx`). The server-side RPC performs a **field-level deep merge** of the incoming payload into the existing column, so two players editing different keys in the same section concurrently don't lose each other's writes. The merge is **array-aware**: arrays of `id`-keyed objects (cities, `campaign.plans`, `campaign.locations.sideQuests`/`bounties`, `stonebound.locations`) are merged element-by-id — existing elements preserved, matching ids deep-merged, new ids appended — and arrays of plain values (`campaign.completedEncounters`) are merged as a set union, so concurrent edits to *different* array elements no longer clobber each other. The only remaining unmerged case is two players editing the *same* field of the same key/array element at the same instant (a CRDT problem, accepted limitation). See `supabase/migrations/0002_field_level_merge.sql` (object merge) and `supabase/migrations/0003_array_merge.sql` (array merge) for the merge functions. (AVE-94, AVE-197.)
- When offline, upserts are queued in a `Map` (keyed by section name, so later writes replace earlier ones for the same section). The queue is flushed automatically on reconnect via the `online` event. Each queued section is sent through `merge_section` independently on flush.
- `useGameState`'s debounce collects a **set** of pending sections per window and flushes each — so editing two different guards within one debounce window upserts both columns rather than dropping one.
- Echo suppression on inbound Realtime updates is **value-based**: a section is skipped only if the incoming value deeply equals the current local value. This replaced the older 3-second wall-clock window, which was dropping legitimate concurrent changes (AVE-82, AVE-84).
- On `joinCampaign`, the full remote row is fetched (and passed through `normalizeRow`) and every section in `ALL_SECTIONS` is merged into local state. `log`, `settings`, and `activeGuardIdx` are preserved from local.
- Realtime subscription uses `postgres_changes` filtered to `id=eq.{campaignId}`. On `UPDATE`, every remote section in `ALL_SECTIONS` is applied to the current local state (subject to value-based echo suppression); local-only keys are preserved.
- `normalizeRow` reshapes a pre-AVE-83 row (single `guards` blob `{ guards:[…], activeParty:[…] }`) into per-guard columns + `party` on read, so the client tolerates a database that hasn't yet had the `supabase/migrations/0001_split_guards_per_column.sql` migration applied.
- Campaign IDs are random short alphanumeric codes (e.g. `WOLF42`) stored in `localStorage` under `guards_ledger_campaign_id`.

**`sync` handle shape** (returned by `useSupabaseSync`, exposed via `useGameState`):
```js
{
  campaignId,       // string | null
  syncStatus,       // 'idle' | 'syncing' | 'error' | 'offline'
  syncError,        // string | null
  upsertSection,    // (sectionName, state) => void
  createCampaign,   // () => Promise<{ id, error }>
  joinCampaign,     // (code) => Promise<{ state, error }>
  leaveCampaign,    // () => void
  isConfigured,     // boolean — false when Supabase env vars are absent
}
```

### Component structure

- **`App.jsx`** — shell: tab nav (`Guards`, `Cities`, `Stash`, `Crafting`, `Campaign`, `More`), top bar, party switcher, session log view, settings overlay trigger. Also owns `sourceItem` state and renders `MaterialSourcePopup` at the app level so it overlays everything correctly. Passes `sync={game.sync}` to `SettingsPanel`. When a campaign is active, shows a **campaign pill** in the top bar with the campaign code and a sync-status dot (green/amber/gray/red); tapping it opens Settings scrolled directly to the Multiplayer section. Log messages are colorized via `colorizeLogMessage` — guard names are highlighted in their identity color, "Party" and "Stash" in brand ochre; each log entry also has a colored left border keyed to the same classification.
- **`GuardPanel.jsx`** — HP number display, combat stats (Atk/Def with equipment bonuses shown), equipment, satchel
- **`CitiesTab.jsx`** — city grid: prestige pips (derived, not stored) + quest checkboxes
- **`StashTab.jsx`** — party resources (Sil/Lux), stonebound cube tracker, Fort Istra stash. Stash items show inline "upgrades into →" hints when they are a prereq for a recipe (from `PREREQ_UPGRADES_TO`). Supports custom items (arbitrary strings not in the predefined list, tracked in a separate "Custom items" category). Accepts `onShowSource` prop; tapping a material name with source data calls it.
- **`CraftTab.jsx`** — stash-aware recipe reference; filters by type, city, star tier, and craftability; search matches item names, material names, cities, and prereq names; combines stash + active guards' satchel contents for craftability checks; applies prestige 2+ material discounts when a city is selected; shows stash-aware "have/need" quantities per ingredient with strikethrough for discounted amounts; hides guard-restricted items unless that guard is in the active party. Accepts `onShowSource` prop; tapping any ingredient name with source data calls it.
- **`MaterialSourcePopup.jsx`** — bottom-sheet overlay showing where to acquire or sell a given material/item. Reads from `MATERIAL_SOURCES` in `materials.js`. Rendered at App level via a `fixed` backdrop. Closes on backdrop tap, ✕ button, or Escape key. No state of its own beyond the `item` prop passed from App.
- **`SettingsPanel.jsx`** — bottom-sheet overlay: active party selectors, per-guard max HP, multiplayer (create/join/leave campaign + sync status), export/import/reset. Accepts `sync` prop from App.
- **`Autocomplete.jsx`** — reusable searchable dropdown (no external library); max 12 results, case-insensitive

### Static data

- **`src/data/constants.js`** — guard names, city names, `GUARD_COLOR_MAP` (single source of truth for guard identity colors), `FALLBACK_COLOR`, section factories, and `createInitialState()`
- **`src/data/materials.js`** — crafting material categories, `ALL_MATERIALS`, `ALL_ITEMS_WITH_CATEGORY` (pre-computed `{ item, category }` pairs for the stash UI), `RESOURCE_NODE_ITEMS`, `ENEMIES`, `WEAPONS`, `ARMOR`, `ACCESSORIES`, `ITEMS`, `WEAPON_STATS`, `ARMOR_STATS`, and `MATERIAL_SOURCES`
- **`src/data/recipes.js`** — all 101 crafting recipes as a static `RECIPES` array; helper functions `minCraftCost`, `craftCities`, `craftCostForCity`, `availableInCity`, `craftStatus`, and `shortageCount`; and the pre-computed `PREREQ_UPGRADES_TO` map (item name → `{ name, stars, isFtIstra }` of the recipe it unlocks — used by StashTab to show inline upgrade hints). See the shape comment at the top of that file.
- **`src/data/demoSave.json`** — loaded on first run when no localStorage key exists; uses v1 flat shape and is migrated automatically

### Guards

8 playable guards: Grigory, Alek, Catherine, Yury, Kharzin, Vera, Pavel, Yana.

Two guards are active at a time (`state.activeParty`, a 2-element name array). The active party is selected in SettingsPanel. The guard tab shows a switcher between the two active guards; `state.activeGuardIdx` tracks which one is currently visible (index into the full 8-guard array, not into activeParty).

**`activeGuardIdx` is local-only and never synced.** It represents which guard tab the local player is viewing — a per-device UI preference. `setActiveGuard` passes `null` as the section name (not `'guards'`). `handleRemoteChange` explicitly preserves the local value, and `SECTION_KEYS` in `useSupabaseSync` does not include it. Do not add it back to the sync section.

Each guard in state has: `name`, `hp`, `maxHp`, `baseAtk`, `baseDef`, `expandedSatchel`, `satchel` (8-slot array of `{ item, qty }`), `equipment` (`{ weapon, armor, accessory, item }`).

**Guard identity colors** are defined in `GUARD_COLOR_MAP` in `src/data/constants.js`. Each entry: `{ key, border, bg, text }` where `key` is the CSS variable suffix (e.g. `'amber'` → `--c-guard-amber-*`). Import from constants — do not redefine this map in component files.

Portrait images live in `public/guards/` named in lowercase (e.g. `grigory.webp`). `GuardAvatar` in `GuardPanel.jsx` falls back to initials automatically on `onError`.

### Cities

6 cities: Mir, Razdor, Ryba, Silny, Strofa, Vouno.

City state shape: `{ id, name, puzzleQuestDone, bounty1Done, bounty2Done }`.

**Prestige is never stored.** Always derive it with `cityPrestige(city)` from `gameReducers.js`, which counts the three boolean quest fields. Do not add a `prestige` field to city state.

### Stash

`state.stash` is a plain object mapping item name → integer count. Keys are omitted when count reaches 0 (cleaned up by `reduceAdjustStash`). All 60+ material names are defined in `MATERIAL_CATEGORIES` in `materials.js`.

Any string that doesn't match a predefined material name can be added as a **custom item**. Custom items are stored in `state.stash` like any other item and rendered under a "Custom items" category. `ALL_KNOWN_ITEMS` (a `Set` exported from `materials.js`) is the predefined-item membership test.

Stash items that appear as a `prereq` in any recipe show an inline **"→ Item Name ★★★"** upgrade hint in the stash UI, sourced from `PREREQ_UPGRADES_TO` in `recipes.js`. The lowest-star recipe matching each prereq is shown.

### Stonebound

`state.stonebound`: `{ max: number, locations: Array<{ type, selection, count }> }`. `type` is one of `'City'`, `'Resource node'`, `'Enemy node'` and is derived from the selection when set — it is not independently editable in the UI.

### Campaign

`state.campaign`: `{ eventTokens: { mountain, forest, plains, sea }, locations: { party, caravan, mainQuest, boat, sideQuests[], bounties[] }, plans[] }`.

### Craft tab

`CraftTab` is a **read-only** component. It receives `stash`, `sil`, `lux`, `activeParty`, `guards`, `cities`, and `onShowSource` as props and derives all display state from them. It owns no state beyond local UI state (search string, active filters). Do not add crafting state to `useGameState` — the tab intentionally introduces no new persistence.

**Combined inventory for craftability:** `buildCombined(stash, activeGuards)` merges the Fort Istra stash with the active guards' satchel contents. All craftability checks (`craftStatus`) and have/need counts run against this combined total — items a guard is carrying count toward the "have" amount.

**Filters:**
- **Search** — matches recipe names, ingredient names, city names, and prereq item names
- **Type** — All / Weapon / Armor / Accessory / Item (dropdown)
- **City** — filters to recipes craftable in a specific city; affects cost display (city-specific Sil prices) and whether the prestige discount applies. Cities with prestige ≥ 2 show a `✦` suffix in the dropdown.
- **Star tier** — minimum star pill filter (All / ★ / ★★ / ★★★ / ★★★★ / ★★★★★); 5-star tier is styled in red to distinguish Ft. Istra items
- **Can craft** — hides recipes not currently `'ready'`

Results are grouped by type (Weapon, Armor, Accessory, Item).

**Prestige discount:** When a city with prestige ≥ 2 is selected, material quantities use `qty2R` (the reduced amount) instead of `qty` for standard (non-Ft. Istra) recipes. Discounted ingredients show the original quantity struck through with the reduced quantity beside it. A `2★` badge appears on the card footer when the discount is active.

`craftStatus(recipe, stash, sil, lux, selectedCity, cityPrestigeLevel)` returns `'ready' | 'partial' | 'missing'`:
- **ready** — all materials satisfied AND currency satisfied (city-specific or minimum Sil price, or Lux for Ft. Istra items)
- **partial** — at least one material present but not all requirements met
- **missing** — none of the required materials are in stash

Guard-restricted recipes (`limitedTo` is non-empty) are hidden entirely from the list if no matching guard is in `activeParty`. When a matching guard is active, a restriction note is shown on the card.

Recipe data lives entirely in `src/data/recipes.js`. Each recipe has this shape:

```js
{
  name: string,
  type: 'Armor' | 'Weapon' | 'Accessory' | 'Item',
  city: string,           // human-readable, comma-separated for multi-city
  isFtIstra: boolean,
  stars: 1–5,             // 5 = Ft. Istra endgame tier (shown in red)
  statBonus: string|null, // e.g. '3⛊' or '2👊'
  bonusChip: string|null,
  effect: string|null,    // accessories/items only
  craftCost: number | { CityName: number } | null,
  luxCost: number|null,
  prereq: string|null,    // item that must be equipped first
  itemReq: string|null,   // special ingredient (apothecary items)
  limitedTo: string[],    // guard names; empty = available to all
  materials: Array<{
    name: string,
    qty: number,          // base quantity required
    qty2R: number|null,   // reduced quantity at prestige 2+ in a qualifying city; null = no discount (Ft. Istra, speaking-stone items)
    isSpeakingStone: boolean,
  }>,
}
```

Guard-restricted recipes (`limitedTo` is non-empty) are hidden entirely from the list if no matching guard is in `activeParty`. When a matching guard is active, a restriction note is shown on the card.

### MATERIAL_SOURCES

`MATERIAL_SOURCES` is a plain object exported from `materials.js` mapping item name → source descriptor. It is the sole data source for `MaterialSourcePopup`. Each entry has up to six optional fields:

```js
{
  enemies?: string[],                         // enemy names that drop this material
  nodes?: string[],                           // resource node names
  ftIstra?: { label: string, luxPer4: number }, // Ft. Istra acquisition (shown under nodes if nodes exist, standalone otherwise)
  market?: { city: string, price: number }[], // cities that sell it and the Sil price
  sell?: { city: string, price: number }[],   // cities that buy it and the Sil sell price
  ftIstraSell?: number,                       // Ft. Istra Apothecary sell price in Lux Essence (not Sil)
}
```

### Styling

Single `src/index.css` with CSS custom properties for light/dark theming. Dark mode via `prefers-color-scheme`. No UI library. Typography: Cinzel (display, via Google Fonts), system UI (body).

Key CSS conventions:
- Guard identity: `.guard-avatar.amber`, `.guard-avatar.gold`, etc. — class name matches the `key` from `GUARD_COLOR_MAP`
- Section labels inside guard cards: `.sec-label-primary` (uses `--guard-color` CSS var set on the card wrapper)
- Resource number displays (Sil, Lux): `.resource-value`
- City color: `--c-city` (alias of `--c-brand`)
- Craft card status borders: `.craft-card--ready` (green), `.craft-card--partial` (amber), `.craft-card--missing` (muted)
- Craft star colors: `.craft-stars` (ochre brand), `.craft-stars--ft` (red, for 5-star Ft. Istra items)
- Material source trigger: `.mat-source-trigger` — full browser button reset; compound selectors `.stash-row-name.mat-source-trigger` and `.craft-mat-name.mat-source-trigger` explicitly set the correct `font-size` and `color` to match the spans they replace
- Source popup: `.source-popup-backdrop`, `.source-popup`, `.source-chip`, `.source-section-label` — bottom-sheet pattern matching the existing SettingsPanel
- Sell price chips: `.source-chip--sell` — green-tinted variant of `.source-chip`

### Testing

`src/hooks/gameReducers.test.js` covers all pure reducer functions. `src/hooks/useSupabaseSync.helpers.test.js` covers the pure section ↔ column helpers (`extractSection`, `applyRemoteSection`, `normalizeRow`, the `guard_N` column helpers). Run with `npm test`. There are no component tests.

### Supabase setup

For local development with multiplayer enabled:

1. Run `supabase/schema.sql` in the Supabase SQL editor (fresh installs). For a database created before AVE-83, instead run the one-time `supabase/migrations/0001_split_guards_per_column.sql` to split the old single `guards` column into per-guard columns.
2. Run `supabase/migrations/0002_field_level_merge.sql` to install the `merge_section` RPC and `deep_merge_jsonb` helper. (Idempotent `CREATE OR REPLACE` — safe to re-run.)
3. Run `supabase/migrations/0003_array_merge.sql` to install the `merge_jsonb_array_by_id` helper and the array-aware update to `deep_merge_jsonb`. (Idempotent `CREATE OR REPLACE` — safe to re-run.)
4. In the Supabase dashboard go to **Database → Replication** and enable Realtime for the `campaigns` table (the schema also attempts this via `alter publication`)
5. Copy `.env.example` to `.env` and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
6. `npm install @supabase/supabase-js`

Without these env vars the app runs as a local-only tool — no errors, sync is simply disabled.

### Deployment

The live app is deployed to **Cloudflare Pages** at `https://isofarian.averageideas.dev` (the canonical production URL).

There is also a GitHub Pages deploy workflow (`.github/workflows/deploy.yml`) that triggers on pushes to the **`first-draft`** branch. **This is intentional and must not be "fixed" or cleaned up.** The `first-draft` branch deliberately holds an early-draft snapshot of the codebase so it can be deployed and compared side-by-side against the current version — it exists to showcase the difference between the first draft and the latest code. The workflow targeting `first-draft` (rather than `main`) is therefore correct by design. Do not assume it is dead config, and do not point it at `main`.
