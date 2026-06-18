// src/components/CraftTab.jsx
import { useState, useMemo } from 'react';
import { RECIPES, craftStatus, craftCostForCity, availableInCity, buildCombined } from '../data/recipes';
import { MATERIAL_SOURCES } from '../data/materials';
import { CITIES } from '../data/constants';
import { cityPrestige } from '../hooks/gameReducers';

const CITY_NAMES = CITIES.map(c => c.name);
const TYPE_ORDER = ['Weapon', 'Armor', 'Accessory', 'Item'];
const STAR_LABELS = ['All', '★', '★★', '★★★', '★★★★', '★★★★★'];

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
  return <span className="craft-status-badge craft-status-missing">Missing</span>;
}

function RecipeCard({ recipe, combined, sil, lux, activePartyNames, onShowSource, selectedCity, cityPrestigeLevel }) {
  // Party-restricted recipes with no matching active guard are already filtered
  // out before this renders, so no early-return guard is needed here.
  const useDiscount = selectedCity !== null && cityPrestigeLevel >= 2 && !recipe.isFtIstra;
  const status = craftStatus(recipe, combined, sil, lux, selectedCity, cityPrestigeLevel);
  const cost = formatCost(recipe, selectedCity);
  const cityLine = formatCityBreakdown(recipe, selectedCity);

  const activeGuardMatch = recipe.limitedTo.length > 0
    ? recipe.limitedTo.filter(g => activePartyNames.includes(g))
    : [];

  const borderClass =
    status === 'ready' ? 'craft-card--ready' :
    status === 'partial' ? 'craft-card--partial' :
    'craft-card--missing';

  return (
    <div className={`card craft-card ${borderClass}`}>
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
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Guard restriction note */}
      {activeGuardMatch.length > 0 && (
        <div className="craft-restriction">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1L6 6M6 8.5V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          {activeGuardMatch.join(', ')} only
        </div>
      )}

      {/* Prereq */}
      {recipe.prereq && (
        <div className="craft-prereq">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Requires <strong>{recipe.prereq}</strong> equipped
        </div>
      )}

      {/* Special item requirement (apothecary) */}
      {recipe.itemReq && (
        <div className="craft-prereq">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Needs {recipe.itemReq}
        </div>
      )}

      {/* Effect (accessories/items) */}
      {recipe.effect && (
        <div className="craft-effect">{recipe.effect}</div>
      )}

      {/* Materials */}
      {recipe.materials.length > 0 && (
        <div className="craft-materials">
          {recipe.materials.map((mat, i) => {
            const effectiveQty = (useDiscount && mat.qty2R !== null) ? mat.qty2R : mat.qty;
            const have = combined[mat.name] ?? 0;
            const ok = have >= effectiveQty;
            const hasSource = !!MATERIAL_SOURCES[mat.name];
            const showDiscount = useDiscount && mat.qty2R !== null && mat.qty2R < mat.qty;
            return (
              <div key={i} className="craft-mat-row">
                {hasSource ? (
                  <button
                    className="craft-mat-name mat-source-trigger"
                    onClick={() => onShowSource(mat.name)}
                    aria-label={`View sources for ${mat.name}`}
                  >
                    {mat.name}
                    {mat.isSpeakingStone && (
                      <span className="craft-stone-tag"> · speaking stone</span>
                    )}
                  </button>
                ) : (
                  <span className="craft-mat-name">
                    {mat.name}
                    {mat.isSpeakingStone && (
                      <span className="craft-stone-tag"> · speaking stone</span>
                    )}
                  </span>
                )}
                <span className={`craft-mat-qty ${ok ? 'craft-mat-qty--have' : 'craft-mat-qty--short'}`}>
                  {have} / {showDiscount
                    ? <><s className="craft-mat-qty-original">{mat.qty}</s> {mat.qty2R}</>
                    : effectiveQty
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
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CraftTab({ stash, sil, lux, activeParty, guards, cities, onShowSource }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [minStars, setMinStars] = useState(0);
  const [canCraftOnly, setCanCraftOnly] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);

  const activePartyNames = useMemo(() => activeParty ?? [], [activeParty]);

  const activeGuards = useMemo(
    () => (guards ?? []).filter(g => activePartyNames.includes(g.name)),
    [guards, activePartyNames]
  );
  const combined = useMemo(
    () => buildCombined(stash, activeGuards),
    [stash, activeGuards]
  );

  // Build prestige map from cities prop
  const prestigeMap = useMemo(() => {
    const map = {};
    for (const city of (cities ?? [])) {
      map[city.name] = cityPrestige(city);
    }
    return map;
  }, [cities]);

  const cityPrestigeLevel = selectedCity ? (prestigeMap[selectedCity] ?? 0) : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return RECIPES.filter(r => {
      if (typeFilter !== 'All' && r.type !== typeFilter) return false;
      if (minStars > 0 && r.stars < minStars) return false;
      // City filter: hide recipes not available in selected city
      if (selectedCity && !availableInCity(r, selectedCity)) return false;
      if (canCraftOnly && craftStatus(r, combined, sil, lux, selectedCity, cityPrestigeLevel) !== 'ready') return false;
      if (r.limitedTo.length > 0 && !r.limitedTo.some(g => activePartyNames.includes(g))) return false;
      if (q) {
        const nameMatch = r.name.toLowerCase().includes(q);
        const matMatch = r.materials.some(m => m.name.toLowerCase().includes(q));
        const cityMatch = r.city.toLowerCase().includes(q);
        const prereqMatch = r.prereq?.toLowerCase().includes(q) ?? false;
        if (!nameMatch && !matMatch && !cityMatch && !prereqMatch) return false;
      }
      return true;
    });
  }, [search, typeFilter, minStars, canCraftOnly, selectedCity, cityPrestigeLevel, combined, sil, lux, activePartyNames]);

  const grouped = useMemo(() => TYPE_ORDER
    .map(type => ({ type, recipes: filtered.filter(r => r.type === type) }))
    .filter(g => g.recipes.length > 0), [filtered]);

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
            {recipes.map(r => (
              <RecipeCard
                key={`${r.name}-${r.city}`}
                recipe={r}
                combined={combined}
                sil={sil}
                lux={lux}
                activePartyNames={activePartyNames}
                onShowSource={onShowSource}
                selectedCity={selectedCity}
                cityPrestigeLevel={cityPrestigeLevel}
              />
            ))}
          </div>
        ))
      )}
    </>
  );
}
