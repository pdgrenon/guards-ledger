import { useState } from 'react';
import { CAMPAIGNS } from '../data/constants';
import { FT_ISTRA_BUILDINGS } from '../data/buildings';
import { MATERIAL_SOURCES } from '../data/materials';
import { Checkmark } from './Checkmark';

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
        aria-label={`${plan.done ? 'Mark incomplete' : 'Mark complete'}: ${plan.text}`}
      >
        {plan.done && <Checkmark />}
      </button>
      {/* Pointer-only convenience target; the labeled checkbox above is the
          accessible control, so this span intentionally has no button role. */}
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

// ─── Ft. Istra Buildings card ────────────────────────────────────────────────
function ResourceCost({ cost, stash, onShowSource }) {
  if (!cost) return null;
  const entries = Object.entries(cost);
  return (
    <div className="fi-cost-rows">
      {entries.map(([name, qty]) => {
        const have = stash[name] ?? 0;
        const ok = have >= qty;
        const hasSource = !!MATERIAL_SOURCES[name];
        return (
          <div key={name} className="fi-cost-row">
            {hasSource ? (
              <button
                className="fi-cost-name mat-source-trigger"
                onClick={() => onShowSource(name)}
                aria-label={`View sources for ${name}`}
              >
                {name}
              </button>
            ) : (
              <span className="fi-cost-name">{name}</span>
            )}
            <span className={`fi-cost-qty ${ok ? 'fi-cost-qty--have' : 'fi-cost-qty--short'}`}>
              {have} / {qty}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ExchangeList({ exchange }) {
  const [open, setOpen] = useState(false);
  if (!exchange || exchange.length === 0) return null;
  return (
    <div className={`fi-exchange-wrap${open ? ' fi-exchange-wrap--open' : ''}`}>
      <button
        className="fi-exchange-toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide' : 'Show'} exchange ({exchange.length})
        <span className={`fi-chevron${open ? ' fi-chevron--open' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="fi-exchange-list">
          {exchange.map((ex, i) => (
            <div key={i} className="fi-exchange-row">
              <span className="fi-exchange-give">{ex.give}</span>
              <span className="fi-exchange-arrow">→</span>
              <span className="fi-exchange-receive">
                {ex.receive === 'courier'
                  ? 'Transfer any equipped cards to Fort Istra Stash'
                  : ex.receive}
              </span>
              {ex.location && (
                <span className="fi-exchange-location">{ex.location}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BUILDING_STATES = ['not_owned', 'built', 'upgraded'];
const STATE_LABELS = ['Not Owned', 'Built', 'Upgraded'];

function BuildingCard({ building, state, stash, onSetState, onShowSource }) {
  const currentIdx = BUILDING_STATES.indexOf(state ?? 'not_owned');
  const isBuilt = currentIdx >= 1;
  const showCost = currentIdx === 0 ? building.buildCost : (currentIdx === 1 && building.hasUpgrade ? building.upgradeCost : null);
  const description = currentIdx >= 1 && building.upgradeDescription
    ? building.upgradeDescription
    : building.description;
  const showExchange = currentIdx === 0
    ? null
    : (currentIdx >= 2 ? building.upgradeExchange : building.exchange);

  return (
    <div className={`fi-building-card${isBuilt ? ' fi-building-card--built' : ''}`}>
      <div className="fi-building-header">
        <div className="fi-building-name">{building.name}</div>
        {building.hasUpgrade && (
          <span className={`fi-upgrade-dot${currentIdx >= 2 ? ' fi-upgrade-dot--active' : ''}`}
            title="Has upgrade"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="fi-building-desc">{description}</div>

      {building.specialReq && currentIdx === 0 && (
        <div className="fi-special-req">Requires: {building.specialReq}</div>
      )}

      <div className="step-selector fi-step-selector" role="group" aria-label={`${building.name} state`}>
        {BUILDING_STATES.map((st, i) => {
          const show = i < 2 || building.hasUpgrade;
          if (!show) return null;
          return (
            <button
              key={st}
              className={`step-btn${currentIdx === i ? ' active' : ''}`}
              onClick={() => onSetState(building.name, st)}
              aria-pressed={currentIdx === i}
            >
              {STATE_LABELS[i]}
            </button>
          );
        })}
      </div>

      {showCost && (
        <div className="fi-cost-section">
          <div className="fi-cost-label">
            {currentIdx === 0 ? 'Build cost' : 'Upgrade cost'}
          </div>
          <ResourceCost cost={showCost} stash={stash} onShowSource={onShowSource} />
        </div>
      )}

      <ExchangeList exchange={showExchange} />
    </div>
  );
}

// ─── Campaign / Chapter tracker ────────────────────────────────────────────────
function CampaignProgressCard({ campaign, onSetCampaign }) {
  const { campaignId } = campaign;

  return (
    <div className="card mb-3">
      <div className="card-title mb-3">Campaign Progress</div>
      <div className="step-selector" role="group" aria-label="Campaign">
        {CAMPAIGNS.map(c => (
          <button
            key={c.id}
            className={`step-btn${campaignId === c.id ? ' active' : ''}`}
            onClick={() => onSetCampaign(c.id)}
            aria-pressed={campaignId === c.id}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FtIstraBuildingsCard({ ftIstraBuildings, stash, onSetFtIstraBuilding, onShowSource }) {
  const buildings = FT_ISTRA_BUILDINGS;

  return (
    <div className="card mb-3 stash-card">
      <div className="card-title mb-3">Fort Istra Buildings</div>
      {buildings.map(building => (
        <div key={building.name}>
          <BuildingCard
            building={building}
            state={ftIstraBuildings[building.name] ?? 'not_owned'}
            stash={stash}
            onSetState={onSetFtIstraBuilding}
            onShowSource={onShowSource}
          />
          {building.hasUpgrade && (
            <div className="fi-upgrade-divider" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function CampaignTab({
  campaign,
  stash,
  onSetEventToken,
  onResetEventToken,
  onSetCampaignLocation,
  onAddDynamicLocation,
  onUpdateDynamicLocation,
  onRemoveDynamicLocation,
  onAddPlan,
  onTogglePlan,
  onDeletePlan,
  onSetCampaign,
  onSetFtIstraBuilding,
  onShowSource,
}) {
  const { eventTokens, locations, plans, ftIstraBuildings } = campaign;

  return (
    <>
      <CampaignProgressCard
        campaign={campaign}
        onSetCampaign={onSetCampaign}
      />
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
      <FtIstraBuildingsCard
        ftIstraBuildings={ftIstraBuildings}
        stash={stash}
        onSetFtIstraBuilding={onSetFtIstraBuilding}
        onShowSource={onShowSource}
      />
    </>
  );
}
