import { useState, useEffect } from 'react';
import { TRAINING_YARD_FIGHTS, SPIRIT_BOSSES, groupEncounters } from '../data/encounters';
import { CITIES, GUARD_COLOR_MAP } from '../data/constants';
import { colorizeLogMessage } from '../utils/logUtils';
import { useDialogA11y } from '../hooks/useDialogA11y';

const CITY_NAMES_SET = new Set(CITIES.map(c => c.name));

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

function EncounterCard({ encounter, completed, onOpen }) {
  function handleCardKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(encounter);
    }
  }

  const cardLabel = completed ? 'Completed: ' + encounter.name : encounter.name;

  return (
    <div
      className={`encounter-card${completed ? ' completed' : ''}`}
      onClick={() => onOpen(encounter)}
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
  );
}

// Detail dialog lives at the tab level (driven by MoreTab's openEnc state) so it
// can be opened either by tapping a card or by a deep-link from global search,
// independent of which sub-tab or campaign filter is showing the list.
function EncounterDetailDialog({ encounter, completed, onToggle, onClose }) {
  const dialogRef = useDialogA11y(true, onClose);

  return (
    <div className="encounter-detail-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="encounter-detail"
        role="dialog"
        aria-modal="true"
        aria-label={encounter.name}
        onClick={e => e.stopPropagation()}
      >
        <div className="encounter-detail-handle" />
        <div className="encounter-detail-header">
          <span className="encounter-detail-title">{encounter.name}</span>
          <button
            className={`encounter-toggle-btn${completed ? ' done' : ''}`}
            onClick={e => { e.stopPropagation(); onToggle(encounter.id); }}
            aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
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
  );
}

export function MoreTab({ log, campaign, completedEncounters, toggleEncounterComplete, encounterTarget, onTargetApplied }) {
  const { campaignId } = campaign;
  const [encounterTab, setEncounterTab] = useState('training');
  const [openEnc, setOpenEnc] = useState(null);
  // Starts null (not the incoming nonce) so a target present on the first mount
  // — the common case, since this tab is unmounted until the deep-link switches
  // to it — still counts as "changed" and opens the encounter.
  const [targetNonce, setTargetNonce] = useState(null);

  const activeFilter = campaignId;

  // Deep-link from global search: switch to the right sub-tab and open the
  // encounter's detail. Adjust-state-on-prop-change during render, keyed on the
  // target's nonce so repeat links re-fire even for the same encounter.
  if (encounterTarget && encounterTarget.nonce !== targetNonce) {
    setTargetNonce(encounterTarget.nonce);
    const pool = encounterTarget.kind === 'spirit' ? SPIRIT_BOSSES : TRAINING_YARD_FIGHTS;
    const match = pool.find(f => f.id === encounterTarget.id);
    if (match) {
      setEncounterTab(encounterTarget.kind === 'spirit' ? 'spirit' : 'training');
      setOpenEnc(match);
    }
  }

  // The target is a one-shot — tell the parent to clear it once consumed so it
  // can't re-open on a later manual return to this tab.
  useEffect(() => {
    if (encounterTarget) onTargetApplied?.();
  }, [encounterTarget, onTargetApplied]);

  return (
    <div>
      <CollapsibleSection title="Encounters" defaultOpen={true}>
        <div className="step-selector mb-2" role="group" aria-label="Encounter type">
          <button
            className={`step-btn${encounterTab === 'training' ? ' active' : ''}`}
            onClick={() => setEncounterTab('training')}
            aria-pressed={encounterTab === 'training'}
          >
            Training Yard
          </button>
          <button
            className={`step-btn${encounterTab === 'spirit' ? ' active' : ''}`}
            onClick={() => setEncounterTab('spirit')}
            aria-pressed={encounterTab === 'spirit'}
          >
            Spirit Bosses
          </button>
        </div>

        <div className="encounter-retry-note">
          <div className="encounter-detail-text">
            {encounterTab === 'spirit'
              ? 'Each spirit boss can be completed only once, but can be retried as many times in case of defeat.'
              : 'Each training yard fight can be completed only once, but can be retried as many times in case of defeat.'}
          </div>
        </div>

        <div className="encounter-defeat-note">
          <div className="encounter-defeat-note-label">IF DEFEATED</div>
          <div className="encounter-detail-text">
            {encounterTab === 'spirit'
              ? "Reset all Guards' HP back to maximum. No rewards are gained unless all requirements are met."
              : "Reset the participating Guard(s)' HP back to 20. No Lux Essence or enemy drops are obtained on defeat; no rewards are gained unless all requirements are met."}
          </div>
        </div>

        <div className="encounter-list">
          {groupEncounters(
            encounterTab === 'training' ? TRAINING_YARD_FIGHTS : SPIRIT_BOSSES,
            activeFilter
          ).map(({ group, fights }) => (
            <div key={`${encounterTab}-${group.id}`} className="encounter-group">
              <div className="encounter-group-header">{group.label}</div>
              {fights.map(fight => (
                <EncounterCard
                  key={fight.id}
                  encounter={fight}
                  completed={completedEncounters.includes(fight.id)}
                  onOpen={setOpenEnc}
                />
              ))}
            </div>
          ))}
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

      {openEnc && (
        <EncounterDetailDialog
          encounter={openEnc}
          completed={completedEncounters.includes(openEnc.id)}
          onToggle={toggleEncounterComplete}
          onClose={() => setOpenEnc(null)}
        />
      )}
    </div>
  );
}
