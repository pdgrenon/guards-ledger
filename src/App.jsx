import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import { GUARDS } from './data/constants';
import './index.css';

const TABS = ['Guard', 'Cities', 'Stash & stonebound', 'Session log'];

// Build highlight regex dynamically from all guard names
const GUARD_NAME_REGEX = new RegExp(`\\b(${GUARDS.concat(['Party', 'Stash']).join('|')})\\b`, 'g');

// Map each guard to their identity colour CSS variable prefix for the switcher dot
const GUARD_COLOR_CLASS = {
  Alek:    'gold',
  Grigory: 'amber',
  Dasha:   'forest',
  Zoya:    'vermilion',
  Borya:   'indigo',
  Mila:    'teal',
  Seva:    'rose',
  Kira:    'cerulean',
};

// Inline SVG settings icon — consistent cross-platform rendering vs ⚙ Unicode
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

  const actions = {
    adjustGuardHp:        game.adjustGuardHp,
    adjustGuardMaxHp:     game.adjustGuardMaxHp,
    setGuardEquipment:    game.setGuardEquipment,
    setGuardSatchelItem:  game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,
    adjustChip:           game.adjustChip,
    resetChips:           game.resetChips,
    setStartingBlack:     game.setStartingBlack,
    adjustBaseStat:       game.adjustBaseStat,
    updateGuard:          game.updateGuard,
    exportState:          game.exportState,
    importState:          game.importState,
    resetState:           game.resetState,
  };

  return (
    <div>
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-brand">
          <div className="top-bar-wordmark">
            <span className="wordmark-the">The</span>
            <span className="wordmark-title">Guard's Ledger</span>
          </div>
          <div className="top-bar-tagline">Campaign Tracker · The Isofarian Guard</div>
        </div>
        <button
          className="icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
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

      {/* Tab content */}
      {tab === 'Guard' && (
        <>
          {/* Guard switcher — colour dot ties button to card avatar */}
          <div className="guard-switcher">
            {state.guards.map((g, i) => {
              const colorKey = GUARD_COLOR_CLASS[g.name] ?? 'gold';
              return (
                <button
                  key={i}
                  className={`guard-switch-btn${activeIdx === i ? ' active' : ''}`}
                  onClick={() => game.setActiveGuard(i)}
                  style={activeIdx !== i ? {} : undefined}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: `var(--c-guard-${colorKey}-border)`,
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
          <GuardPanel guard={activeGuard} guardIdx={activeIdx} actions={actions} />
        </>
      )}

      {tab === 'Cities' && (
        <CitiesTab
          cities={state.cities}
          toggleCityQuest={game.toggleCityQuest}
        />
      )}

      {tab === 'Stash & stonebound' && (
        <StashTab
          sil={state.sil}
          lux={state.lux}
          setSil={game.setSil}
          setLux={game.setLux}
          stash={state.stash}
          adjustStash={game.adjustStash}
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
                dangerouslySetInnerHTML={{
                  __html: entry.message.replace(GUARD_NAME_REGEX, '<strong>$1</strong>'),
                }}
              />
            </div>
          ))}
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          state={state}
          actions={actions}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
