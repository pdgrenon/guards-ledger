import { useState } from 'react';
import { TRAINING_YARD_FIGHTS, SPIRIT_BOSSES } from '../data/encounters';
import { CAMPAIGNS, GUARD_COLOR_MAP } from '../data/constants';
import { colorizeLogMessage } from '../utils/logUtils';

const CITY_NAMES_SET = new Set(['Mir', 'Razdor', 'Ryba', 'Silny', 'Strofa', 'Vouno']);

const ANY_GROUP = { id: 0, label: 'Any Campaign' };

function campaignGroupFromReq(req) {
  if (!req || req === 'Any Campaign') return ANY_GROUP;
  const match = req.match(/Campaign (\d)/);
  if (match) {
    const id = parseInt(match[1], 10);
    const found = CAMPAIGNS.find(c => c.id === id);
    if (found) return { id, label: found.label };
  }
  return ANY_GROUP;
}

function classifyEntry(message) {
  const first = message.split(' ')[0];
  if (GUARD_COLOR_MAP[first]) return { type: 'guard', guardKey: GUARD_COLOR_MAP[first].key };
  if (first === 'Party' || first === 'Stash' || first === 'Stonebound' || CITY_NAMES_SET.has(first)) return { type: 'party' };
  return { type: 'system' };
}

function CollapsibleSection({ title, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="more-section">
      <button className="more-section-header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={`more-section-chevron${open ? ' open' : ''}`}>▾</span>
        <span className="more-section-title">{title}</span>
        {count !== undefined && <span className="more-section-count">{count}</span>}
      </button>
      {open && children}
    </div>
  );
}

