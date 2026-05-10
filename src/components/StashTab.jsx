import { useState } from 'react';
import { MATERIAL_CATEGORIES, RESOURCE_NODE_ITEMS, ENEMIES } from '../data/materials';
import { CITIES } from '../data/constants';

const LOCATION_TYPES = ['City', 'Resource node', 'Enemy node'];
const CITY_NAMES = CITIES.map(c => c.name);

function getSelectionOptions(type) {
  if (type === 'City') return CITY_NAMES;
  if (type === 'Resource node') return RESOURCE_NODE_ITEMS;
  if (type === 'Enemy node') return ENEMIES;
  return [];
}

export function StashTab({
  sil, lux, setSil, setLux,
  stash, adjustStash,
  stonebound, setStoneboundMax,
  addStoneboundLocation, removeStoneboundLocation, updateStoneboundLocation,
}) {
  const [search, setSearch] = useState('');
  const [silStep, setSilStep] = useState(1);
  const [luxStep, setLuxStep] = useState(1);

  const locations = stonebound.locations ?? [];
  const cubesUsed = locations.reduce((sum, loc) => sum + (loc.count || 1), 0);
  const cubesAvailable = stonebound.max - cubesUsed;
  const overBudget = cubesAvailable < 0;

  return (
    <>
      {/* Party resources */}
      <div className="card mb-3">
        <div className="font-medium mb-3" style={{ fontSize: 13 }}>Party resources</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Sil */}
          <div>
            <div className="sec-label">Sil</div>
            <div style={{ fontSize: 32, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1, marginBottom: 8 }}>
              {sil}
            </div>
            <div className="step-selector" style={{ marginBottom: 6 }}>
              {[1, 5, 10].map(s => (
                <button key={s} className={`step-btn${silStep === s ? ' active' : ''}`} onClick={() => setSilStep(s)}>{s}</button>
              ))}
            </div>
            <div className="counter-actions">
              <button className="counter-btn" onClick={() => setSil(-silStep)}>−</button>
              <button className="counter-btn" onClick={() => setSil(silStep)}>+</button>
            </div>
          </div>

          {/* Lux */}
          <div>
            <div className="sec-label">Lux Essence</div>
            <div style={{ fontSize: 32, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1, marginBottom: 8 }}>
              {lux}
            </div>
            <div className="step-selector" style={{ marginBottom: 6 }}>
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

      {/* Stonebound */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium" style={{ fontSize: 13 }}>Stonebound</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs${overBudget ? ' sb-over-budget' : ' text-muted'}`}>
              {cubesUsed} / {stonebound.max} cubes
            </span>
            <button className="adj-btn" style={{ width: 24, height: 24, fontSize: 14 }} onClick={() => setStoneboundMax(-1)}>−</button>
            <button className="adj-btn" style={{ width: 24, height: 24, fontSize: 14 }} onClick={() => setStoneboundMax(1)}>+</button>
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
                    className="adj-btn"
                    style={{ width: 22, height: 22, fontSize: 14 }}
                    onClick={() => updateStoneboundLocation(i, 'count', Math.max(1, loc.count - 1))}
                  >−</button>
                  <span className="adj-val" style={{ fontSize: 13, minWidth: 20 }}>{loc.count}</span>
                  <button
                    className="adj-btn"
                    style={{ width: 22, height: 22, fontSize: 14 }}
                    disabled={loc.count >= maxCount}
                    onClick={() => updateStoneboundLocation(i, 'count', Math.min(maxCount, loc.count + 1))}
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="sb-add-btn"
          onClick={addStoneboundLocation}
          disabled={cubesAvailable <= 0}
        >
          + Add location
        </button>
      </div>

      {/* Stash */}
      <div className="card">
        <div className="font-medium mb-2" style={{ fontSize: 13 }}>Fort Istra stash</div>
        <input
          className="stash-search"
          type="text"
          placeholder="Search materials…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {MATERIAL_CATEGORIES.map(cat => {
          const items = cat.items.filter(item =>
            search.length === 0 || item.toLowerCase().includes(search.toLowerCase())
          );
          if (items.length === 0) return null;
          return (
            <div key={cat.id} className="mb-3">
              <div className="sec-label">{cat.label}</div>
              <div className="stash-items">
                {items.map(item => (
                  <div key={item} className="stash-item">
                    <span className="stash-item-name">{item}</span>
                    <div className="stash-qty-row">
                      <button className="stash-qty-btn" onClick={() => adjustStash(item, -1)}>−</button>
                      <span className="stash-qty-val">{stash[item] ?? 0}</span>
                      <button className="stash-qty-btn" onClick={() => adjustStash(item, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
