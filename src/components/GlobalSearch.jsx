import { useState, useMemo } from 'react';
import { searchAll } from '../data/search';
import { MATERIAL_SOURCES } from '../data/materials';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { MaterialSourceSections } from './MaterialSourceSections';

const TYPE_GLYPH = { Weapon: '⚔', Armor: '🛡', Accessory: '◈', Item: '⬡' };

// One-stop search across recipes, materials, enemies, encounters, and cities.
// Materials and enemies reveal their detail inline (no context loss); recipes,
// encounters, and cities deep-link into the owning tab via the callbacks.
export function GlobalSearch({ open, onClose, stash, cities, onOpenRecipe, onOpenEncounter, onOpenCity }) {
  const [query, setQuery] = useState('');
  const [expandedMaterial, setExpandedMaterial] = useState(null);
  // Which enemy drop chip is expanded — keyed by both enemy and drop so the
  // same material dropped by two enemies only expands under the tapped one.
  const [expandedDrop, setExpandedDrop] = useState(null); // { enemy, drop } | null
  const dialogRef = useDialogA11y(open, onClose);

  const results = useMemo(
    () => (open ? searchAll(query, { stash, cities }) : null),
    [open, query, stash, cities]
  );

  if (!open) return null;

  const hasQuery = query.trim().length >= 2;

  return (
    <div className="gs-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="gs-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search everything"
      >
        <div className="gs-search-row">
          <svg className="gs-search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="gs-input"
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setExpandedMaterial(null); setExpandedDrop(null); }}
            placeholder="Search recipes, materials, enemies…"
            aria-label="Search everything"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <button className="gs-close" onClick={onClose} aria-label="Close search">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        <div className="gs-results">
          {!hasQuery && (
            <div className="gs-hint">
              <div className="gs-hint-title">Search everything</div>
              <div className="gs-hint-sub">
                Recipes, materials &amp; where to get them, enemy drops, encounters, and cities.
              </div>
            </div>
          )}

          {hasQuery && results && results.total === 0 && (
            <div className="gs-hint">
              <div className="gs-hint-title">No matches</div>
              <div className="gs-hint-sub">Try a different name or material.</div>
            </div>
          )}

          {hasQuery && results && results.recipes.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label">Recipes</div>
              {results.recipes.map(r => (
                <button key={`${r.name}-${r.city}`} className="gs-result" onClick={() => onOpenRecipe(r)}>
                  <span className="gs-result-glyph" aria-hidden="true">{TYPE_GLYPH[r.type] ?? '⬡'}</span>
                  <span className="gs-result-main">
                    <span className="gs-result-title">{r.name}</span>
                    <span className="gs-result-meta">{r.city}</span>
                  </span>
                  <span className={`gs-stars${r.isFtIstra ? ' gs-stars--ft' : ''}`}>{'★'.repeat(r.stars)}</span>
                </button>
              ))}
            </div>
          )}

          {hasQuery && results && results.materials.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label">Materials &amp; items</div>
              {results.materials.map(({ name, count }) => {
                const sources = MATERIAL_SOURCES[name];
                const isOpen = expandedMaterial === name;
                return (
                  <div key={name}>
                    <button
                      className="gs-result"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedMaterial(isOpen ? null : name)}
                    >
                      <span className="gs-result-glyph" aria-hidden="true">⛏</span>
                      <span className="gs-result-main">
                        <span className="gs-result-title">{name}</span>
                        <span className="gs-result-meta">
                          {sources ? 'tap for sources' : 'no source data'}
                        </span>
                      </span>
                      {count > 0 && <span className="gs-count">×{count} in stash</span>}
                    </button>
                    {isOpen && (
                      <div className="gs-material-detail">
                        <MaterialSourceSections sources={sources} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasQuery && results && results.enemies.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label">Enemies</div>
              {results.enemies.map(({ name, drops }) => (
                <div key={name}>
                  <div className="gs-result gs-result--static">
                    <span className="gs-result-glyph" aria-hidden="true">☠</span>
                    <span className="gs-result-main">
                      <span className="gs-result-title">{name}</span>
                      {drops.length > 0 ? (
                        <span className="gs-drops">
                          {drops.map(d => {
                            const isOpen = expandedDrop?.enemy === name && expandedDrop?.drop === d;
                            return (
                              <button
                                key={d}
                                type="button"
                                className={`gs-drop-chip${isOpen ? ' gs-drop-chip--active' : ''}`}
                                aria-expanded={isOpen}
                                onClick={() => setExpandedDrop(isOpen ? null : { enemy: name, drop: d })}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </span>
                      ) : (
                        <span className="gs-result-meta">no recorded drops</span>
                      )}
                    </span>
                  </div>
                  {expandedDrop?.enemy === name && (
                    <div className="gs-material-detail">
                      <MaterialSourceSections sources={MATERIAL_SOURCES[expandedDrop.drop]} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasQuery && results && results.encounters.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label">Encounters</div>
              {results.encounters.map(({ encounter, kind }) => (
                <button
                  key={encounter.id}
                  className="gs-result"
                  onClick={() => onOpenEncounter(encounter, kind)}
                >
                  <span className="gs-result-glyph" aria-hidden="true">◆</span>
                  <span className="gs-result-main">
                    <span className="gs-result-title">{encounter.name}</span>
                    <span className="gs-result-meta">
                      {kind === 'spirit' ? 'Spirit Boss' : 'Training Yard'} · {encounter.campaignReq}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {hasQuery && results && results.cities.length > 0 && (
            <div className="gs-group">
              <div className="gs-group-label">Cities</div>
              {results.cities.map(({ city }) => (
                <button key={city.id} className="gs-result" onClick={() => onOpenCity(city)}>
                  <span className="gs-result-glyph" aria-hidden="true">⛨</span>
                  <span className="gs-result-main">
                    <span className="gs-result-title">{city.name}</span>
                    <span className="gs-result-meta">Open Cities</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
