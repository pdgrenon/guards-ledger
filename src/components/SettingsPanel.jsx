import { useState, useEffect, useRef } from 'react';

// ─── Sync status indicator ────────────────────────────────────────────────────

function SyncBadge({ status }) {
  const config = {
    idle:    { label: 'Synced',     color: 'var(--c-green)'  },
    syncing: { label: 'Syncing…',   color: 'var(--c-brand)'  },
    offline: { label: 'Offline',    color: 'var(--c-text2)'  },
    error:   { label: 'Sync error', color: 'var(--c-red)'    },
  }[status] ?? { label: status, color: 'var(--c-text2)' };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: config.color }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: config.color, flexShrink: 0,
      }} />
      {config.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsPanel({ state, actions, sync, guardColorMap, allGuards, scrollToMultiplayer, onClose }) {
  const { guards, activeParty = ['Alek', 'Grigory'] } = state;
  const { adjustGuardMaxHp, setStartingBlack, setPartySlot, exportState, importState, resetState } = actions;

  // Multiplayer UI state
  const [joinCode,  setJoinCode]  = useState('');
  const [mpWorking, setMpWorking] = useState(false);
  const [mpError,   setMpError]   = useState(null);
  const [copied,    setCopied]    = useState(false);

  // Ref for the multiplayer section header — used to scroll into view
  const multiplayerRef = useRef(null);
  const bodyRef        = useRef(null);

  // Scroll to multiplayer section when opened via the campaign pill
  useEffect(() => {
    if (scrollToMultiplayer && multiplayerRef.current && bodyRef.current) {
      // Small timeout lets the panel finish its mount animation first
      setTimeout(() => {
        multiplayerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [scrollToMultiplayer]);

  function handleImport(e) {
    const file = e.target.files[0];
    if (file) { importState(file); onClose(); }
  }

  const activeGuards = activeParty.map(name => ({
    guard: guards.find(g => g.name === name),
    gi:    guards.findIndex(g => g.name === name),
  })).filter(({ guard }) => guard != null);

  // ── Multiplayer handlers ────────────────────────────────────────────────

  async function handleCreateCampaign() {
    setMpWorking(true);
    setMpError(null);
    const { error } = await sync.createCampaign();
    setMpWorking(false);
    if (error) setMpError(error);
  }

  async function handleJoinCampaign() {
    if (!joinCode.trim()) return;

    // Warn that joining replaces local state
    const confirmed = window.confirm(
      'Joining will replace your local game state with the campaign\'s current state.\n\nExport a save file first if you want to keep your current data.'
    );
    if (!confirmed) return;

    setMpWorking(true);
    setMpError(null);
    const { error } = await sync.joinCampaign(joinCode);
    setMpWorking(false);
    if (error) {
      setMpError(error);
    } else {
      setJoinCode('');
    }
  }

  function handleLeaveCampaign() {
    if (window.confirm('Leave this campaign? Your local data is kept, but you will stop syncing.')) {
      sync.leaveCampaign();
    }
  }

  async function handleCopyCode() {
    if (!sync.campaignId) return;
    try {
      await navigator.clipboard.writeText(sync.campaignId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  }

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">

        {/* Sticky header */}
        <div className="settings-panel-header">
          <div className="settings-panel-title">Settings</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
              aria-hidden="true">
              <line x1="2" y1="2" x2="14" y2="14" />
              <line x1="14" y1="2" x2="2" y2="14" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="settings-panel-body" ref={bodyRef}>

          {/* ── Active party ── */}
          <div className="settings-guard-header" style={{ '--guard-color': 'var(--c-brand)' }}>
            <span className="settings-guard-dot" style={{ background: 'var(--c-brand)' }} aria-hidden="true" />
            Active party
          </div>
          <div className="settings-sub" style={{ marginBottom: 10 }}>
            Select the two guards for your current campaign
          </div>

          {[0, 1].map(slotIdx => {
            const currentName = activeParty[slotIdx];
            const otherName   = activeParty[1 - slotIdx];
            return (
              <div className="settings-row" key={slotIdx}>
                <div>
                  <div className="settings-label">Guard {slotIdx + 1}</div>
                </div>
                <select
                  className="settings-select"
                  value={currentName}
                  onChange={e => setPartySlot(slotIdx, e.target.value)}
                >
                  {allGuards.map(name => (
                    <option key={name} value={name} disabled={name === otherName}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          <div className="settings-section-divider" />

          {/* ── Per-guard settings ── */}
          {activeGuards.map(({ guard, gi }) => {
            const c = guardColorMap?.[guard.name];
            return (
              <div key={gi}>
                <div
                  className="settings-guard-header"
                  style={c ? { '--guard-color': c.border } : {}}
                >
                  <span
                    className="settings-guard-dot"
                    style={c ? { background: c.border } : {}}
                    aria-hidden="true"
                  />
                  {guard.name}
                </div>

                <div className="settings-row">
                  <div>
                    <div className="settings-label">Max HP</div>
                    <div className="settings-sub">Adjust if an effect permanently changes max health</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="adj-btn" onClick={() => adjustGuardMaxHp(gi, -1)}>−</button>
                    <span className="adj-val">{guard.maxHp}</span>
                    <button className="adj-btn" onClick={() => adjustGuardMaxHp(gi, 1)}>+</button>
                  </div>
                </div>

                <div className="settings-row">
                  <div>
                    <div className="settings-label">Starting black chips</div>
                    <div className="settings-sub">Value black resets to when "Reset chips" is tapped</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="adj-btn" onClick={() => setStartingBlack(gi, guard.startingBlack - 1)}>−</button>
                    <span className="adj-val">{guard.startingBlack}</span>
                    <button className="adj-btn" onClick={() => setStartingBlack(gi, guard.startingBlack + 1)}>+</button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="settings-section-divider" />

          {/* ── Multiplayer ── */}
          <div
            className="settings-guard-header"
            style={{ '--guard-color': 'var(--c-green)' }}
            ref={multiplayerRef}
          >
            <span className="settings-guard-dot" style={{ background: 'var(--c-green)' }} aria-hidden="true" />
            Multiplayer
          </div>

          {!sync.isConfigured ? (
            <div className="settings-sub" style={{ marginBottom: 12 }}>
              Multiplayer sync is not configured in this environment.
            </div>
          ) : sync.campaignId ? (
            /* ── Active campaign ── */
            <>
              <div className="settings-row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="settings-label">Campaign code</div>
                  <div className="settings-sub">Share this with your co-player to join</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: 'var(--c-text)',
                  }}>
                    {sync.campaignId}
                  </span>
                  <button
                    className="settings-action-btn"
                    onClick={handleCopyCode}
                    style={{ minWidth: 80 }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-label">Sync status</div>
                <SyncBadge status={sync.syncStatus} />
              </div>

              {sync.syncError && (
                <div className="settings-sub" style={{ color: 'var(--c-red)', marginBottom: 8 }}>
                  {sync.syncError}
                </div>
              )}

              <div className="settings-row">
                <div>
                  <div className="settings-label" style={{ color: 'var(--c-red)' }}>Leave campaign</div>
                  <div className="settings-sub">Stops syncing. Your local data is kept.</div>
                </div>
                <button
                  className="settings-action-btn settings-action-btn--danger"
                  onClick={handleLeaveCampaign}
                  disabled={mpWorking}
                >
                  Leave
                </button>
              </div>
            </>
          ) : (
            /* ── No active campaign ── */
            <>
              <div className="settings-sub" style={{ marginBottom: 12 }}>
                Create a campaign to get a shareable code, or enter a code from your co-player to join theirs.
              </div>

              {mpError && (
                <div className="settings-sub" style={{ color: 'var(--c-red)', marginBottom: 8 }}>
                  {mpError}
                </div>
              )}

              <div className="settings-row">
                <div className="settings-label">Start new campaign</div>
                <button
                  className="settings-action-btn"
                  onClick={handleCreateCampaign}
                  disabled={mpWorking}
                >
                  {mpWorking ? 'Creating…' : 'Create'}
                </button>
              </div>

              <div className="settings-row" style={{ alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="settings-label" style={{ marginBottom: 6 }}>Join existing campaign</div>
                  <input
                    className="settings-select"
                    style={{ width: '100%', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    type="text"
                    placeholder="Enter code e.g. WOLF42"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleJoinCampaign(); }}
                    maxLength={8}
                  />
                </div>
                <button
                  className="settings-action-btn"
                  style={{ alignSelf: 'flex-end' }}
                  onClick={handleJoinCampaign}
                  disabled={mpWorking || !joinCode.trim()}
                >
                  {mpWorking ? 'Joining…' : 'Join'}
                </button>
              </div>
            </>
          )}

          <div className="settings-section-divider" />

          {/* ── Save data ── */}
          <div className="settings-guard-header" style={{ '--guard-color': 'var(--c-city)' }}>
            <span className="settings-guard-dot" style={{ background: 'var(--c-city)' }} aria-hidden="true" />
            Save data
          </div>

          <div className="settings-row">
            <div className="settings-label">Export save file</div>
            <button className="settings-action-btn" onClick={exportState}>Export JSON</button>
          </div>

          <div className="settings-row">
            <div className="settings-label">Import save file</div>
            <label style={{ cursor: 'pointer' }}>
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
              <div className="settings-action-btn">Import JSON</div>
            </label>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label" style={{ color: 'var(--c-red)' }}>Reset all data</div>
              <div className="settings-sub">Wipes all game state — cannot be undone</div>
            </div>
            <button
              className="settings-action-btn settings-action-btn--danger"
              onClick={() => { resetState(); onClose(); }}
            >
              Reset
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
