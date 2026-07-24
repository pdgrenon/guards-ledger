import { useState, useEffect, useRef, useCallback } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { useDialogA11y } from '../hooks/useDialogA11y';

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
  const { adjustGuardMaxHp, setPartySlot, exportState, importState, resetState } = actions;

  // Multiplayer UI state
  const [joinCode,  setJoinCode]  = useState('');
  const [mpWorking, setMpWorking] = useState(false);
  const [mpError,   setMpError]   = useState(null);
  // null | 'copied' | 'failed' — mutually exclusive outcomes of one Copy tap,
  // sharing a single reset timer (AVE-789).
  const [copyStatus, setCopyStatus] = useState(null);

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState(null);

  // Ref for the multiplayer section header — used to scroll into view
  const multiplayerRef = useRef(null);
  const bodyRef        = useRef(null);
  // The hidden file input behind the Import button — clicked programmatically
  // so the visible affordance can be a real, focusable <button> (AVE-785).
  const fileInputRef   = useRef(null);
  const copyTimerRef   = useRef(null);

  // Clear a pending copy-status reset on unmount so it can't fire into a
  // torn-down component.
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  // Escape closes the panel — but not while the nested confirm dialog owns the
  // foreground (it handles its own Escape). The trap stays mounted throughout.
  const handleEscapeClose = useCallback(() => {
    if (!confirmAction) onClose();
  }, [confirmAction, onClose]);
  const dialogRef = useDialogA11y(true, handleEscapeClose);

  // Scroll to multiplayer section when opened via the campaign pill
  useEffect(() => {
    if (scrollToMultiplayer && multiplayerRef.current && bodyRef.current) {
      // Small timeout lets the panel finish its mount animation first
      const t = setTimeout(() => {
        multiplayerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return () => clearTimeout(t);
    }
  }, [scrollToMultiplayer]);

  const [importError, setImportError] = useState(null);

  async function handleImport(e) {
    // Capture the element before the await — the handler's synchronous frame
    // is the only place the event target is unambiguously live.
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const result = await importState(file);
    // Reset the value so picking the *same* file again still fires `change`;
    // browsers suppress the event when `value` is unchanged, which otherwise
    // dead-ends a retry after the player fixes their save file.
    input.value = '';
    if (result.success) {
      setImportError(null);
      onClose();
    } else {
      setImportError(result.error);
    }
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
    setConfirmAction('join');
  }

  async function execJoinCampaign() {
    setConfirmAction(null);
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
    setConfirmAction('leave');
  }

  function execLeaveCampaign() {
    setConfirmAction(null);
    sync.leaveCampaign();
  }

  async function handleCopyCode() {
    if (!sync.campaignId) return;
    try {
      // Guard the API's existence explicitly rather than leaning on the
      // synchronous TypeError a missing `navigator.clipboard` would throw —
      // it is undefined in any non-secure context.
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(sync.campaignId);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyStatus(null), 3000);
  }

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">

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
                    <button className="adj-btn" onClick={() => adjustGuardMaxHp(gi, -1)} aria-label={`Decrease ${guard.name} max HP`}>−</button>
                    <span className="adj-val">{guard.maxHp}</span>
                    <button className="adj-btn" onClick={() => adjustGuardMaxHp(gi, 1)} aria-label={`Increase ${guard.name} max HP`}>+</button>
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
                    // Explicit so the manual-copy hint below stays honest.
                    userSelect: 'text',
                  }}>
                    {sync.campaignId}
                  </span>
                  <button
                    className="settings-action-btn"
                    onClick={handleCopyCode}
                    style={{ minWidth: 80 }}
                  >
                    {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
                  </button>
                  {copyStatus === 'failed' && (
                    <div className="settings-sub" style={{ color: 'var(--c-red)' }} role="status">
                      Couldn&apos;t copy automatically — select the code above and copy it manually.
                    </div>
                  )}
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
                    placeholder="Enter code e.g. WOLF-7F3K9Q"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleJoinCampaign(); }}
                    /* Room for a pasted 'WOLF - 7F3K9Q' plus a trailing space —
                       normalizeCampaignCode strips the padding before lookup. */
                    maxLength={16}
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
            <div>
              <div className="settings-label">Import save file</div>
              {importError && (
                <div className="settings-sub" style={{ color: 'var(--c-red)' }}>{importError}</div>
              )}
            </div>
            {/* The input is driven programmatically by the button below — it is
                display:none, so it is neither focusable nor in the a11y tree.
                tabIndex/aria-hidden say so explicitly, keeping the dialog's
                focus trap down to one stop for this one control (AVE-785). */}
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImport}
                tabIndex={-1}
                aria-hidden="true"
              />
              <button
                type="button"
                className="settings-action-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Import JSON
              </button>
            </>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label" style={{ color: 'var(--c-red)' }}>Reset all data</div>
              <div className="settings-sub">Wipes all game state — cannot be undone</div>
            </div>
            <button
              className="settings-action-btn settings-action-btn--danger"
              onClick={() => setConfirmAction('reset')}
            >
              Reset
            </button>
          </div>

        </div>
      </div>

      {confirmAction === 'join' && (
        <ConfirmModal
          title="Join campaign"
          confirmLabel="Join"
          onConfirm={execJoinCampaign}
          onCancel={() => setConfirmAction(null)}
          danger
        >
          <p className="confirm-modal-message">
            Joining will replace your local game state with the campaign's current state.
          </p>
          <button
            className="settings-action-btn"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 4 }}
            onClick={exportState}
          >
            Export save file first
          </button>
        </ConfirmModal>
      )}

      {confirmAction === 'leave' && (
        <ConfirmModal
          title="Leave campaign"
          confirmLabel="Leave"
          onConfirm={execLeaveCampaign}
          onCancel={() => setConfirmAction(null)}
          danger
        >
          <p className="confirm-modal-message">
            Your local data is kept, but you will stop syncing with this campaign.
          </p>
        </ConfirmModal>
      )}

      {confirmAction === 'reset' && (
        <ConfirmModal
          title="Reset all data"
          confirmLabel="Reset"
          onConfirm={() => { setConfirmAction(null); resetState(); onClose(); }}
          onCancel={() => setConfirmAction(null)}
          danger
        >
          <p className="confirm-modal-message">
            This wipes all game state — cannot be undone. Export a save file first if you want to keep your current data.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
