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

export default function App() {
  const [tab, setTab] = useState('Guard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const game = useGameState();
  const { state } = game;

  const activeIdx = state.activeGuardIdx ?? 0;
  const activeGuard = state.guards[activeIdx];

  const actions = {
    adjustGuardHp: game.adjustGuardHp,
    adjustGuardMaxHp: game.adjustGuardMaxHp,
    setGuardEquipment: game.setGuardEquipment,
    setGuardSatchelItem: game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,
    adjustChip: game.adjustChip,
    resetChips: game.resetChips,
    setStartingBlack: game.setStartingBlack,
    adjustBaseStat: game.adjustBaseStat,
    updateGuard: game.updateGuard,
    exportState: game.exportState,
    importState: game.importState,
    resetState: game.resetState,
  };

  return (
    <div>
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-brand" style={{ marginRight: 'auto' }}>
          <div className="top-bar-wordmark">
            <span className="wordmark-the">The</span>
            <span className="wordmark-title">Guard's Ledger</span>
          </div>
          <div className="top-bar-tagline">Campaign Tracker · The Isofarian Guard</div>
        </div>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Guard' && (
        <>
          <div className="guard-switcher">
            {state.guards.map((g, i) => (
              <button
                key={i}
                className={`guard-switch-btn${activeIdx === i ? ' active' : ''}`}
                onClick={() => game.setActiveGuard(i)}
              >
                {g.name}
              </button>
            ))}
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
            <span className="text-hint" style={{ fontSize: 10 }}>Last {state.log.length} events</span>
          </div>
          {state.log.length === 0 && (
            <div className="text-hint text-sm" style={{ padding: '8px 0' }}>No events yet.</div>
          )}
          {state.log.map(entry => (
            <div key={entry.id} className="log-entry">
              <span className="log-time">{entry.time}</span>
              <span className="log-text" dangerouslySetInnerHTML={{ __html: entry.message.replace(GUARD_NAME_REGEX, '<strong>$1</strong>') }} />
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
