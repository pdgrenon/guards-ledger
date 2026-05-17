import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import { CampaignTab } from './components/CampaignTab';
import { GUARDS, GUARD_COLOR_MAP, FALLBACK_COLOR } from './data/constants';
import './index.css';

const TABS = ['Guard', 'Cities', 'Stash', 'Campaign', 'Session log'];

// ─── Log entry category classifier ──────────────────────────────────────────
// guard   → the guard's identity color (looked up from GUARD_COLOR_MAP)
// party   → brand ochre (Sil, Lux, Stash, Stonebound, city quests)
// system  → neutral gray (import, reset)
const CITY_NAMES_SET = new Set(['Mir', 'Razdor', 'Ryba', 'Silny', 'Strofa', 'Vouno']);

function classifyEntry(message) {
  const first = message.split(' ')[0];
  if (GUARD_COLOR_MAP[first]) return { type: 'guard', guardKey: GUARD_COLOR_MAP[first].key };
  if (first === 'Party' || first === 'Stash' || first === 'Stonebound' || CITY_NAMES_SET.has(first)) return { type: 'party' };
  return { type: 'system' };
}

// Regex for colorizing guard names inline in log messages
const ALL_GUARD_NAMES = Object.keys(GUARD_COLOR_MAP);
const GUARD_NAME_REGEX = new RegExp(`\\b(${[...ALL_GUARD_NAMES, 'Party', 'Stash'].join('|')})\\b`, 'g');

function colorizeLogMessage(message) {
  return message.replace(GUARD_NAME_REGEX, (match) => {
    const color = GUARD_COLOR_MAP[match];
    if (!color) return `<strong>${match}</strong>`;
    return `<span class="log-name-${color.key}">${match}</span>`;
  });
}

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

  const activeParty = state.activeParty ?? ['Alek', 'Grigory'];
  const activeIdx   = state.activeGuardIdx ?? 0;
  const activeGuard = state.guards[activeIdx];
  const activeColor = GUARD_COLOR_MAP[activeGuard?.name] ?? FALLBACK_COLOR;

  // actions object threaded into GuardPanel
  const guardActions = {
    adjustGuardHp:         game.adjustGuardHp,
    adjustGuardMaxHp:      game.adjustGuardMaxHp,
    setGuardEquipment:     game.setGuardEquipment,
    setGuardSatchelItem:   game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,
    adjustChip:            game.adjustChip,
    resetChips:            game.resetChips,
  };

  // state + actions objects threaded into SettingsPanel (matches its prop signature)
  const settingsState   = state;
  const settingsActions = {
    adjustGuardMaxHp: game.adjustGuardMaxHp,
    setStartingBlack: game.setStartingBlack,
    setPartySlot:     game.setPartySlot,
    exportState:      game.exportState,
    importState:      game.importState,
    resetState:       game.resetState,
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
          {/* Switcher — only the two active party members, no party selects here */}
          <div className="guard-switcher">
            {activeParty.map((name) => {
              const guardIdx = state.guards.findIndex(g => g.name === name);
              const c = GUARD_COLOR_MAP[name] ?? FALLBACK_COLOR;
              const isActive = activeIdx === guardIdx;
              return (
                <button
                  key={name}
                  className={`guard-switch-btn${isActive ? ' active' : ''}`}
                  onClick={() => game.setActiveGuard(guardIdx)}
                  style={isActive ? { '--switch-color': c.border, '--switch-bg': c.bg } : {}}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {activeGuard && (
            <div
              className="guard-card-wrapper"
              style={{ '--guard-color': activeColor.border }}
            >
              <GuardPanel
                guard={activeGuard}
                guardIdx={activeIdx}
                actions={guardActions}
              />
            </div>
          )}
        </>
      )}

      {/* ── Cities tab ── */}
      {tab === 'Cities' && (
        <CitiesTab
          cities={state.cities}
          toggleCityQuest={game.toggleCityQuest}
        />
      )}

      {/* ── Stash tab ── */}
      {tab === 'Stash' && (
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

      {/* ── Campaign tab ── */}
      {tab === 'Campaign' && (
        <CampaignTab
          campaign={state.campaign}
          onSetEventToken={game.setEventToken}
          onResetEventToken={game.resetEventToken}
          onSetCampaignLocation={game.setCampaignLocation}
          onAddDynamicLocation={game.addDynamicLocation}
          onUpdateDynamicLocation={game.updateDynamicLocation}
          onRemoveDynamicLocation={game.removeDynamicLocation}
          onAddPlan={game.addPlan}
          onTogglePlan={game.togglePlan}
          onDeletePlan={game.deletePlan}
        />
      )}

      {/* ── Session log tab ── */}
      {tab === 'Session log' && (
        <div className="card log-card">
          <div className="flex items-center justify-between mb-2">
            <div className="card-title">Session log</div>
            <span className="log-count">{state.log.length} event{state.log.length !== 1 ? 's' : ''}</span>
          </div>

          {state.log.length === 0 ? (
            <div className="log-empty">
              <div className="log-empty-title">No events yet</div>
              <div className="log-empty-sub">Actions will appear here as you play</div>
            </div>
          ) : (
            <div className="log-list">
              {state.log.map((entry) => {
                const cls = classifyEntry(entry.message);
                const borderColor =
                  cls.type === 'guard'  ? `var(--c-guard-${cls.guardKey}-border)` :
                  cls.type === 'party'  ? 'var(--c-brand)' :
                                          'var(--c-border2)';
                return (
                  <div
                    key={entry.id}
                    className="log-entry"
                    style={{ '--log-border': borderColor }}
                  >
                    <span className="log-time">{entry.time}</span>
                    <span
                      className="log-text"
                      dangerouslySetInnerHTML={{ __html: colorizeLogMessage(entry.message) }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Settings overlay — passes state/actions objects matching SettingsPanel's signature */}
      {settingsOpen && (
        <SettingsPanel
          state={settingsState}
          actions={settingsActions}
          guardColorMap={GUARD_COLOR_MAP}
          allGuards={GUARDS}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
