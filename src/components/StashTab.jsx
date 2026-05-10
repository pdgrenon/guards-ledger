import { useState } from 'react';
import { MATERIAL_CATEGORIES, ALL_MATERIALS, RESOURCE_NODE_ITEMS, ENEMIES } from '../data/materials';
import { CITIES } from '../data/constants';

const LOCATION_TYPES = ['City', 'Resource node', 'Enemy node'];
const CITY_NAMES = CITIES.map(c => c.name);

function getSelectionOptions(type) {
  if (type === 'City') return CITY_NAMES;
  if (type === 'Resource node') return RESOURCE_NODE_ITEMS;
  if (type === 'Enemy node') return ENEMIES;
  return [];
}

// Flat sorted list of all items with their category label for grouping
const ALL_ITEMS = MATERIAL_CATEGORIES.flatMap(cat =>
  cat.items.map(item => ({ item, category: cat.label }))
);

export function StashTab({
  sil, lux, setSil, setLux,
  stash, adjustStash,
  stonebound, setStoneboundMax,
  addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
}) {
  const [search, setSearch] = useState('');
  const [silStep, setSilStep] = useState(1);
  const [luxStep, setLuxStep] = useState(1);
  const [addingItem, setAddingItem] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const locations = stonebound.locations ?? [];
  const cubesUsed = locations.reduce((sum, loc) => sum + (loc.count || 1), 0);
  const cubesAvailable = stonebound.max - cubesUsed;
  const overBudget = cubesAvailable < 0;

  // Items currently in the stash (qty > 0), sorted by category then name
  const activeItems = ALL_ITEMS.filter(({ item }) => (stash[item] ?? 0) > 0);

  // Items matching the add-search that aren't already in the stash
  const addResults = addSearch.length > 0
    ? ALL_ITEMS.filter(({ item }) =>
        item.toLowerCase().includes(addSearch.toLowerCase()) &&
        (stash[item] ?? 0) === 0
      ).slice(0, 12)
    : [];

  function handleAddItem(item) {
    adjustStash(item, 1);
    setAddSearch('');
    setAddingItem(false);
  }

  // Group active items by category for display
  const activeByCategory = MATERIAL_CATEGORIES
    .map(cat => ({
      label: cat.label,
      items: cat.items.filter(item => (stash[item] ?? 0) > 0),
    }))
    .filter(cat => cat.items.length > 0);

  // Filter by search if searching
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
      {/* Party resources */}
      <div className="card mb-3">
        <div className="font-medium mb-3" style={{ fontSize: 13 }}>Party resources</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div className="sec-label">Sil</div>
            <div style={{ fontSize: 32, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1, marginBottom: 8 }}>{sil}</div>
            <div className="step-selector" style={{ marginBottom: 6 }}>
              {[1, 5, 10].map(s => (
                <button key={s} className={`step-btn${silStep === s ? ' active' : ''}`} onClick={() => setSilStep(s)}>{s}</button>
              ))}
            </div>
            <div className="counter-actions">
              <button className="counter-btn resource-counter-btn" onClick={() => setSil(-silStep)}>−</button>
              <button className="counter-btn resource-counter-btn" onClick={() => setSil(silStep)}>+</button>
            </div>
          </div>
          <div>
            <div className="sec-label">Lux Essence</div>
            <div style={{ fontSize: 32, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1, marginBottom: 8 }}>{lux}</div>
            <div className="step-selector" style={{ marginBottom: 6 }}>
              {[1, 5, 10].map(s => (
                <button key={s} className={`step-btn${luxStep === s ? ' active' : ''}`} onClick={() => setLuxStep(s)}>{s}</button>
              ))}
            </div>
            <div className="counter-actions">
              <button className="counter-btn resource-counter-btn" onClick={() => setLux(-luxStep)}>−</button>
              <button className="counter-btn resource-counter-btn" onClick={() => setLux(luxStep)}>+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Stonebound */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium" style={{ fontSize: 13 }}>Stonebound</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs${overBudget ? ' sb-over-budget' : ' text-muted'}`}>
              {cubesUsed} / {stonebound.max} cubes
            </span>
            <button className="adj-btn sb-max-btn" onClick={() => setStoneboundMax(-1)}>−</button>
            <button className="adj-btn sb-max-btn" onClick={() => setStoneboundMax(1)}>+</button>
          </div>
        </div>

        <div className="sb-locations">
          {locations.map((loc, i) => {
            const options = getSelectionOptions(loc.type);
            const maxCount = Math.min(4, loc.count + cubesAvailable);
            return (
              <div key={i} className="sb-location">
                <div className="sb-loc-top">
                  <select
                    className="sb-select"
                    value={loc.type}
                    onChange={e => updateStoneboundLocation(i, 'type', e.target.value)}
                  >
                    <option value="">— type —</option>
                    {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="sb-remove-btn" onClick={() => removeStoneboundLocation(i)}>×</button>
                </div>
                {loc.type && (
                  <select
                    className="sb-select"
                    value={loc.selection}
                    onChange={e => updateStoneboundLocation(i, 'selection', e.target.value)}
                  >
                    <option value="">— select —</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                <div className="sb-count-row">
                  <span className="sb-count-label">Cubes on node</span>
                  <button
                    className="adj-btn sb-count-btn"
                    onClick={() => updateStoneboundLocation(i, 'count', Math.max(1, loc.count - 1))}
                  >−</button>
                  <span className="adj-val" style={{ fontSize: 13, minWidth: 20 }}>{loc.count}</span>
                  <button
                    className="adj-btn sb-count-btn"
                    disabled={loc.count >= maxCount}
                    onClick={() => updateStoneboundLocation(i, 'count', Math.min(maxCount, loc.count + 1))}
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>

        <button className="sb-add-btn" onClick={addStoneboundLocation} disabled={cubesAvailable <= 0}>
          + Add location
        </button>
      </div>

      {/* Stash */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium" style={{ fontSize: 13 }}>Fort Istra stash</div>
          {!addingItem && (
            <button className="stash-add-btn" onClick={() => setAddingItem(true)}>+ Add item</button>
          )}
        </div>

        {/* Add item search */}
        {addingItem && (
          <div className="stash-add-wrap">
            <div className="flex items-center gap-2 mb-2">
              <input
                className="stash-search"
                style={{ marginBottom: 0, flex: 1 }}
                type="text"
                placeholder="Search to add…"
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                autoFocus
              />
              <button className="stash-cancel-btn" onClick={() => { setAddingItem(false); setAddSearch(''); }}>Cancel</button>
            </div>
            {addResults.length > 0 && (
              <div className="stash-add-results">
                {addResults.map(({ item, category }) => (
                  <button key={item} className="stash-add-result" onClick={() => handleAddItem(item)}>
                    <span>{item}</span>
                    <span className="stash-add-cat">{category}</span>
                  </button>
                ))}
              </div>
            )}
            {addSearch.length > 0 && addResults.length === 0 && (
              <div className="text-hint text-sm" style={{ padding: '8px 0' }}>No items found.</div>
            )}
          </div>
        )}

        {/* Search active stash */}
        {!addingItem && activeItems.length > 0 && (
          <input
            className="stash-search"
            type="text"
            placeholder="Filter stash…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {/* Active stash list */}
        {activeItems.length === 0 && !addingItem && (
          <div className="text-hint text-sm" style={{ padding: '8px 0' }}>
            No items in stash. Tap "+ Add item" to get started.
          </div>
        )}

        {filteredCategories.map(cat => (
          <div key={cat.label} className="mb-2">
            <div className="sec-label">{cat.label}</div>
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
      </div>
    </>
  );
}
