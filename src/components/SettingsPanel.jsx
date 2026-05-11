export function SettingsPanel({ state, actions, guardColorMap, allGuards, onClose }) {
  const { guards, activeParty = ['Alek', 'Grigory'] } = state;
  const { adjustGuardMaxHp, setStartingBlack, setPartySlot, exportState, importState, resetState } = actions;

  function handleImport(e) {
    const file = e.target.files[0];
    if (file) { importState(file); onClose(); }
  }

  // Only show per-guard settings for the two active party members
  const activeGuards = activeParty.map(name => ({
    guard: guards.find(g => g.name === name),
    gi:    guards.findIndex(g => g.name === name),
  })).filter(({ guard }) => guard != null);

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
        <div className="settings-panel-body">

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

          {/* ── Per-guard settings — active party only ── */}
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
