// All cities share the app accent color — consistent, restrained, professional.
// Color identifies guards (characters); cities are locations and don't need personalities.
const CITY_COLOR = 'var(--c-accent)';
const CITY_COLORS = {
  Mir: CITY_COLOR, Razdor: CITY_COLOR, Ryba: CITY_COLOR,
  Silny: CITY_COLOR, Strofa: CITY_COLOR, Vouno: CITY_COLOR,
};

function Checkmark() {
  return (
    <svg className="quest-check" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5">
      <polyline points="1.5,5 4,7.5 8.5,2.5" />
    </svg>
  );
}

const QUESTS = [
  { field: 'puzzleQuestDone', label: 'Puzzle quest' },
  { field: 'bounty1Done',     label: 'Bounty 1'     },
  { field: 'bounty2Done',     label: 'Bounty 2'     },
];

export function CitiesTab({ cities, toggleCityQuest }) {
  return (
    <div className="cities-grid">
      {cities.map((city, idx) => {
        const prestige = [city.puzzleQuestDone, city.bounty1Done, city.bounty2Done].filter(Boolean).length;
        const cityColor = CITY_COLORS[city.name] ?? 'var(--c-accent)';

        return (
          <div
            key={city.id}
            className="city-card"
            style={{ '--city-color': cityColor }}
          >
            {/* City name — colored via --city-color */}
            <div className="city-name">{city.name}</div>

            {/* Prestige pips — below name, colored, larger */}
            <div className="prestige-pips">
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
