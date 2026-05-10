import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import './index.css';

const TABS = ['Guards', 'Cities', 'Stash & stonebound', 'Session log'];

// Bottom sheet for editing Sil or Lux
function ResourceSheet({ label, value, step, setStep, onAdjust, onClose }) {
  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium" style={{ fontSize: 16 }}>{label}</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 48, fontWeight: 500, color: 'var(--c-text)', margin: '12px 0' }}>
          {value}
        </div>
        <div className="step-selector" style={{ marginBottom: 12 }}>
          {[1, 5, 10].map(s => (
            <button key={s} className={`step-btn${step === s ? ' active' : ''}`} onClick={() => setStep(s)}>{s}</button>
          ))}
        </div>
        <div className="counter-actions">
          <button className="counter-btn" style={{ height: 52, fontSize: 28 }} onClick={() => onAdjust(-step)}>−</button>
          <button className="counter-btn" style={{ height: 52, fontSize: 28 }} onClick={() => onAdjust(step)}>+</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('Guards');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [silSheetOpen, setSilSheetOpen] = useState(false);
  const [luxSheetOpen, setLuxSheetOpen] = useState(false);
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
      {/* Combined top bar */}
      <div className="top-bar">
        <span className="font-medium" style={{ fontSize: 14, marginRight: 'auto' }}>Isofarian Guard</span>

        <button className="resource-pill" onClick={() => setSilSheetOpen(true)} title="Edit Sil">
          <span className="resource-pill-label">Sil</span>
          <span className="resource-pill-value">{state.sil}</span>
        </button>

        <button className="resource-pill" onClick={() => setLuxSheetOpen(true)} title="Edit Lux">
          <span className="resource-pill-label">Lux</span>
          <span className="resource-pill-value">{state.lux}</span>
        </button>

        <button className="end-round-btn" onClick={game.endRound} title="End round and advance">
          Rnd {state.round} ›
        </button>

        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
      </div>

      {/* Scrollable single-row tabs */}
      <div className="tabs-scroll">
        <div className="tabs">
          {TABS.map(t => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
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

      {tab === 'Stash & stonebound' && (
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

      {/* Sil sheet */}
      {silSheetOpen && (
        <ResourceSheet
          label="Sil"
          value={state.sil}
          step={silStep}
          setStep={setSilStep}
          onAdjust={delta => game.setSil(delta)}
          onClose={() => setSilSheetOpen(false)}
        />
      )}

      {/* Lux sheet */}
      {luxSheetOpen && (
        <ResourceSheet
          label="Lux Essence"
          value={state.lux}
          step={luxStep}
          setStep={setLuxStep}
          onAdjust={delta => game.setLux(delta)}
          onClose={() => setLuxSheetOpen(false)}
        />
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
