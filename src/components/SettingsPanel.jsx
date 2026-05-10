export function SettingsPanel({ state, actions, onClose }) {
  const { guards } = state;
  const { adjustGuardMaxHp, setStartingBlack, exportState, importState, resetState, adjustBaseStat } = actions;

  function handleImport(e) {
    const file = e.target.files[0];
    if (file) { importState(file); onClose(); }
  }

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="flex items-center justify-between mb-3">
          <div className="settings-panel-title">Settings</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {guards.map((guard, gi) => (
          <div key={gi}>
            <div className="sec-label" style={{ marginTop: 12 }}>{guard.name}</div>

            <div className="settings-row">
              <div>
                <div className="settings-label">Max HP</div>
                <div className="settings-sub">Adjust if an effect changes max health</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="adj-btn" onClick={() => adjustGuardMaxHp(gi, -1)}>−</button>
                <span className="adj-val">{guard.maxHp}</span>
                <button className="adj-btn" onClick={() => adjustGuardMaxHp(gi, 1)}>+</button>
              </div>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">Base attack</div>
                <div className="settings-sub">Guard's innate ATK before weapon</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="adj-btn" onClick={() => adjustBaseStat(gi, 'atk', -1)}>−</button>
                <span className="adj-val">{guard.baseAtk ?? 0}</span>
                <button className="adj-btn" onClick={() => adjustBaseStat(gi, 'atk', 1)}>+</button>
              </div>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-label">Base defense</div>
                <div className="settings-sub">Guard's innate DEF before armor</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="adj-btn" onClick={() => adjustBaseStat(gi, 'def', -1)}>−</button>
                <span className="adj-val">{guard.baseDef ?? 0}</span>
                <button className="adj-btn" onClick={() => adjustBaseStat(gi, 'def', 1)}>+</button>
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
        ))}

        <div className="sec-label" style={{ marginTop: 16 }}>Save data</div>

        <div className="settings-row">
          <div className="settings-label">Export save file</div>
          <button className="settings-action-btn" onClick={exportState}>
            Export JSON
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-label">Import save file</div>
          <label style={{ cursor: 'pointer' }}>
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            <div className="settings-action-btn">
              Import JSON
            </div>
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
  );
}
