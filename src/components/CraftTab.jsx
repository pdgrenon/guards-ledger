// src/components/CraftTab.jsx
import { useState, useMemo, useEffect, useCallback, useDeferredValue, memo } from 'react';
import { RECIPES, craftStatus, craftCostForCity, availableInCity, buildCombined, parseItemReq, aggregateMaterials, upgradeDelta, shortageCount, ftIstraLock } from '../data/recipes';
import { CITIES } from '../data/constants';
import { cityPrestige } from '../hooks/gameReducers';
import { MaterialName } from './MaterialName';

const CITY_NAMES = CITIES.map(c => c.name);
const TYPE_ORDER = ['Weapon', 'Armor', 'Accessory', 'Item'];
const STAR_LABELS = ['All', '★', '★★', '★★★', '★★★★', '★★★★★'];
// Default for an absent ftIstraBuildings prop — one shared object, so the
// `filtered` memo that depends on it doesn't recompute on every render.
const NO_BUILDINGS = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function starsLabel(n) {
  return '★'.repeat(n);
}

function formatCost(recipe, selectedCity) {
  if (recipe.luxCost) return `${recipe.luxCost} lux`;
  if (recipe.craftCost === null) return null;
  if (selectedCity) {
    const cost = craftCostForCity(recipe, selectedCity);
    return cost !== null ? `${cost} sil` : null;
  }
  if (typeof recipe.craftCost === 'number') return `${recipe.craftCost} sil`;
  const entries = Object.entries(recipe.craftCost);
  if (entries.length === 1) return `${entries[0][1]} sil`;
  const min = Math.min(...entries.map(([, v]) => v));
  const max = Math.max(...entries.map(([, v]) => v));
  return min === max ? `${min} sil` : `${min}–${max} sil`;
}

function formatCityBreakdown(recipe, selectedCity) {
  if (selectedCity) return selectedCity;
  if (!recipe.craftCost || typeof recipe.craftCost === 'number') return recipe.city;
  if (recipe.luxCost) return recipe.city;
  const entries = Object.entries(recipe.craftCost);
  if (entries.length <= 1) return recipe.city;
  return entries.map(([city, cost]) => `${city} ${cost} sil`).join(' · ');
}

