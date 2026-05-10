import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import { GUARDS } from './data/constants';
import './index.css';

const TABS = ['Guards', 'Cities', 'Stash & Stonebound', 'Session Log'];

// Build a regex from all guard names for dynamic log highlighting
const GUARD_NAMES_PATTERN = GUARDS.join('|');
const LOG_HIGHLIGHT_REGEX = new RegExp(`\\b(${GUARD_NAMES_PATTERN}|Party|Stash)\\b`, 'g');

export default function App() {
  const [tab, setTab] = useState('Guards');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [silStep, setSilStep] = useState(1);
  const [luxStep, setLuxStep] = useState(1);
  const game = useGameState();
  const { state } = game;

  const actions = {
    adjustGuardHp: game.adjustGuardHp,
    adjustGuardMaxHp: game.adjustGuardMaxHp,
    adjustGuardAp: game.adjustGuardAp,
    setGuardEquipment: game.setGuardEquipment,
    setGuardSatchelItem: game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,
    useStone: game.useStone,
    adjustChip: game.adjustChip,
    endBattle: game.endBattle,
    setStartingBlack: game.setStartingBlack,
    adjustTempDef: game.adjustTempDef,
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
        <div className="top-bar-brand">
          <div className="top-bar-wordmark">
            <span className="wordmark-the">The</span>
            <span className="wordmark-title">Guard's Ledger</span>
          </div>
          <span className="top-bar-tagline">Campaign Tracker · The Isofarian Guard</span>
        </div>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
      </div>

      {/* Party strip */}
      <div className="party-strip">
        <div className="metric-card">
          <div className="metric-label">Sil</div>
          <span className="metric-value">{state.sil}</span>
          <div className="step-selector">
            {[1, 5, 10].map(s => (
              <button key={s} className={`step-btn${silStep === s ? ' active' : ''}`} onClick={() => setSilStep(s)}>{s}</button>
            ))}
          </div>
          <div className="counter-actions">
            <button className="counter-btn" onClick={() => game.setSil(-silStep)}>−</button>
            <button className="counter-btn" onClick={() => game.setSil(silStep)}>+</button>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Lux Essence</div>
          <span className="metric-value">{state.lux}</span>
          <div className="step-selector">
            {[1, 5, 10].map(s => (
              <button key={s} className={`step-btn${luxStep === s ? ' active' : ''}`} onClick={() => setLuxStep(s)}>{s}</button>
            ))}
          </div>
          <div className="counter-actions">
            <button className="counter-btn" onClick={() => game.setLux(-luxStep)}>−</button>
            <button className="counter-btn" onClick={() => game.setLux(luxStep)}>+</button>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Round</div>
          <div className="flex items-center gap-1">
            <span className="metric-value">{state.round}</span>
            <button
              className="adj-btn end-round-btn"
              onClick={game.endRound}
            >
              End round
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Guards' && (
        <div className="guards-grid">
          {state.guards.map((guard, gi) => (
            <GuardPanel key={gi} guard={guard} guardIdx={gi} actions={actions} />
          ))}
        </div>
      )}

      {tab === 'Cities' && (
        <CitiesTab
          cities={state.cities}
          toggleCityQuest={game.toggleCityQuest}
        />
      )}

      {tab === 'Stash & Stonebound' && (
        <StashTab
          stash={state.stash}
          adjustStash={game.adjustStash}
          stonebound={state.stonebound}
          setStoneboundMax={game.setStoneboundMax}
          addStoneboundLocation={game.addStoneboundLocation}
          removeStoneboundLocation={game.removeStoneboundLocation}
          updateStoneboundLocation={game.updateStoneboundLocation}
        />
      )}

      {tab === 'Session Log' && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="sec-label" style={{ marginBottom: 0 }}>Session Log</div>
            <span className="text-hint text-xs">Last {state.log.length} events</span>
          </div>
          {state.log.length === 0 && (
            <div className="text-hint text-sm" style={{ padding: '8px 0' }}>No events yet.</div>
          )}
          {state.log.map(entry => (
            <div key={entry.id} className="log-entry">
              <span className="log-time">{entry.time}</span>
              <span className="log-text" dangerouslySetInnerHTML={{ __html: entry.message.replace(LOG_HIGHLIGHT_REGEX, '<strong>$1</strong>') }} />
            </div>
          ))}
        </div>
      )}

      {/* Settings panel */}
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