function EncounterCard({ encounter, completed, onToggle }) {
  const [detailOpen, setDetailOpen] = useState(false);

  function closeDetail() {
    setDetailOpen(false);
  }

  function handleDetailBackdropKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDetail();
    }
  }

  function handleCardKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setDetailOpen(true);
    }
  }

  const cardLabel = completed ? 'Completed: ' + encounter.name : encounter.name;

  return (
    <>
      <div
        className={`encounter-card${completed ? ' completed' : ''}`}
        onClick={() => setDetailOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={handleCardKeyDown}
        aria-label={cardLabel}
      >
        <div className="encounter-card-row">
          <span className={`encounter-check${completed ? ' done' : ''}`} aria-hidden="true">
            {completed ? '✓' : ''}
          </span>
          <div className="encounter-card-body">
            <span className="encounter-name">{encounter.name}</span>
            <span className="encounter-meta">{encounter.campaignReq}</span>
          </div>
        </div>
      </div>

      {detailOpen && (
        <div
          className="encounter-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={encounter.name}
          onClick={closeDetail}
          onKeyDown={handleDetailBackdropKeyDown}
        >
          <div className="encounter-detail" onClick={e => e.stopPropagation()}>
            <div className="encounter-detail-handle" />
            <div className="encounter-detail-header">
              <span className="encounter-detail-title">{encounter.name}</span>
              <button
                className={`encounter-toggle-btn${completed ? ' done' : ''}`}
                onClick={e => { e.stopPropagation(); onToggle(encounter.id); }}
                aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
                ref={el => el && detailOpen && el.focus()}
              >
                {completed ? 'Completed ✓' : 'Mark Complete'}
              </button>
            </div>

            <div className="encounter-detail-body">
              <div className="encounter-detail-section">
                <div className="encounter-detail-sect-label">REQUIREMENTS</div>
                <div className="encounter-detail-line"><strong>Campaign:</strong> {encounter.campaignReq}</div>
                <div className="encounter-detail-line"><strong>Guards:</strong> {encounter.guardReq}</div>
                {encounter.specialReq && (
                  <div className="encounter-detail-line"><strong>Special:</strong> {encounter.specialReq}</div>
                )}
                {encounter.unlockCondition && (
                  <div className="encounter-detail-line"><strong>Unlock:</strong> {encounter.unlockCondition}</div>
                )}
              </div>

              <div className="encounter-detail-section">
                <div className="encounter-detail-sect-label">ENEMY SETUP</div>
                <div className="encounter-detail-text">{encounter.enemies}</div>
              </div>

              <div className="encounter-detail-section">
                <div className="encounter-detail-sect-label">REWARD</div>
                <div className="encounter-detail-text">{encounter.reward}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function encountersMatchFilter(fight, campaignId) {
  if (campaignId === 0) return true;
  const group = campaignGroupFromReq(fight.campaignReq);
  return group.id === 0 || group.id === campaignId;
}

export function MoreTab({ log, campaign, completedEncounters, toggleEncounterComplete }) {
  const { campaignId } = campaign;
  const [encounterTab, setEncounterTab] = useState('training');
  const [localCampaign, setLocalCampaign] = useState(0);

  const activeFilter = localCampaign > 0 ? localCampaign : campaignId;

  return (
    <div>
      <CollapsibleSection title="Encounters" defaultOpen={true}>
        <div className="encounter-pills" role="group" aria-label="Encounter type">
          <button
            className={`encounter-pill${encounterTab === 'training' ? ' active' : ''}`}
            onClick={() => setEncounterTab('training')}
            aria-pressed={encounterTab === 'training'}
          >
            Training Yard
          </button>
          <button
            className={`encounter-pill${encounterTab === 'spirit' ? ' active' : ''}`}
            onClick={() => setEncounterTab('spirit')}
            aria-pressed={encounterTab === 'spirit'}
          >
            Spirit Bosses
          </button>
        </div>

        <div className="encounter-filter-pills" role="group" aria-label="Campaign filter">
          <button
            className={`encounter-pill encounter-pill--sm${activeFilter === 0 ? ' active' : ''}`}
            onClick={() => setLocalCampaign(0)}
            aria-pressed={activeFilter === 0}
          >
            All
          </button>
          {CAMPAIGNS.map(c => (
            <button
              key={c.id}
              className={`encounter-pill encounter-pill--sm${activeFilter === c.id ? ' active' : ''}`}
              onClick={() => setLocalCampaign(c.id)}
              aria-pressed={activeFilter === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="encounter-list">
          {(encounterTab === 'training' ? TRAINING_YARD_FIGHTS : SPIRIT_BOSSES).reduce((groups, fight) => {
            if (!encountersMatchFilter(fight, activeFilter)) return groups;
            const group = campaignGroupFromReq(fight.campaignReq);
            const last = groups[groups.length - 1];
            if (!last || last.group.id !== group.id) {
              groups.push({ group, fights: [fight] });
            } else {
              last.fights.push(fight);
            }
            return groups;
          }, []).map(({ group, fights }) => (
            <div key={group.id} className="encounter-group">
              <div className="encounter-group-header">{group.label}</div>
              {fights.map(fight => (
                <EncounterCard
                  key={fight.id}
                  encounter={fight}
                  completed={completedEncounters.includes(fight.id)}
                  onToggle={toggleEncounterComplete}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="encounter-defeat-note">
          <div className="encounter-defeat-note-label">IF DEFEATED</div>
          <div className="encounter-detail-text">
            {encounterTab === 'spirit'
              ? "Reset all Guards' HP back to maximum. No rewards are gained unless all requirements are met."
              : "Reset the participating Guard(s)' HP back to 20. No Lux Essence or enemy drops are obtained on defeat; no rewards are gained unless all requirements are met."}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Log" count={log.length} defaultOpen={false}>
        {log.length === 0 ? (
          <div className="log-empty">
            <div className="log-empty-title">No events yet</div>
            <div className="log-empty-sub">Actions will appear here as you play</div>
          </div>
        ) : (
          <div className="log-list">
            {log.map(entry => {
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
                  <span className="log-text">
                    {colorizeLogMessage(entry.message)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
