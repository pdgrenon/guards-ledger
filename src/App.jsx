import { useState, useCallback, lazy, Suspense } from 'react';
import { useDialogA11y } from './hooks/useDialogA11y';
import { useGameState } from './hooks/useGameState';
import { GuardPanel } from './components/GuardPanel';
import { CitiesTab } from './components/CitiesTab';
import { StashTab } from './components/StashTab';
import { MaterialSourcePopup } from './components/MaterialSourcePopup';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CorruptionBanner } from './components/CorruptionBanner';
import { GUARDS, GUARD_COLOR_MAP, FALLBACK_COLOR } from './data/constants';
import { safeActiveGuardIdx } from './hooks/gameReducers';

// Heavier / less-frequently-used surfaces are split into their own chunks so
// they aren't part of the initial download (AVE-292). Each loads on first use.
const CraftTab       = lazy(() => import('./components/CraftTab').then(m => ({ default: m.CraftTab })));
const CampaignTab    = lazy(() => import('./components/CampaignTab').then(m => ({ default: m.CampaignTab })));
const MoreTab        = lazy(() => import('./components/MoreTab').then(m => ({ default: m.MoreTab })));
const SettingsPanel  = lazy(() => import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const GlobalSearch   = lazy(() => import('./components/GlobalSearch').then(m => ({ default: m.GlobalSearch })));
// eslint-disable-next-line react-refresh/only-export-components
export { colorizeLogMessage } from './utils/logUtils';
import './index.css';

const TABS = ['Guards', 'Cities', 'Stash', 'Crafting', 'Campaign', 'More'];

function UndoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8h13a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H7" />
      <path d="M7 5l-4 3 4 3" />
    </svg>
  );
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

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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
  const [searchOpen, setSearchOpen] = useState(false);
  // Deep-link seeds from global search. These are one-shot commands: the target
  // tab applies the seed once, then calls its onApplied callback to clear it.
  // Clearing matters because the tab unmounts when inactive — without it, a seed
  // would persist and re-apply (clobbering the user's input) on a later manual
  // return to that tab. A bumped nonce lets a repeat selection re-fire.
  const [craftSeed, setCraftSeed]   = useState(null);
  const [encounterTarget, setEncounterTarget] = useState(null);
  const [cityTarget, setCityTarget] = useState(null);
  // The save-error banner's Export sits directly beside Dismiss, and the banner
  // exists precisely because localStorage is full or blocked — the state in
  // which a download is most likely to fail. downloadJson returns a boolean
  // rather than throwing (one of its callers is the ErrorBoundary), so a caller
  // that ignores it turns "Export a save file now so you don't lose progress"
  // into a button that can silently do nothing (AVE-941).
  const [exportProblem, setExportProblem] = useState(null);
  const clearCraftSeed       = useCallback(() => setCraftSeed(null), []);
  const clearEncounterTarget = useCallback(() => setEncounterTarget(null), []);
  const clearCityTarget      = useCallback(() => setCityTarget(null), []);
  const game = useGameState();
  const { state } = game;

  function openRecipeFromSearch(recipe) {
    setCraftSeed({ term: recipe.name, nonce: Date.now() });
    setTab('Crafting');
    setSearchOpen(false);
  }

  function openEncounterFromSearch(encounter, kind) {
    setEncounterTarget({ id: encounter.id, kind, nonce: Date.now() });
    setTab('More');
    setSearchOpen(false);
  }

  function openCityFromSearch(city) {
    setCityTarget({ id: city.id, nonce: Date.now() });
    setTab('Cities');
    setSearchOpen(false);
  }

  function dismissOnboarding() {
    game.setState(s => ({ ...s, settings: { ...s.settings, hasSeenOnboarding: true } }), null);
  }

  const onboardingRef = useDialogA11y(!state.settings.hasSeenOnboarding, dismissOnboarding);

  const activeParty  = state.activeParty ?? ['Alek', 'Grigory'];
  const safeActiveIdx = safeActiveGuardIdx(state.guards, activeParty, state.activeGuardIdx);
  const activeGuard = state.guards[safeActiveIdx];
  const activeColor = GUARD_COLOR_MAP[activeGuard?.name] ?? FALLBACK_COLOR;

  const guardActions = {
    adjustGuardHp:         game.adjustGuardHp,
    adjustGuardMaxHp:      game.adjustGuardMaxHp,
    setGuardEquipment:     game.setGuardEquipment,
    setGuardSatchelItem:   game.setGuardSatchelItem,
    toggleExpandedSatchel: game.toggleExpandedSatchel,

  };

  const settingsActions = {
    adjustGuardMaxHp: game.adjustGuardMaxHp,

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

        {game.saveError && (
          <div className="corruption-banner" role="alert">
            <div className="corruption-banner-icon" aria-hidden="true">⚠</div>
            <div className="corruption-banner-body">
              <div className="corruption-banner-title">Changes may not be saved</div>
              <div className="corruption-banner-message">{game.saveError}</div>
              <div className="corruption-banner-message">
                Export a save file now so you don't lose progress, then free up browser storage.
              </div>
              {exportProblem && (
                <div className="corruption-banner-message" role="status">{exportProblem}</div>
              )}
              <div className="corruption-banner-actions">
                <button
                  className="corruption-banner-btn"
                  onClick={() => setExportProblem(
                    game.exportState() ? null : 'The save file could not be downloaded.'
                  )}
                >
                  Export save…
                </button>
                <button
                  className="corruption-banner-btn corruption-banner-btn--ghost"
                  onClick={game.dismissSaveError}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* A full-row replacement (import / reset / demo load) reached local
            state but not the shared campaign row. Local and server have
            diverged and the next ordinary edit will deep-merge into the stale
            row, so this must be visible and retryable rather than logged to the
            console and forgotten (AVE-937). */}
        {game.replaceError && (
          <div className="corruption-banner" role="alert">
            <div className="corruption-banner-icon" aria-hidden="true">⚠</div>
            <div className="corruption-banner-body">
              <div className="corruption-banner-title">Campaign not updated</div>
              <div className="corruption-banner-message">
                Your ledger was replaced on this device, but the change could not be sent
                {campaignId ? ` to campaign ${campaignId}` : ''}. Your co-players still see the old data.
              </div>
              <div className="corruption-banner-message">{game.replaceError}</div>
              <div className="corruption-banner-actions">
                <button className="corruption-banner-btn" onClick={game.retryReplacement}>
                  Retry
                </button>
                <button
                  className="corruption-banner-btn corruption-banner-btn--ghost"
                  onClick={game.dismissReplaceError}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
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

          <button
            className="icon-btn"
            disabled={!game.undoLabel}
            onClick={game.undoLastAction}
            aria-label={game.undoLabel ? `Undo: ${game.undoLabel}` : 'Undo last action (none)'}
            title={game.undoLabel ? `Undo: ${game.undoLabel}` : ''}
          >
            <UndoIcon />
          </button>

          <button className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="Search everything">
            <SearchIcon />
          </button>

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
        <Suspense fallback={<div className="tab-loading" role="status">Loading…</div>}>

          {/* ── Guards tab ── */}
          {tab === 'Guards' && (
            <ErrorBoundary level="tab" tabName="Guards">
              <>
                <div className="guard-switcher">
                  {activeParty.map(name => {
                    const guardIdx = state.guards.findIndex(g => g.name === name);
                    const c        = GUARD_COLOR_MAP[name] ?? FALLBACK_COLOR;
                    const isActive = safeActiveIdx === guardIdx;
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
                    {/* resetKey clears a caught error when the player switches
                        guards. This boundary sits in a fixed position, so
                        without it one guard's corrupt record left the fallback
                        up for every guard after it — and the fallback's own
                        advice ("switch to a different guard to keep playing")
                        could not work. */}
                    <ErrorBoundary level="guard" guardName={activeGuard.name} resetKey={activeGuard.name}>
                      <GuardPanel
                        guard={activeGuard}
                        guardIdx={safeActiveIdx}
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
                campaignId={state.campaign.campaignId}
                completedBounties={state.campaign.completedBounties}
                toggleBountyComplete={game.toggleBountyComplete}
                completedPuzzleQuests={state.campaign.completedPuzzleQuests}
                togglePuzzleQuestComplete={game.togglePuzzleQuestComplete}
                cityTarget={cityTarget}
                onTargetApplied={clearCityTarget}
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
                campaignId={state.campaign.campaignId}
                completedBounties={state.campaign.completedBounties}
                completedPuzzleQuests={state.campaign.completedPuzzleQuests}
                onShowSource={setSourceItem}
                searchSeed={craftSeed}
                onSeedApplied={clearCraftSeed}
              />
            </ErrorBoundary>
          )}

          {/* ── Campaign tab ── */}
          {tab === 'Campaign' && (
            <ErrorBoundary level="tab" tabName="Campaign">
              <CampaignTab
                campaign={state.campaign}
                stash={state.stash}
                guards={state.guards}
                activeParty={state.activeParty}
                onSetEventToken={game.setEventToken}
                onResetEventToken={game.resetEventToken}
                onSetCampaignLocation={game.setCampaignLocation}
                onAddDynamicLocation={game.addDynamicLocation}
                onUpdateDynamicLocation={game.updateDynamicLocation}
                onRemoveDynamicLocation={game.removeDynamicLocation}
                onAddPlan={game.addPlan}
                onTogglePlan={game.togglePlan}
                onDeletePlan={game.deletePlan}
                onSetCampaign={game.setCampaign}
                onSetFtIstraBuilding={game.setFtIstraBuilding}
                onShowSource={setSourceItem}
              />
            </ErrorBoundary>
          )}

          {/* ── More tab (Encounters + Log) ── */}
          {tab === 'More' && (
            <ErrorBoundary level="tab" tabName="More">
              <MoreTab
                log={state.log}
                campaign={state.campaign}
                completedEncounters={state.campaign.completedEncounters}
                toggleEncounterComplete={game.toggleEncounterComplete}
                encounterTarget={encounterTarget}
                onTargetApplied={clearEncounterTarget}
              />
            </ErrorBoundary>
          )}
        </Suspense>
        </div>

        {/* Settings overlay */}
        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsPanel
              state={state}
              actions={settingsActions}
              sync={game.sync}
              guardColorMap={GUARD_COLOR_MAP}
              allGuards={GUARDS}
              scrollToMultiplayer={settingsScrollToMultiplayer}
              onClose={closeSettings}
            />
          </Suspense>
        )}

        {/* Global search overlay — only mounted when open so its chunk loads on demand */}
        {searchOpen && (
          <Suspense fallback={null}>
            <GlobalSearch
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              stash={state.stash}
              cities={state.cities}
              onOpenRecipe={openRecipeFromSearch}
              onOpenEncounter={openEncounterFromSearch}
              onOpenCity={openCityFromSearch}
            />
          </Suspense>
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
              ref={onboardingRef}
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
                <p className="onboarding-line onboarding-line--choice">
                  How would you like to start?
                </p>
              </div>
              <div className="onboarding-actions">
                <button className="onboarding-btn" onClick={dismissOnboarding}>
                  Start fresh
                </button>
                <button
                  className="onboarding-btn onboarding-btn--ghost"
                  onClick={game.loadDemoData}
                >
                  Load demo data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
