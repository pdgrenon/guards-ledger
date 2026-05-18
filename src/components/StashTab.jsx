import { useState } from 'react';
import { MATERIAL_CATEGORIES, ALL_ITEMS_WITH_CATEGORY, ALL_KNOWN_ITEMS, RESOURCE_NODE_ITEMS, ENEMY_DROPS } from '../data/materials';
import { CITIES } from '../data/constants';

const CITY_NAMES = CITIES.map(c => c.name);
const CUSTOM_CATEGORY_LABEL = 'Custom items';

export function StashTab({
  sil, lux, setSil, setLux,
  stash, adjustStash,
  stonebound, setStoneboundMax,
  addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
}) {
  const [search, setSearch] = useState('');
  const [silStep, setSilStep] = useState(1);
  const [luxStep, setLuxStep] = useState(1);
  const [addSearch, setAddSearch] = useState('');

  const locations = stonebound.locations ?? [];
  const cubesUsed = locations.reduce((sum, loc) => sum + (loc.count || 1), 0);
  const cubesAvailable = stonebound.max - cubesUsed;
  const overBudget = cubesAvailable < 0;

  const activeItems = ALL_ITEMS_WITH_CATEGORY.filter(({ item }) => (stash[item] ?? 0) > 0);

  // Predefined items matching the search query that aren't yet in the stash
  const predefinedAddResults = addSearch.length > 0
    ? ALL_ITEMS_WITH_CATEGORY.filter(({ item }) =>
        item.toLowerCase().includes(addSearch.toLowerCase()) &&
        (stash[item] ?? 0) === 0
      ).slice(0, 12)
    : [];

  // Show "Add as custom item" when the query doesn't exactly match any known item
  const trimmedSearch = addSearch.trim();
  const isKnownItem = ALL_KNOWN_ITEMS.has(trimmedSearch);
  const showCustomOption =
    trimmedSearch.length > 0 &&
    !isKnownItem &&
    !(stash[trimmedSearch] ?? 0); // don't offer to add if already in stash as custom

  function handleAddItem(item) {
    adjustStash(item, 1);
    setAddSearch('');
  }

  // Build category groups for items currently in the stash
  const activeByCategory = MATERIAL_CATEGORIES
    .map(cat => ({
      label: cat.label,
      items: cat.items.filter(item => (stash[item] ?? 0) > 0),
    }))
    .filter(cat => cat.items.length > 0);

  // Collect any stash keys not belonging to any predefined category (custom items)
  const customItems = Object.keys(stash).filter(
    key => !ALL_KNOWN_ITEMS.has(key) && (stash[key] ?? 0) > 0
  );
  if (customItems.length > 0) {
    activeByCategory.push({ label: CUSTOM_CATEGORY_LABEL, items: customItems.sort() });
  }

  const allActiveItems = activeByCategory.flatMap(c => c.items);

  const filteredCategories = search.length > 0
    ? activeByCategory
        .map(cat => ({
          ...cat,
          items: cat.items.filter(item => item.toLowerCase().includes(search.toLowerCase())),
        }))
        .filter(cat => cat.items.length > 0)
    : activeByCategory;

  return (
    <>
      {/* ── Party resources ── */}
      <div className="card mb-3 stash-card">
        <div className="card-title mb-3">Party resources</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Sil */}
          <div>
            <div className="sec-label">Sil</div>
            <div className="resource-value">{sil}</div>
            <div className="step-selector">
              {[1, 5, 10].map(s => (
                <button key={s} className={`step-btn${silStep === s ? ' active' : ''}`} onClick={() => setSilStep(s)}>{s}</button>
              ))}
            </div>
            <div className="counter-actions">
              <button className="counter-btn" onClick={() => setSil(-silStep)}>−</button>
              <button className="counter-btn" onClick={() => setSil(silStep)}>+</button>
            </div>
          </div>

          {/* Lux Essence */}
          <div>
            <div className="sec-label">Lux Essence</div>
            <div className="resource-value">{lux}</div>
            <div className="step-selector">
              {[1, 5, 10].map(s => (
                <button key={s} className={`step-btn${luxStep === s ? ' active' : ''}`} onClick={() => setLuxStep(s)}>{s}</button>
              ))}
            </div>
            <div className="counter-actions">
              <button className="counter-btn" onClick={() => setLux(-luxStep)}>−</button>
              <button className="counter-btn" onClick={() => setLux(luxStep)}>+</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stonebound ── */}
      <div className="card mb-3 stash-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Stonebound</div>
          <div className={`sb-budget${overBudget ? ' sb-over-budget' : ''}`} style={{ marginLeft: 'auto', fontSize: 12, color: overBudget ? 'var(--c-red)' : 'var(--c-text3)' }}>
            {cubesUsed} / {stonebound.max} cubes
          </div>
          <button className="adj-btn sb-max-btn" onClick={() => setStoneboundMax(-1)}>−</button>
          <button className="adj-btn sb-max-btn" onClick={() => setStoneboundMax(1)}>+</button>
        </div>

        <div className="sb-locations">
          {locations.map((loc, i) => {
            const maxCount = cubesAvailable + loc.count;
            return (
              <div key={loc.id} className="sb-location">
                <div className="sb-loc-row">
                  <button className="sb-remove-btn" onClick={() => removeStoneboundLocation(loc.id)}>✕</button>
                  <select
                    className="sb-select"
                    value={loc.selection}
                    onChange={e => updateStoneboundLocation(i, 'selection', e.target.value)}
                  >
                    <option value="">— select location —</option>
                    <optgroup label="Cities">
                      {CITY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Resource nodes">
                      {RESOURCE_NODE_ITEMS.map(r => <option key={r} value={r}>{r}</option>)}
                    </optgroup>
                    <optgroup label="Enemy drops">
                      {ENEMY_DROPS.map(e => <option key={e} value={e}>{e}</option>)}
                    </optgroup>
                  </select>

                  <div className="sb-inline-controls">
                    <button
                      className="adj-btn sb-count-btn"
                      onClick={() => updateStoneboundLocation(i, 'count', Math.max(1, loc.count - 1))}
                    >−</button>
                    <span className="sb-count-val">{loc.count}</span>
                    <button
                      className="adj-btn sb-count-btn"
                      disabled={loc.count >= maxCount}
                      onClick={() => updateStoneboundLocation(i, 'count', Math.min(maxCount, loc.count + 1))}
                    >+</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button className="sb-add-btn" onClick={addStoneboundLocation} disabled={cubesAvailable <= 0}>
          + Add location
        </button>
      </div>

      {/* ── Fort Istra Stash ── */}
      <div className="card stash-card">
        <div className="card-title mb-2">Fort Istra stash</div>

        {allActiveItems.length > 0 && (
          <input
            className="stash-search"
            type="text"
            placeholder="Filter stash…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {allActiveItems.length === 0 && (
          <div className="stash-empty">
            <div className="stash-empty-title">Stash is empty</div>
            <div className="stash-empty-sub">Search below to add items</div>
          </div>
        )}

        {filteredCategories.map(cat => (
          <div key={cat.label}>
            <div className="stash-category-header">
              <span className="stash-category-label">{cat.label}</span>
              <span className="stash-category-count">{cat.items.length} item{cat.items.length !== 1 ? 's' : ''}</span>
            </div>
            {cat.items.map(item => (
              <div key={item} className="stash-row">
                <span className="stash-row-name">{item}</span>
                <div className="stash-row-controls">
                  <button className="stash-row-btn" onClick={() => adjustStash(item, -1)}>−</button>
                  <span className="stash-row-val">{stash[item] ?? 0}</span>
                  <button className="stash-row-btn" onClick={() => adjustStash(item, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Add item panel */}
        <div className="stash-add-panel">
          <div className="stash-add-panel-label">Add item</div>
          <input
            className="stash-search"
            type="text"
            placeholder="Search items…"
            value={addSearch}
            onChange={e => setAddSearch(e.target.value)}
          />
          {(predefinedAddResults.length > 0 || showCustomOption) && (
            <div className="stash-add-results">
              {predefinedAddResults.map(({ item, category }) => (
                <button
                  key={item}
                  className="stash-add-result"
                  onClick={() => handleAddItem(item)}
                >
                  <span>{item}</span>
                  <span className="stash-add-cat">{category}</span>
                </button>
              ))}
              {showCustomOption && (
                <button
                  className="stash-add-result stash-add-result--custom"
                  onClick={() => handleAddItem(trimmedSearch)}
                >
                  <span>Add "{trimmedSearch}"</span>
                  <span className="stash-add-cat">Custom item</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
