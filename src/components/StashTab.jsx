import { useState } from 'react';
import { MATERIAL_CATEGORIES, ALL_MATERIALS, RESOURCE_NODE_ITEMS, ENEMIES } from '../data/materials';
import { CITIES } from '../data/constants';

const CITY_NAMES = CITIES.map(c => c.name);

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
  const [addSearch, setAddSearch] = useState('');

  const locations = stonebound.locations ?? [];
  const cubesUsed = locations.reduce((sum, loc) => sum + (loc.count || 1), 0);
  const cubesAvailable = stonebound.max - cubesUsed;
  const overBudget = cubesAvailable < 0;

  const activeItems = ALL_ITEMS.filter(({ item }) => (stash[item] ?? 0) > 0);

  const addResults = addSearch.length > 0
    ? ALL_ITEMS.filter(({ item }) =>
        item.toLowerCase().includes(addSearch.toLowerCase()) &&
        (stash[item] ?? 0) === 0
      ).slice(0, 12)
    : [];

  function handleAddItem(item) {
    adjustStash(item, 1);
    setAddSearch('');
  }

  const activeByCategory = MATERIAL_CATEGORIES
    .map(cat => ({
      label: cat.label,
      items: cat.items.filter(item => (stash[item] ?? 0) > 0),
    }))
    .filter(cat => cat.items.length > 0);

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
            <div style={{ fontSize: 34, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1, marginBottom: 10, fontFamily: 'var(--font-display)' }}>
              {sil}
            </div>
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
            <div style={{ fontSize: 34, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1, marginBottom: 10, fontFamily: 'var(--font-display)' }}>
              {lux}
            </div>
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
        <div className="flex items-center justify-between mb-2">
          <div className="card-title">Stonebound</div>
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
            const maxCount = Math.min(4, loc.count + cubesAvailable);
            // Derive type from selection for state compatibility
            const handleSelect = (value) => {
              if (!value) {
                updateStoneboundLocation(i, 'type', '');
                updateStoneboundLocation(i, 'selection', '');
                return;
              }
              const type = CITY_NAMES.includes(value) ? 'City'
                : RESOURCE_NODE_ITEMS.includes(value) ? 'Resource node'
                : 'Enemy node';
              updateStoneboundLocation(i, 'type', type);
              updateStoneboundLocation(i, 'selection', value);
            };

            return (
              <div key={i} className="sb-location">
                {/* Trash on the far left — spatial separation from cube +/− on the right */}
                <div className="sb-loc-row">
                  <button
                    className="sb-remove-btn"
                    onClick={() => removeStoneboundLocation(i)}
                    aria-label="Remove location"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>

                  <select
                    className="sb-select"
                    value={loc.selection || ''}
                    onChange={e => handleSelect(e.target.value)}
                  >
                    <option value="">— select location —</option>
                    <optgroup label="Cities">
                      {CITY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                    <optgroup label="Resource nodes">
                      {RESOURCE_NODE_ITEMS.map(r => <option key={r} value={r}>{r}</option>)}
                    </optgroup>
                    <optgroup label="Enemy nodes">
                      {ENEMIES.map(e => <option key={e} value={e}>{e}</option>)}
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

        {/* Filter — always visible when there are items */}
        {activeItems.length > 0 && (
          <input
            className="stash-search"
            type="text"
            placeholder="Filter stash…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {/* Empty state */}
        {activeItems.length === 0 && (
          <div className="text-hint text-sm" style={{ padding: '8px 0' }}>
            No items in stash yet.
          </div>
        )}

        {/* Category bands + item rows */}
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

        {/* Add item — always at the bottom, clearly a separate action from filtering */}
        <div className="stash-add-panel">
          <div className="stash-add-panel-label">Add item</div>
          <input
            className="stash-search"
            style={{ marginBottom: 0 }}
            type="text"
            placeholder="Search materials to add…"
            value={addSearch}
            onChange={e => setAddSearch(e.target.value)}
          />
          {addResults.length > 0 && (
            <div className="stash-add-results" style={{ marginTop: 6 }}>
              {addResults.map(({ item, category }) => (
                <button key={item} className="stash-add-result" onClick={() => handleAddItem(item)}>
                  <span>{item}</span>
                  <span className="stash-add-cat">{category}</span>
                </button>
              ))}
            </div>
          )}
          {addSearch.length > 0 && addResults.length === 0 && (
            <div className="text-hint text-sm" style={{ paddingTop: 8 }}>No items found.</div>
          )}
        </div>
      </div>
    </>
  );
}