// The upgrade line's text. The sign carries the meaning; the green on a better
// line is reinforcement, never the only signal (WCAG 1.4.1).
function upgradeText({ delta, isEquipped }, glyph, equippedName) {
  if (isEquipped) return 'Equipped';
  if (equippedName === '') return `+${delta} ${glyph} (slot empty)`;
  if (delta > 0) return `+${delta} ${glyph} vs ${equippedName}`;
  if (delta === 0) return `±0 ${glyph} vs ${equippedName}`;
  return `−${Math.abs(delta)} ${glyph} vs ${equippedName}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'ready') {
    return (
      <span className="craft-status-badge craft-status-ready">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Ready
      </span>
    );
  }
  if (status === 'partial') {
    return <span className="craft-status-badge craft-status-partial">Partial</span>;
  }
  if (status === 'locked') {
    return <span className="craft-status-badge craft-status-missing">Locked</span>;
  }
  return <span className="craft-status-badge craft-status-missing">Missing</span>;
}

/**
 * One recipe card. **Memoized — every prop must stay referentially stable.**
 *
 * The list is up to 90 cards / ~2,300 DOM nodes, so an unmemoized card meant
 * every keystroke in the search box re-rendered every surviving card. See the
 * note at the single call site below, and the measurements in CLAUDE.md.
 *
 * `memo` is not self-defending: an inline lambda or a fresh object literal
 * passed from the call site makes every card re-render anyway, silently, with
 * no failing test and no visible symptom. That is a real risk here only because
 * the props are cheap to keep stable — `combined` is already useMemo'd,
 * `onShowSource` is a setState function, and the rest are primitives — so
 * keeping them that way is the whole contract.
 */
const RecipeCard = memo(function RecipeCard({ recipe, combined, sil, lux, onShowSource, selectedCity, cityPrestigeLevel, forGuard, equippedWeapon, equippedArmor, prereqEquippedBy, prereqGuardNames, lockedBy, upgradesInto, onOpenRecipe }) {
  // Party-restricted recipes with no matching active guard are already filtered
  // out before this renders, so no early-return guard is needed here.
  const useDiscount = selectedCity !== null && cityPrestigeLevel >= 2 && !recipe.isFtIstra;
  const status = craftStatus(recipe, combined, sil, lux, selectedCity, cityPrestigeLevel);
  const itemReqs = parseItemReq(recipe.itemReq);
  const cost = formatCost(recipe, selectedCity);
  const cityLine = formatCityBreakdown(recipe, selectedCity);

  // Upgrade comparison: only with a guard picked, and only for Weapon/Armor,
  // against what that guard has in the slot the crafted item would replace.
  const equippedName = recipe.type === 'Weapon' ? equippedWeapon : equippedArmor;
  const cmp = forGuard !== null ? upgradeDelta(recipe, equippedName) : null;
  const glyph = recipe.type === 'Weapon' ? '👊' : '⛊';
  const notUpgrade = cmp !== null && (cmp.isEquipped || cmp.delta <= 0);

  // A green Ready on something the fort can't make yet was the bug, so a
  // locked recipe reads Locked; its have/need rows still show progress.
  const badge = lockedBy !== null ? 'locked' : status;
  const borderClass =
    badge === 'ready' ? 'craft-card--ready' :
    badge === 'partial' ? 'craft-card--partial' :
    'craft-card--missing';

  return (
    <div className={`card craft-card ${borderClass}${notUpgrade ? ' craft-card--not-upgrade' : ''}`}>
      {/* Header */}
      <div className="craft-card-header">
        <div className="craft-card-header-left">
          <div className="craft-card-name">{recipe.name}</div>
          <div className="craft-card-meta">
            {recipe.type}
            {recipe.statBonus && <> · {recipe.statBonus}</>}
            {recipe.bonusChip && <> · {recipe.bonusChip}</>}
          </div>
        </div>
        <div className="craft-card-header-right">
          <span className={`craft-stars${recipe.isFtIstra ? ' craft-stars--ft' : ''}`}>
            {starsLabel(recipe.stars)}
          </span>
          <StatusBadge status={badge} />
        </div>
      </div>

      {/* Not .craft-prereq: that row wraps (for its status line), and under
          wrap this text was too long to share a line with its icon, so the
          icon sat alone above it on every phone width. */}
      {lockedBy !== null && (
        <div className="craft-lock">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="2.25" y="5.25" width="7.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 5.25V3.75a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {`Needs ${lockedBy} — set it in Campaign › Fort Istra Buildings`}
        </div>
      )}

      {cmp !== null && (
        <div className="craft-upgrade">
          <span className={`craft-upgrade-value${cmp.delta > 0 && !cmp.isEquipped ? ' craft-upgrade-value--better' : ''}`}>
            {upgradeText(cmp, glyph, equippedName)}
          </span>
        </div>
      )}

      {/* Guard restriction note — the item's full restriction, not just the
          guards who happen to be in the party: intersecting with the party made
          Alek/Yury gear read "Alek only" whenever Yury was benched. */}
      {recipe.limitedTo.length > 0 && (
        <div className="craft-restriction">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1L6 6M6 8.5V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          {recipe.limitedTo.join(', ')} only
        </div>
      )}

      {/* Prereq */}
      {recipe.prereq && (
        <div className="craft-prereq">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Requires <strong>{recipe.prereq}</strong> equipped</span>
          {/* Display only: Ready still ignores the prereq, since a player may
              equip it right before crafting. On its own line, because as a
              third inline item it squeezed the row into columns on a phone. */}
          <span className="craft-prereq-status-line">
            {prereqEquippedBy
              ? <span className="craft-prereq-status craft-prereq-status--ok">✓ Equipped by {prereqEquippedBy}</span>
              : <span className="craft-prereq-status">Not equipped by {prereqGuardNames}</span>}
          </span>
        </div>
      )}

      {/* The other direction of the prereq chain: every recipe that needs this
          one equipped. Every target, not just the lowest-star one — the point
          is to see where a chain branches. */}
      {upgradesInto && (
        <div className="craft-upgrades">
          <span className="craft-upgrades-label">Upgrades into</span>
          {upgradesInto.map(t => (
            <button key={`${t.name}-${t.city}`} type="button" className="craft-upgrades-link" onClick={() => onOpenRecipe(t.name)}>
              {t.name} {starsLabel(t.stars)}
            </button>
          ))}
        </div>
      )}

      {/* Special item requirement (apothecary) — counted toward craftability,
          so show have/need per item exactly like the material rows (AVE-783). */}
      {itemReqs.length > 0 && (
        <>
          <div className="craft-prereq">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            Needs
          </div>
          <div className="craft-materials">
            {itemReqs.map(req => {
              const have = combined[req.name] ?? 0;
              const ok   = have >= req.qty;
              return (
                <div key={req.name} className="craft-mat-row">
                  <MaterialName item={req.name} className="craft-mat-name" onShowSource={onShowSource} />
                  <span className={`craft-mat-qty ${ok ? 'craft-mat-qty--have' : 'craft-mat-qty--short'}`}>
                    {have} / {req.qty}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Effect (accessories/items) */}
      {recipe.effect && (
        <div className="craft-effect">{recipe.effect}</div>
      )}

      {/* Materials */}
      {recipe.materials.length > 0 && (
        <div className="craft-materials">
          {/* Grouped by name, not one row per entry: a material listed twice
              (Ground Shaker's 8 Diamond + 2 Diamond as speaking stones) is one
              stash key, so two rows would show two independently-satisfiable
              numbers for a single 10-Diamond requirement. */}
          {aggregateMaterials(recipe.materials, useDiscount).map(mat => {
            const have = combined[mat.name] ?? 0;
            const ok = have >= mat.need;
            return (
              <div key={mat.name} className="craft-mat-row">
                <MaterialName item={mat.name} className="craft-mat-name" onShowSource={onShowSource}>
                  {mat.name}
                  {mat.stoneQty > 0 && (
                    <span className="craft-stone-tag">
                      {mat.stoneQty === mat.qty
                        ? ' · speaking stone'
                        : ` · ${mat.stoneQty} as speaking stone`}
                    </span>
                  )}
                </MaterialName>
                <span className={`craft-mat-qty ${ok ? 'craft-mat-qty--have' : 'craft-mat-qty--short'}`}>
                  {have} / {mat.showDiscount
                    ? <><s className="craft-mat-qty-original">{mat.qty}</s> {mat.need}</>
                    : mat.need
                  }
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* City + cost footer */}
      <div className="craft-city-row">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="1" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M4 11V7h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M1 4l5-3 5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="craft-city-text">{cityLine}</span>
        {cost && <span className="craft-cost-badge">{cost}</span>}
        {useDiscount && (
          <span className="craft-discount-badge" title="Prestige 2+ discount active">2★</span>
        )}
      </div>
    </div>
  );
});

// ── Main component ─────────────────────────────────────────────────────────────

export function CraftTab({ stash, sil, lux, activeParty, guards, cities, campaignId, completedBounties, completedPuzzleQuests, ftIstraBuildings = NO_BUILDINGS, onShowSource, searchSeed, onSeedApplied }) {
  const [search, setSearch] = useState('');
  // The input is driven by `search` (immediate, so typing never feels laggy);
  // the *list* is filtered by the deferred copy, so React renders up to 90 cards
  // at interruptible low priority and abandons an in-progress list render when
  // the next keystroke lands. This is the half of the fix that carries the win —
  // see CLAUDE.md for the numbers. A setTimeout debounce would be strictly
  // worse: it adds fixed latency instead of yielding.
  //
  // Do NOT switch the `filtered` memo back to `search`. It looks equivalent and
  // silently reverts the whole change; nothing in the test suite can catch it,
  // because the benefit is scheduling-priority-dependent and jsdom cannot
  // observe it.
  const deferredSearch = useDeferredValue(search);
  const [typeFilter, setTypeFilter] = useState('All');
  const [minStars, setMinStars] = useState(0);
  const [canCraftOnly, setCanCraftOnly] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);
  // Card order within each type section. Not reset by the deep-link seed:
  // sorting reorders cards but never hides one.
  const [sortBy, setSortBy] = useState('book');
  // "Crafting for": null means Both — the whole active party, today's list.
  const [forGuard, setForGuard] = useState(null);
  const [exclusiveOnly, setExclusiveOnly] = useState(false);
  // Starts null (not the incoming nonce) so a seed present on the very first
  // mount — the common case, since this tab is unmounted until the deep-link
  // switches to it — still counts as "changed" and gets applied.
  const [seedNonce, setSeedNonce] = useState(null);

  // Show one recipe: search for it and clear every filter that could hide it.
  // Shared by the global-search deep link and the cards' "Upgrades into"
  // links, so both always reset the same filters. The sort is left alone —
  // it reorders cards but never hides one. Stable (setters only), so passing
  // it to the memoised cards costs nothing.
  const openRecipe = useCallback(name => {
    setSearch(name);
    setTypeFilter('All');
    setMinStars(0);
    setCanCraftOnly(false);
    setSelectedCity(null);
    setForGuard(null);
    setExclusiveOnly(false);
  }, []);

  // Deep-link from global search: seed the search box with the recipe name and
  // clear any active filters so the target recipe is guaranteed to be visible.
  // Adjust-state-on-prop-change during render (the pattern Autocomplete uses),
  // keyed on the seed's nonce so re-selecting the same recipe re-applies.
  if (searchSeed && searchSeed.nonce !== seedNonce) {
    setSeedNonce(searchSeed.nonce);
    openRecipe(searchSeed.term);
  }

  // The seed is a one-shot — tell the parent to clear it once consumed so it
  // can't re-apply on a later manual return to this tab. Calls only the parent
  // setter (no local setState), so it's not a cascading-render concern.
  useEffect(() => {
    if (searchSeed) onSeedApplied?.();
  }, [searchSeed, onSeedApplied]);

  const activePartyNames = useMemo(() => activeParty ?? [], [activeParty]);

  // Derived against the current party rather than reset in an effect, so a
  // party swap can never leave the list filtered for a guard who left it.
  const selectedGuard = forGuard !== null && activePartyNames.includes(forGuard) ? forGuard : null;
  const exclusive = selectedGuard !== null && exclusiveOnly;

  // What the selected guard has equipped, as plain strings so the memoised
  // cards compare them by value (empty when nothing is equipped).
  const selectedGuardObj = selectedGuard !== null ? (guards ?? []).find(g => g.name === selectedGuard) : null;
  const equippedWeapon = selectedGuardObj?.equipment?.weapon ?? '';
  const equippedArmor  = selectedGuardObj?.equipment?.armor ?? '';

  // Whose equipment satisfies a prereq: the selected guard, or anyone in the
  // party under Both — either could be the one receiving the upgrade.
  const prereqGuards = selectedGuard !== null ? [selectedGuard] : [...new Set(activePartyNames)];
  const prereqGuardNames = prereqGuards.join(' or ');
  // Called per card during render, never passed down, so it needn't be stable;
  // it returns a string (or null), which the memoised card compares by value.
  function prereqEquippedBy(recipe) {
    if (!recipe.prereq) return null;
    return prereqGuards
      .filter(name => Object.values((guards ?? []).find(g => g.name === name)?.equipment ?? {}).includes(recipe.prereq))
      .join(', ');
  }

  const activeGuards = useMemo(
    () => (guards ?? []).filter(g => activePartyNames.includes(g.name)),
    [guards, activePartyNames]
  );

  // prereq name → the recipes requiring it equipped, in RECIPES order, limited
  // to recipes the party can use (the list filter's rule) so a link never
  // lands on a hidden card. Memoised on the party so each card's array stays
  // referentially stable across keystrokes.
  const upgradesFor = useMemo(() => {
    const map = {};
    for (const r of RECIPES) {
      if (!r.prereq) continue;
      if (r.limitedTo.length > 0 && !r.limitedTo.some(g => activePartyNames.includes(g))) continue;
      (map[r.prereq] ??= []).push(r);
    }
    return map;
  }, [activePartyNames]);
  const combined = useMemo(
    () => buildCombined(stash, activeGuards),
    [stash, activeGuards]
  );

  // Build prestige map from cities prop. Reputation is campaign-scoped, so the
  // crafting discount reflects each city's standing in the active campaign.
  const prestigeMap = useMemo(() => {
    const map = {};
    for (const city of (cities ?? [])) {
      map[city.name] = cityPrestige(city, campaignId, completedBounties, completedPuzzleQuests);
    }
    return map;
  }, [cities, campaignId, completedBounties, completedPuzzleQuests]);

  const cityPrestigeLevel = selectedCity ? (prestigeMap[selectedCity] ?? 0) : 0;

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return RECIPES.filter(r => {
      if (typeFilter !== 'All' && r.type !== typeFilter) return false;
      if (minStars > 0 && r.stars < minStars) return false;
      // City filter: hide recipes not available in selected city
      if (selectedCity && !availableInCity(r, selectedCity)) return false;
      if (canCraftOnly && (craftStatus(r, combined, sil, lux, selectedCity, cityPrestigeLevel) !== 'ready' || ftIstraLock(r, ftIstraBuildings) !== null)) return false;
      if (r.limitedTo.length > 0 && !r.limitedTo.some(g => activePartyNames.includes(g))) return false;
      if (selectedGuard !== null && r.limitedTo.length > 0 && !r.limitedTo.includes(selectedGuard)) return false;
      if (exclusive && !r.limitedTo.includes(selectedGuard)) return false;
      if (q) {
        const nameMatch = r.name.toLowerCase().includes(q);
        const matMatch = r.materials.some(m => m.name.toLowerCase().includes(q));
        const cityMatch = r.city.toLowerCase().includes(q);
        const prereqMatch = r.prereq?.toLowerCase().includes(q) ?? false;
        // The five apothecary recipes carry no materials — their entire
        // ingredient list is itemReq, so omitting it made them unfindable by
        // the ingredient a player is actually holding.
        const reqMatch = parseItemReq(r.itemReq).some(req => req.name.toLowerCase().includes(q));
        if (!nameMatch && !matMatch && !cityMatch && !prereqMatch && !reqMatch) return false;
      }
      return true;
    });
  }, [deferredSearch, typeFilter, minStars, canCraftOnly, selectedCity, cityPrestigeLevel, combined, sil, lux, activePartyNames, selectedGuard, exclusive, ftIstraBuildings]);

  const grouped = useMemo(() => {
    // Same discount rule as RecipeCard, so "missing" matches the card's
    // have/need rows. Sorts are stable (ES2019), so ties keep book order.
    const missing = r => shortageCount(
      r, combined, selectedCity !== null && cityPrestigeLevel >= 2 && !r.isFtIstra,
    );
    const order = sortBy === 'tier'    ? (a, b) => a.stars - b.stars
                : sortBy === 'missing' ? (a, b) => missing(a) - missing(b)
                : null;
    return TYPE_ORDER
      .map(type => {
        const recipes = filtered.filter(r => r.type === type);
        return { type, recipes: order ? [...recipes].sort(order) : recipes };
      })
      .filter(g => g.recipes.length > 0);
  }, [filtered, sortBy, combined, selectedCity, cityPrestigeLevel]);

  return (
    <>
      {/* ── Search ── */}
      <div className="craft-search-wrap">
        <svg className="craft-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          className="craft-search"
          type="search"
          placeholder="Search recipes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search recipes"
        />
      </div>

      {/* ── Filters ── */}
      <div className="craft-filters">
        <div className="craft-filter-row">
          <div className="step-selector craft-guard-selector" role="group" aria-label="Crafting for">
            <button
              className={`step-btn${selectedGuard === null ? ' active' : ''}`}
              aria-pressed={selectedGuard === null}
              onClick={() => setForGuard(null)}
            >Both</button>
            {/* Deduped: the party picker keeps the slots distinct, but nothing
                downstream enforces it (healPartySection accepts any two names). */}
            {[...new Set(activePartyNames)].map(name => (
              <button
                key={name}
                className={`step-btn${selectedGuard === name ? ' active' : ''}`}
                aria-pressed={selectedGuard === name}
                onClick={() => setForGuard(name)}
              >{name}</button>
            ))}
          </div>
          {/* "Exclusive to whom?" has no answer under Both. */}
          {selectedGuard !== null && (
            <button
              className={`craft-toggle${exclusive ? ' craft-toggle--on' : ''}`}
              aria-pressed={exclusive}
              onClick={() => setExclusiveOnly(v => !v)}
            >Exclusive</button>
          )}
        </div>

        <div className="craft-filter-row">
          <div className="craft-type-wrap">
            <select
              className="craft-type-select"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
            >
              <option value="All">All types</option>
              <option value="Weapon">Weapon</option>
              <option value="Armor">Armor</option>
              <option value="Accessory">Accessory</option>
              <option value="Item">Item</option>
            </select>
            <svg className="craft-select-chevron" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className="craft-type-wrap">
            <select
              className="craft-type-select"
              value={selectedCity ?? ''}
              onChange={e => setSelectedCity(e.target.value || null)}
              aria-label="Filter by city"
            >
              <option value="">All cities</option>
              {CITY_NAMES.map(c => (
                <option key={c} value={c}>
                  {c}{prestigeMap[c] >= 2 ? ' ✦' : ''}
                </option>
              ))}
            </select>
            <svg className="craft-select-chevron" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className="craft-type-wrap">
            <select
              className="craft-type-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Sort recipes"
            >
              <option value="book">Book order</option>
              <option value="tier">Tier</option>
              <option value="missing">Fewest missing</option>
            </select>
            <svg className="craft-select-chevron" width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        <div className="craft-filter-row">
          <div className="craft-star-pills" role="group" aria-label="Minimum star tier">
            {STAR_LABELS.map((label, i) => {
              const isSelected = minStars === i;
              const isDimmed = minStars > 0 && i > 0 && i < minStars;
              const isFtTier = i === 5;
              return (
                <button
                  key={i}
                  className={[
                    'craft-star-pill',
                    isSelected ? (isFtTier ? 'craft-star-pill--ft-active' : 'craft-star-pill--active') : '',
                    isFtTier && !isSelected ? 'craft-star-pill--ft' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ opacity: isDimmed ? 0.3 : 1 }}
                  onClick={() => setMinStars(minStars === i ? 0 : i)}
                  aria-pressed={isSelected}
                  aria-label={i === 0 ? 'All tiers' : `${i} star minimum`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="craft-filter-row2">
          <div className="craft-legend">
            <span className="craft-legend-stars">★–★★★★</span> standard
            <span className="craft-legend-sep"> · </span>
            <span className="craft-legend-stars craft-legend-stars--ft">★★★★★</span> Ft. Istra
          </div>
          <button
            className={`craft-toggle${canCraftOnly ? ' craft-toggle--on' : ''}`}
            onClick={() => setCanCraftOnly(v => !v)}
            aria-pressed={canCraftOnly}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v3M7 10v3M1 7h3M10 7h3M3.22 3.22l2.12 2.12M8.66 8.66l2.12 2.12M3.22 10.78l2.12-2.12M8.66 5.34l2.12-2.12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Can craft
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <div className="craft-empty">
          <div className="craft-empty-title">No recipes match</div>
          <div className="craft-empty-sub">Try adjusting filters or searching a material name</div>
        </div>
      ) : (
        grouped.map(({ type, recipes }) => (
          <div key={type}>
            <div className="sec-label craft-section-label">{type}</div>
            {/* RecipeCard is memo()'d — the only call site. Every prop below
                must stay referentially stable across a keystroke, or the memo
                becomes pure overhead and the list re-renders wholesale again.
                An inline lambda (`onShowSource={i => …}`) or an object literal
                is the way that breaks, silently and with green tests. All fifteen
                are currently primitives, useMemo'd values, a setState function,
                or a useCallback with no deps — keep them that way. */}
            {recipes.map(r => (
              <RecipeCard
                key={`${r.name}-${r.city}`}
                recipe={r}
                combined={combined}
                sil={sil}
                lux={lux}
                onShowSource={onShowSource}
                selectedCity={selectedCity}
                cityPrestigeLevel={cityPrestigeLevel}
                forGuard={selectedGuard}
                equippedWeapon={equippedWeapon}
                equippedArmor={equippedArmor}
                prereqEquippedBy={prereqEquippedBy(r)}
                prereqGuardNames={prereqGuardNames}
                lockedBy={ftIstraLock(r, ftIstraBuildings)}
                upgradesInto={upgradesFor[r.name]}
                onOpenRecipe={openRecipe}
              />
            ))}
          </div>
        ))
      )}
    </>
  );
}
