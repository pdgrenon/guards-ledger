import { useState } from 'react';

// ─── Event token regions ──────────────────────────────────────────────────────
const REGIONS = [
  { key: 'mountain', label: 'Mountain' },
  { key: 'forest',   label: 'Forest'   },
  { key: 'plains',   label: 'Plains'   },
  { key: 'sea',      label: 'Sea'      },
];

// ─── Fixed location fields ────────────────────────────────────────────────────
const FIXED_LOCATIONS = [
  { key: 'party',     label: 'Party'      },
  { key: 'caravan',   label: 'Caravan'    },
  { key: 'mainQuest', label: 'Main Quest' },
  { key: 'boat',      label: 'Boat'       },
];

// ─── Small helpers ────────────────────────────────────────────────────────────
function Checkmark() {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.75"
      style={{ width: 12, height: 12 }} aria-hidden="true">
      <polyline points="1.5,5 4,7.5 8.5,2.5" />
    </svg>
  );
}

function RemoveBtn({ onClick, label }) {
  return (
    <button
      className="campaign-remove-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      ×
    </button>
  );
}

// ─── Event Tokens card ────────────────────────────────────────────────────────
function EventTokensCard({ eventTokens, onAdjust, onReset }) {
  return (
    <div className="card mb-3 stash-card">
      <div className="card-title mb-3">Event Tokens</div>
      <div className="campaign-tokens-grid">
        {REGIONS.map(({ key, label }) => {
          const count     = eventTokens[key] ?? 0;
          const triggered = count >= 3;
          return (
            <div
              key={key}
              className={`campaign-token-card${triggered ? ' triggered' : ''}`}
            >
              <div className="campaign-token-label">{label}</div>

              {/* Pip row */}
              <div className="campaign-token-pips">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className={`campaign-token-pip${i < count ? ' filled' : ''}${triggered ? ' triggered' : ''}`}
                  />
                ))}
              </div>

              {/* Controls */}
              <div className="campaign-token-controls">
                {triggered ? (
                  <button
                    className="campaign-event-resolve-btn"
                    onClick={() => onReset(key)}
                  >
                    Resolve event
                  </button>
                ) : (
                  <div className="adj-row" style={{ justifyContent: 'center' }}>
                    <button
                      className="adj-btn minus"
                      onClick={() => onAdjust(key, -1)}
                      disabled={count === 0}
                      aria-label={`Decrease ${label} token`}
                    >−</button>
                    <span className="adj-val">{count}</span>
                    <button
                      className="adj-btn plus"
                      onClick={() => onAdjust(key, 1)}
                      disabled={count >= 3}
                      aria-label={`Increase ${label} token`}
                    >+</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Locations card ───────────────────────────────────────────────────────────
function LocationsCard({ locations, onSetFixed, onAddDynamic, onUpdateDynamic, onRemoveDynamic }) {
  return (
    <div className="card mb-3 stash-card">
      <div className="card-title mb-3">Locations</div>

      {/* Fixed locations */}
      {FIXED_LOCATIONS.map(({ key, label }) => (
        <div key={key} className="campaign-location-row">
          <label className="campaign-location-label" htmlFor={`loc-${key}`}>{label}</label>
          <input
            id={`loc-${key}`}
            className="campaign-location-input"
            type="text"
            value={locations[key] ?? ''}
            onChange={e => onSetFixed(key, e.target.value)}
            placeholder="—"
          />
        </div>
      ))}

      <hr className="divider" style={{ marginTop: 12, marginBottom: 12 }} />

      {/* Side quests — dynamic */}
      <div className="campaign-dynamic-section">
        <div className="sec-label" style={{ marginBottom: 6 }}>Side Quests</div>
        {(locations.sideQuests ?? []).map(entry => (
          <div key={entry.id} className="campaign-dynamic-row">
            <input
              className="campaign-location-input"
              type="text"
              value={entry.label}
              onChange={e => onUpdateDynamic('sideQuests', entry.id, e.target.value)}
              placeholder="Location / description"
            />
            <RemoveBtn
              onClick={() => onRemoveDynamic('sideQuests', entry.id)}
              label="Remove side quest"
            />
          </div>
        ))}
        <button
          className="campaign-add-link"
          onClick={() => onAddDynamic('sideQuests')}
        >
          + Add side quest
        </button>
      </div>

      <hr className="divider" style={{ marginTop: 12, marginBottom: 12 }} />

      {/* Bounties — dynamic */}
      <div className="campaign-dynamic-section">
        <div className="sec-label" style={{ marginBottom: 6 }}>Bounties</div>
        {(locations.bounties ?? []).map(entry => (
          <div key={entry.id} className="campaign-dynamic-row">
            <input
              className="campaign-location-input"
              type="text"
              value={entry.label}
              onChange={e => onUpdateDynamic('bounties', entry.id, e.target.value)}
              placeholder="Location / description"
            />
            <RemoveBtn
              onClick={() => onRemoveDynamic('bounties', entry.id)}
              label="Remove bounty"
            />
          </div>
        ))}
        <button
          className="campaign-add-link"
          onClick={() => onAddDynamic('bounties')}
        >
          + Add bounty
        </button>
      </div>
    </div>
  );
}

// ─── Plans card ───────────────────────────────────────────────────────────────
function PlansCard({ plans, onAdd, onToggle, onDelete }) {
  const [draft, setDraft] = useState('');

  function handleAdd() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleAdd();
  }

  const open = plans.filter(p => !p.done);
  const done = plans.filter(p => p.done);

  return (
    <div className="card mb-3 stash-card">
      <div className="card-title mb-3">Next Session Plans</div>

      {plans.length === 0 && (
        <div className="log-empty" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div className="log-empty-title">No plans yet</div>
          <div className="log-empty-sub">Add tasks to remember for next session</div>
        </div>
      )}

      {/* Open items */}
      {open.map(plan => (
        <PlanRow key={plan.id} plan={plan} onToggle={onToggle} onDelete={onDelete} />
      ))}

      {/* Done items — separated visually */}
      {done.length > 0 && open.length > 0 && (
        <hr className="divider" style={{ margin: '8px 0' }} />
      )}
      {done.map(plan => (
        <PlanRow key={plan.id} plan={plan} onToggle={onToggle} onDelete={onDelete} />
      ))}

      {/* Add input */}
      <div className="campaign-plan-add">
        <input
          className="campaign-location-input"
          type="text"
          placeholder="Add a plan…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
        />
        <button
          className="campaign-add-btn"
          onClick={handleAdd}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function PlanRow({ plan, onToggle, onDelete }) {
  return (
    <div className={`campaign-plan-row${plan.done ? ' done' : ''}`}>
      <button
        className={`campaign-plan-check${plan.done ? ' done' : ''}`}
        onClick={() => onToggle(plan.id)}
        aria-label={plan.done ? 'Mark incomplete' : 'Mark complete'}
      >
        {plan.done && <Checkmark />}
      </button>
      <span
        className={`campaign-plan-text${plan.done ? ' done' : ''}`}
        onClick={() => onToggle(plan.id)}
      >
        {plan.text}
      </span>
      <RemoveBtn onClick={() => onDelete(plan.id)} label="Delete plan" />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function CampaignTab({
  campaign,
  onSetEventToken,
  onResetEventToken,
  onSetCampaignLocation,
  onAddDynamicLocation,
  onUpdateDynamicLocation,
  onRemoveDynamicLocation,
  onAddPlan,
  onTogglePlan,
  onDeletePlan,
}) {
  const { eventTokens, locations, plans } = campaign;

  return (
    <>
      <EventTokensCard
        eventTokens={eventTokens}
        onAdjust={onSetEventToken}
        onReset={onResetEventToken}
      />
      <LocationsCard
        locations={locations}
        onSetFixed={onSetCampaignLocation}
        onAddDynamic={onAddDynamicLocation}
        onUpdateDynamic={onUpdateDynamicLocation}
        onRemoveDynamic={onRemoveDynamicLocation}
      />
      <PlansCard
        plans={plans}
        onAdd={onAddPlan}
        onToggle={onTogglePlan}
        onDelete={onDeletePlan}
      />
    </>
  );
}
