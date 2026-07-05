# Game data rules

Load this when working on CraftTab, StashTab, recipes, or MATERIAL_SOURCES.

## Crafting

- **CraftTab is read-only.** It derives all display state from props. Do not add crafting state to `useGameState` or new actions to `gameReducers.js`.
- **Craftability checks** merge stash + active guards' satchel slots via `buildCombined` before evaluating a recipe. Do not check stash alone.
- **Ft. Istra recipes never receive prestige discounts.** The city prestige discount logic in `CraftTab` must guard on `isFtIstra`.
- **`ftIstraSell`** pays out in Lux Essence, not Sil. It is a distinct field from `sell` in `MATERIAL_SOURCES`. Do not merge them.

## Stash

- **Stash search** filters out items already present in the stash. It is for adding new items, not a universal item lookup. Do not change this behavior.
- **Speaking stones** (Jade, Black Diamond, Ancient Roots, and others) are tracked as a single quantity usable for either crafting or their speaking stone purpose. There is no separate speaking stone inventory.

## Derived values — never store

- **City prestige (reputation)** — always derive with `cityPrestige(city, campaignId, completedBounties)` from `gameReducers.js` (puzzle quest + the two completed campaign bounties for the active campaign). Do not add a `prestige` field to city state.
- **Equipment stats** — always look up from `WEAPON_STATS` / `ARMOR_STATS` in `materials.js` at render time. Do not store stat values in guard state.
