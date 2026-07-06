import { useState } from 'react';
import { cityPrestige, isBountyCompleted, isPuzzleQuestCompleted } from '../hooks/gameReducers';
import { Checkmark } from './Checkmark';
import { MAX_PRESTIGE } from '../data/constants';
import { bountiesForCity } from '../data/bounties';
import { puzzleQuestForCity } from '../data/puzzleQuests';
import { useDialogA11y } from '../hooks/useDialogA11y';

// Cities use a dedicated stone-ochre accent — distinct from all 8 guard colors.
const CITY_COLOR = 'var(--c-city)';

// Compact bounty row styled after the Training Yard / Spirit Boss encounter
// cards (AVE-359). Reuses the `.encounter-*` primitives so bounties match the
// existing Encounters UI rather than reinventing a card.
function BountyCard({ bounty, completed, onOpen }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(bounty);
    }
  }

  return (
    <div
      className={`encounter-card${completed ? ' completed' : ''}`}
      onClick={() => onOpen(bounty)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={(completed ? 'Completed: ' : '') + bounty.name}
    >
      <div className="encounter-card-row">
        <span className={`encounter-check${completed ? ' done' : ''}`} aria-hidden="true">
          {completed ? '✓' : ''}
        </span>
        <div className="encounter-card-body">
          <span className="encounter-name">{bounty.name}</span>
          <span className="encounter-meta">{bounty.location}</span>
        </div>
      </div>
    </div>
  );
}

// Bottom-sheet detail, mirroring EncounterDetailDialog in MoreTab.jsx. Shows the
// bounty's targets / conditions / rewards (freeform text) and a complete toggle.
function BountyDetailDialog({ bounty, completed, onToggle, onClose }) {
  const dialogRef = useDialogA11y(true, onClose);

  return (
    <div className="encounter-detail-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="encounter-detail"
        role="dialog"
        aria-modal="true"
        aria-label={bounty.name}
        onClick={e => e.stopPropagation()}
      >
        <div className="encounter-detail-handle" />
        <div className="encounter-detail-header">
          <span className="encounter-detail-title">{bounty.name}</span>
          <button
            className={`encounter-toggle-btn${completed ? ' done' : ''}`}
            onClick={e => { e.stopPropagation(); onToggle(bounty.id); }}
            aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {completed ? 'Completed ✓' : 'Mark Complete'}
          </button>
        </div>

        <div className="encounter-detail-body">
          <div className="encounter-detail-section">
            <div className="encounter-detail-sect-label">DETAILS</div>
            <div className="encounter-detail-line"><strong>Inn:</strong> {bounty.inn}</div>
            <div className="encounter-detail-line"><strong>Campaign:</strong> Campaign {bounty.campaign}</div>
            <div className="encounter-detail-line"><strong>Location:</strong> {bounty.location}</div>
          </div>

          <div className="encounter-detail-section">
            <div className="encounter-detail-sect-label">TARGETS</div>
            <div className="encounter-detail-text">{bounty.targets}</div>
          </div>

          <div className="encounter-detail-section">
            <div className="encounter-detail-sect-label">CONDITIONS</div>
            <div className="encounter-detail-text">{bounty.conditions}</div>
          </div>

          <div className="encounter-detail-section">
            <div className="encounter-detail-sect-label">REWARDS</div>
            <div className="encounter-detail-text">{bounty.rewards}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CitiesTab({ cities, campaignId, completedBounties, toggleBountyComplete, completedPuzzleQuests, togglePuzzleQuestComplete }) {
  const [openBounty, setOpenBounty] = useState(null);

  return (
    <>
      <div className="cities-grid">
        {cities.map((city) => {
          // Bounties are Inn-scoped and campaign-scoped, not cumulative: each
          // city shows only the two bounties for the currently active campaign.
          const cityBounties = bountiesForCity(city.name, campaignId);
          // Puzzle quest location is also campaign-scoped, not cumulative.
          const puzzleQuest = puzzleQuestForCity(city.name, campaignId);
          const puzzleDone = puzzleQuest && isPuzzleQuestCompleted(completedPuzzleQuests, puzzleQuest.id);
          // Reputation reflects the active campaign — puzzle quest + completed
          // campaign bounties. Completing a bounty below fills a prestige pip.
          const prestige = cityPrestige(city, campaignId, completedBounties, completedPuzzleQuests);

          return (
            <div
              key={city.id}
              className="city-card"
              style={{ '--city-color': CITY_COLOR }}
            >
              {/* City name — colored via --city-color */}
              <div className="city-name">{city.name}</div>

              {/* Prestige pips — below name, colored, larger */}
              <div className="prestige-pips" role="img" aria-label={`Prestige: ${prestige} of ${MAX_PRESTIGE}`}>
                {Array(MAX_PRESTIGE).fill(0).map((_, pi) => (
                  <div key={pi} className={`prestige-pip${pi < prestige ? ' filled' : ''}`} />
                ))}
              </div>

              {/* Puzzle quest — campaign-scoped, entire row tinted green when done */}
              {puzzleQuest && (
                <div
                  className={`quest-row${puzzleDone ? ' done' : ''}`}
                  onClick={() => togglePuzzleQuestComplete(puzzleQuest.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePuzzleQuestComplete(puzzleQuest.id); } }}
                  role="checkbox"
                  aria-checked={puzzleDone}
                  tabIndex={0}
                >
                  <div className={`quest-box${puzzleDone ? ' done' : ''}`}>
                    {puzzleDone && <Checkmark />}
                  </div>
                  <div className="quest-lbl-group">
                    <span className={`quest-lbl${puzzleDone ? ' done' : ''}`}>Puzzle quest</span>
                    <span className="quest-sub">{puzzleQuest.location}</span>
                  </div>
                </div>
              )}

              {/* Bounty Quests — the two campaign-scoped bounties for this Inn */}
              {cityBounties.length > 0 && (
                <div className="city-bounties">
                  <div className="city-bounties-label">Campaign {campaignId} Bounties</div>
                  {cityBounties.map(bounty => (
                    <BountyCard
                      key={bounty.id}
                      bounty={bounty}
                      completed={isBountyCompleted(completedBounties, bounty.id)}
                      onOpen={setOpenBounty}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openBounty && (
        <BountyDetailDialog
          bounty={openBounty}
          completed={isBountyCompleted(completedBounties, openBounty.id)}
          onToggle={toggleBountyComplete}
          onClose={() => setOpenBounty(null)}
        />
      )}
    </>
  );
}
