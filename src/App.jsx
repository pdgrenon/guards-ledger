import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import { GUARDS } from './data/constants';
import './index.css';

const TABS = ['Guard', 'Cities', 'Stash & stonebound', 'Session log'];

// ─── Guard identity color map ────────────────────────────────────────────────
// Maps each guard name to their CSS variable key prefix and exact border color.
// Used across: switcher active state, card top border, header name, session log.
const GUARD_COLOR_MAP = {
  Alek:    { key: 'gold',      border: 'var(--c-guard-gold-border)',      bg: 'var(--c-guard-gold-bg)',      text: 'var(--c-guard-gold-text)'      },
  Grigory: { key: 'amber',     border: 'var(--c-guard-amber-border)',     bg: 'var(--c-guard-amber-bg)',     text: 'var(--c-guard-amber-text)'     },
  Dasha:   { key: 'forest',    border: 'var(--c-guard-forest-border)',    bg: 'var(--c-guard-forest-bg)',    text: 'var(--c-guard-forest-text)'    },
  Zoya:    { key: 'vermilion', border: 'var(--c-guard-vermilion-border)', bg: 'var(--c-guard-vermilion-bg)', text: 'var(--c-guard-vermilion-text)' },
  Borya:   { key: 'indigo',    border: 'var(--c-guard-indigo-border)',    bg: 'var(--c-guard-indigo-bg)',    text: 'var(--c-guard-indigo-text)'    },
  Mila:    { key: 'teal',      border: 'var(--c-guard-teal-border)',      bg: 'var(--c-guard-teal-bg)',      text: 'var(--c-guard-teal-text)'      },
  Seva:    { key: 'rose',      border: 'var(--c-guard-rose-border)',      bg: 'var(--c-guard-rose-bg)',      text: 'var(--c-guard-rose-text)'      },
  Kira:    { key: 'cerulean',  border: 'var(--c-guard-cerulean-border)',  bg: 'var(--c-guard-cerulean-bg)',  text: 'var(--c-guard-cerulean-text)'  },
};
const FALLBACK_COLOR = { key: 'gold', border: 'var(--c-guard-gold-border)', bg: 'var(--c-guard-gold-bg)', text: 'var(--c-guard-gold-text)' };

// Build a regex that matches any guard name as a whole word
const ALL_GUARD_NAMES = Object.keys(GUARD_COLOR_MAP);
const GUARD_NAME_REGEX = new RegExp(`\\b(${[...ALL_GUARD_NAMES, 'Party', 'Stash'].join('|')})\\b`, 'g');

// Replaces guard name occurrences in log messages with colored spans
function colorizeLogMessage(message) {
  return message.replace(GUARD_NAME_REGEX, (match) => {
    const color = GUARD_COLOR_MAP[match];
    if (!color) return `<strong>${match}</strong>`;
    return `<span class="log-name-${color.key}">${match}</span>`;
  });
}

// Inline SVG settings icon
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState('Guard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const game = useGameState();
  const { state } = game;

  const activeIdx = state.activeGuardIdx ?? 0;
  const activeGuard = state.guards[activeIdx];
  const activeColor = GUARD_COLOR_MAP[activeGuard?.name] ?? FALLBACK_COLOR;

  const actions = {
    adjustGuardHp:         game.adjustGuardHp,
    adjustGuardMaxHp:      game.adjustGuardMaxHp,
    setGuardEquipment:     game.setGuardEquipment,
    setGuardSatchelItem:   game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,
    adjustChip:            game.adjustChip,
    resetChips:            game.resetChips,
    setStartingBlack:      game.setStartingBlack,
    adjustBaseStat:        game.adjustBaseStat,
    updateGuard:           game.updateGuard,
    exportState:           game.exportState,
    importState:           game.importState,
    resetState:            game.resetState,
  };

  return (
    <div>
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-brand">
          <div className="wordmark-the">The</div>
          <div className="wordmark-title">Guard's Ledger</div>
          <div className="wordmark-rule" aria-hidden="true" />
        </div>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <SettingsIcon />
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Guard tab ── */}
      {tab === 'Guard' && (
        <>
          {/* Switcher — each active button uses its own guard color */}
          <div className="guard-switcher">
            {state.guards.map((g, i) => {
              const c = GUARD_COLOR_MAP[g.name] ?? FALLBACK_COLOR;
              const isActive = activeIdx === i;
              return (
                <button
                  key={i}
                  className={`guard-switch-btn${isActive ? ' active' : ''}`}
                  onClick={() => game.setActiveGuard(i)}
                  style={isActive ? {
                    '--guard-btn-bg':     c.bg,
                    '--guard-btn-border': c.border,
                    '--guard-btn-text':   c.text,
                  } : {}}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7, height: 7,
                      borderRadius: '50%',
                      background: c.border,
                      marginRight: 5,
                      verticalAlign: 'middle',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  {g.name}
                </button>
              );
            })}
          </div>

          {/* Guard card — inject --guard-color so header, name, pips, section labels all match */}
          <div style={{ '--guard-color': activeColor.border }}>
            <GuardPanel guard={activeGuard} guardIdx={activeIdx} actions={actions} />
          </div>
        </>
      )}

      {tab === 'Cities' && (
        <CitiesTab cities={state.cities} toggleCityQuest={game.toggleCityQuest} />
      )}

      {tab === 'Stash & stonebound' && (
        <StashTab
          sil={state.sil} lux={state.lux}
          setSil={game.setSil} setLux={game.setLux}
          stash={state.stash} adjustStash={game.adjustStash}
          stonebound={state.stonebound}
          setStoneboundMax={game.setStoneboundMax}
          addStoneboundLocation={game.addStoneboundLocation}
          removeStoneboundLocation={game.removeStoneboundLocation}
          updateStoneboundLocation={game.updateStoneboundLocation}
        />
      )}

      {tab === 'Session log' && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="sec-label" style={{ marginBottom: 0 }}>Session log</div>
            <span className="text-hint" style={{ fontSize: 11 }}>Last {state.log.length} events</span>
          </div>
          {state.log.length === 0 && (
            <div className="text-hint text-sm" style={{ padding: '8px 0' }}>No events yet.</div>
          )}
          {state.log.map(entry => (
            <div key={entry.id} className="log-entry">
              <span className="log-time">{entry.time}</span>
              <span
                className="log-text"
                dangerouslySetInnerHTML={{ __html: colorizeLogMessage(entry.message) }}
              />
            </div>
          ))}
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          state={state}
          actions={actions}
          guardColorMap={GUARD_COLOR_MAP}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
