import { useState } from 'react';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { SettingsPanel } from './components/SettingsPanel';
import { CampaignTab } from './components/CampaignTab';
import { CraftTab } from './components/CraftTab';
import { MoreTab } from './components/MoreTab';
import { MaterialSourcePopup } from './components/MaterialSourcePopup';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CorruptionBanner } from './components/CorruptionBanner';
import { GUARDS, GUARD_COLOR_MAP, FALLBACK_COLOR } from './data/constants';
// eslint-disable-next-line react-refresh/only-export-components
export { colorizeLogMessage } from './utils/logUtils';
import './index.css';

const TABS = ['Guards', 'Cities', 'Stash', 'Crafting', 'Campaign', 'More'];

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

// Sync status dot colors — matches SyncBadge in SettingsPanel
const SYNC_DOT_COLOR = {
  idle:    'var(--c-green)',
  syncing: 'var(--c-brand)',
  offline: 'var(--c-text2)',
  error:   'var(--c-red)',
};

export default function App() {
  const [tab, setTab]               = useState('Guards');
  const [settingsOpen, setSettingsOpen]     = useState(false);
  const [settingsScrollToMultiplayer, setSettingsScrollToMultiplayer] = useState(false);
  const [sourceItem, setSourceItem] = useState(null);
  const game = useGameState();
  const { state } = game;

  function dismissOnboarding() {
    game.setState(s => ({ ...s, settings: { ...s.settings, hasSeenOnboarding: true } }), null);
  }

  const activeParty = state.activeParty ?? ['Alek', 'Grigory'];
  const activeIdx   = state.activeGuardIdx ?? 0;
  const activeGuard = state.guards[activeIdx];
  const activeColor = GUARD_COLOR_MAP[activeGuard?.name] ?? FALLBACK_COLOR;

  const guardActions = {
    adjustGuardHp:         game.adjustGuardHp,
    adjustGuardMaxHp:      game.adjustGuardMaxHp,
    setGuardEquipment:     game.setGuardEquipment,
    setGuardSatchelItem:   game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,
    adjustChip:            game.adjustChip,
    resetChips:            game.resetChips,
  };

  const settingsActions = {
    adjustGuardMaxHp: game.adjustGuardMaxHp,
    setStartingBlack: game.setStartingBlack,
    setPartySlot:     game.setPartySlot,
    exportState:      game.exportState,
    importState:      game.importState,
    resetState:       game.resetState,
  };

  function openSettings() {
    setSettingsScrollToMultiplayer(false);
    setSettingsOpen(true);
  }

  function openSettingsAtMultiplayer() {
    setSettingsScrollToMultiplayer(true);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setSettingsScrollToMultiplayer(false);
  }

  const { campaignId, syncStatus } = game.sync;
  const dotColor = SYNC_DOT_COLOR[syncStatus] ?? 'var(--c-text2)';

  return (
    <ErrorBoundary level="app">
      <div>
        {game.corruption && (
          <CorruptionBanner
            corruption={game.corruption}
            onDismiss={game.dismissCorruption}
            onImport={game.importState}
          />
        )}

        {/* Top bar */}
        <div className="top-bar">
          <div className="top-bar-brand">
            <div className="wordmark-the">The</div>
            <div className="wordmark-title">Guard's Ledger</div>
            <div className="wordmark-rule" aria-hidden="true" />
          </div>

          {/* Campaign pill — only shown when connected to a campaign */}
          {campaignId && (
            <button
              className="campaign-pill"
              onClick={openSettingsAtMultiplayer}
              aria-label={`Connected to campaign ${campaignId}. Tap to open multiplayer settings.`}
            >
              <span
                className="campaign-pill-dot"
                style={{ background: dotColor }}
                aria-hidden="true"
              />
              {campaignId}
            </button>
          )}

          <button className="icon-btn" onClick={openSettings} aria-label="Settings">
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
              className={`tab${tab === t ? ' tab--active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="tab-content">

          {/* ── Guards tab ── */}
          {tab === 'Guards' && (
            <ErrorBoundary level="tab" tabName="Guards">
              <>
                <div className="guard-switcher">
                  {activeParty.map(name => {
                    const guardIdx = state.guards.findIndex(g => g.name === name);
                    const c        = GUARD_COLOR_MAP[name] ?? FALLBACK_COLOR;
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
                    <ErrorBoundary level="guard" guardName={activeGuard.name}>
                      <GuardPanel
                        guard={activeGuard}
                        guardIdx={activeIdx}
                        actions={guardActions}
                      />
                    </ErrorBoundary>
                  </div>
                )}
              </>
            </ErrorBoundary>
          )}

          {/* ── Cities tab ── */}
          {tab === 'Cities' && (
            <ErrorBoundary level="tab" tabName="Cities">
              <CitiesTab
                cities={state.cities}
                toggleCityQuest={game.toggleCityQuest}
              />
            </ErrorBoundary>
          )}

          {/* ── Stash tab ── */}
          {tab === 'Stash' && (
            <ErrorBoundary level="tab" tabName="Stash">
              <StashTab
                sil={state.sil} lux={state.lux}
                setSil={game.setSil} setLux={game.setLux}
                stash={state.stash} adjustStash={game.adjustStash}
                stonebound={state.stonebound}
                setStoneboundMax={game.setStoneboundMax}
                addStoneboundLocation={game.addStoneboundLocation}
                removeStoneboundLocation={game.removeStoneboundLocation}
                updateStoneboundLocation={game.updateStoneboundLocation}
                onShowSource={setSourceItem}
              />
            </ErrorBoundary>
          )}

          {/* ── Crafting tab ── */}
          {tab === 'Crafting' && (
            <ErrorBoundary level="tab" tabName="Crafting">
              <CraftTab
                stash={state.stash}
                sil={state.sil}
                lux={state.lux}
                guards={state.guards}
                activeParty={state.activeParty}
                cities={state.cities}
                onShowSource={setSourceItem}
              />
            </ErrorBoundary>
          )}

          {/* ── Campaign tab ── */}
          {tab === 'Campaign' && (
            <ErrorBoundary level="tab" tabName="Campaign">
              <CampaignTab
                campaign={state.campaign}
                stash={state.stash}
                onSetEventToken={game.setEventToken}
                onResetEventToken={game.resetEventToken}
                onSetCampaignLocation={game.setCampaignLocation}
                onAddDynamicLocation={game.addDynamicLocation}
                onUpdateDynamicLocation={game.updateDynamicLocation}
                onRemoveDynamicLocation={game.removeDynamicLocation}
                onAddPlan={game.addPlan}
                onTogglePlan={game.togglePlan}
                onDeletePlan={game.deletePlan}
                onSetFtIstraBuilding={game.setFtIstraBuilding}
              />
            </ErrorBoundary>
          )}

          {/* ── More tab (Encounters + Log) ── */}
          {tab === 'More' && (
            <ErrorBoundary level="tab" tabName="More">
              <MoreTab
                log={state.log}
                completedEncounters={state.campaign.completedEncounters}
                toggleEncounterComplete={game.toggleEncounterComplete}
              />
            </ErrorBoundary>
          )}
        </div>

        {/* Settings overlay */}
        {settingsOpen && (
          <SettingsPanel
            state={state}
            actions={settingsActions}
            sync={game.sync}
            guardColorMap={GUARD_COLOR_MAP}
            allGuards={GUARDS}
            scrollToMultiplayer={settingsScrollToMultiplayer}
            onClose={closeSettings}
          />
        )}

        {/* Material source popup */}
        <MaterialSourcePopup
          item={sourceItem}
          onClose={() => setSourceItem(null)}
        />

        {/* Onboarding overlay — first-run only */}
        {!state.settings.hasSeenOnboarding && (
          <div className="onboarding-backdrop" onClick={dismissOnboarding}>
            <div
              className="onboarding-modal"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Welcome to The Guard's Ledger"
            >
              <div className="onboarding-handle" />
              <div className="onboarding-body">
                <div className="onboarding-title">Welcome to The Guard's Ledger</div>
                <p className="onboarding-line">
                  A campaign companion for <strong>The Isofarian Guard</strong>.
                </p>
                <p className="onboarding-line">
                  Track your guards, cities, stash, crafting, and campaign state — all in one place.
                </p>
                <p className="onboarding-line">
                  Everything saves automatically to your browser.
                </p>
                <p className="onboarding-line">
                  For multiplayer, open Settings and connect to a campaign.
                </p>
              </div>
              <div className="onboarding-actions">
                <button className="onboarding-btn" onClick={dismissOnboarding}>
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
