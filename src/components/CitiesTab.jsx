import { cityPrestige } from '../hooks/gameReducers';
import { Checkmark } from './Checkmark';

// Cities use a dedicated stone-ochre accent — distinct from all 8 guard colors.
const CITY_COLOR = 'var(--c-city)';

const QUESTS = [
  { field: 'puzzleQuestDone', label: 'Puzzle quest' },
  { field: 'bounty1Done',     label: 'Bounty 1'     },
  { field: 'bounty2Done',     label: 'Bounty 2'     },
];

export function CitiesTab({ cities, toggleCityQuest }) {
  return (
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
            <div className="prestige-pips" role="status" aria-label={`Prestige: ${prestige} of 3`}>
              {Array(3).fill(0).map((_, pi) => (
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
  );
}
