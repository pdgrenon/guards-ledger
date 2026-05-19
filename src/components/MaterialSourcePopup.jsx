import { useEffect } from 'react';
import { MATERIAL_SOURCES } from '../data/materials';

function SkullIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2V19a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-1.8A7 7 0 0 1 5 11a7 7 0 0 1 7-7z"/>
      <line x1="9" y1="20" x2="9" y2="22"/>
      <line x1="15" y1="20" x2="15" y2="22"/>
      <line x1="10" y1="13" x2="10" y2="13.01"/>
      <line x1="14" y1="13" x2="14" y2="13.01"/>
    </svg>
  );
}

function ShovelIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21l9-9"/>
      <path d="M12.5 8.5l4-4a2.5 2.5 0 0 1 3.5 3.5l-4 4"/>
      <path d="M6.5 17.5l-2 2a1 1 0 0 0 1.4 1.4l2-2"/>
      <path d="M9 15l1.5-1.5"/>
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1-6h16l1 6"/>
      <path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z"/>
      <path d="M9 9v12"/>
      <path d="M15 9v12"/>
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8"/>
      <path d="M12 8v1m0 6v1m-2-4.5c0-.83.67-1.5 1.5-1.5h1a1.5 1.5 0 0 1 0 3h-1a1.5 1.5 0 0 0 0 3h1c.83 0 1.5-.67 1.5-1.5"/>
    </svg>
  );
}

export function MaterialSourcePopup({ item, onClose }) {
  const sources = item ? MATERIAL_SOURCES[item] : null;

  useEffect(() => {
    if (!item) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const hasFtIstraOnly = sources?.ftIstra && !sources?.nodes;

  return (
    <div className="source-popup-backdrop" onClick={onClose}>
      <div
        className="source-popup"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Sources for ${item}`}
      >
        <div className="source-popup-handle" />

        <div className="source-popup-header">
          <span className="source-popup-title">{item}</span>
          <button className="source-popup-close" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>

        <div className="source-popup-body">
          {!sources ? (
            <p className="source-popup-empty">No source data available.</p>
          ) : (
            <>
              {sources.enemies?.length > 0 && (
                <div className="source-section">
                  <div className="source-section-label">
                    <SkullIcon /> Enemy drops
                  </div>
                  <div className="source-chips">
                    {sources.enemies.map(e => (
                      <span key={e} className="source-chip">{e}</span>
                    ))}
                  </div>
                </div>
              )}

              {sources.nodes?.length > 0 && (
                <div className="source-section">
                  <div className="source-section-label">
                    <ShovelIcon /> Resource nodes
                  </div>
                  <div className="source-chips">
                    {sources.nodes.map(n => (
                      <span key={n} className="source-chip">{n}</span>
                    ))}
                    {sources.ftIstra && (
                      <span className="source-chip">
                        Ft. Istra {sources.ftIstra.label} · {sources.ftIstra.luxPer4} Lux for ×4
                      </span>
                    )}
                  </div>
                </div>
              )}

              {sources.market?.length > 0 && (
                <div className="source-section">
                  <div className="source-section-label">
                    <StoreIcon /> Buy at market
                  </div>
                  <div className="source-chips">
                    {sources.market.map(({ city, price }) => (
                      <span key={city} className="source-chip">{city} · {price} Sil</span>
                    ))}
                  </div>
                </div>
              )}

              {hasFtIstraOnly && (
                <div className="source-section">
                  <div className="source-section-label">
                    <StoreIcon /> Ft. Istra
                  </div>
                  <div className="source-chips">
                    <span className="source-chip">
                      {sources.ftIstra.label} · {sources.ftIstra.luxPer4} Lux for ×4
                    </span>
                  </div>
                </div>
              )}

              {(sources.sell?.length > 0 || sources.ftIstraSell != null) && (
                <div className="source-section">
                  <div className="source-section-label">
                    <CoinIcon /> Sell at market
                  </div>
                  <div className="source-chips">
                    {sources.sell?.map(({ city, price }) => (
                      <span key={city} className="source-chip source-chip--sell">{city} · {price} Sil</span>
                    ))}
                    {sources.ftIstraSell != null && (
                      <span className="source-chip source-chip--sell">
                        Ft. Istra Apothecary · {sources.ftIstraSell} Lux Essence
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
