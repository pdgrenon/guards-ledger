import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import './index.css';

const TABS = ['Guard', 'Cities', 'Stash & stonebound', 'Session log'];

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
        <span className="font-medium" style={{ fontSize: 14, marginRight: 'auto' }}>Isofarian Guard</span>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
      </div>

      {/* Tabs — global, always visible */}
      <div className="tabs-scroll">
        <div className="tabs">
          {TABS.map(t => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'Guard' && (
        <>
          {/* Guard switcher — only visible in Guard tab */}
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
              <span className="log-text" dangerouslySetInnerHTML={{ __html: entry.message.replace(/\b(Alek|Grigory|Party|Stash)\b/g, '<strong>$1</strong>') }} />
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
