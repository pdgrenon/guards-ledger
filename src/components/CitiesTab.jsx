import { cityPrestige } from '../hooks/gameReducers';
import { Checkmark } from './Checkmark';
import { MAX_PRESTIGE } from '../data/constants';

// Cities use a dedicated stone-ochre accent — distinct from all 8 guard colors.
const CITY_COLOR = 'var(--c-city)';

const QUESTS = [
  { field: 'puzzleQuestDone', label: 'Puzzle quest' },
  { field: 'bounty1Done',     label: 'Bounty 1'     },
  { field: 'bounty2Done',     label: 'Bounty 2'     },
];

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

export function CitiesTab({ cities, toggleCityQuest, locations, onAddDynamic, onUpdateDynamic, onRemoveDynamic }) {
  return (
    <>
      <div className="cities-grid">
        {cities.map((city, idx) => {
          const prestige = cityPrestige(city);

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

              {/* Quest rows — entire row tinted green when done */}
              {QUESTS.map(({ field, label }) => (
                <div
                  key={field}
                  className={`quest-row${city[field] ? ' done' : ''}`}
                  onClick={() => toggleCityQuest(idx, field)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCityQuest(idx, field); } }}
                  role="checkbox"
                  aria-checked={city[field]}
                  tabIndex={0}
                >
                  <div className={`quest-box${city[field] ? ' done' : ''}`}>
                    {city[field] && <Checkmark />}
                  </div>
                  <span className={`quest-lbl${city[field] ? ' done' : ''}`}>{label}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Bounties list — global across all cities */}
      <div className="card mb-3 stash-card" style={{ marginTop: 16 }}>
        <div className="card-title mb-3">Bounties</div>
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
    </>
  );
}
