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
        return (
          <div key={city.id} className="city-card">
            {/* Header: name + read-only prestige pips */}
            <div className="flex items-center justify-between mb-2">
              <div className="city-name">{city.name}</div>
              <div className="prestige-pips">
                {Array(3).fill(0).map((_, pi) => (
                  <div key={pi} className={`prestige-pip${pi < prestige ? ' filled' : ''}`} />
                ))}
              </div>
            </div>

            {/* Quest rows */}
            {QUESTS.map(({ field, label }) => (
              <div key={field} className="quest-row" onClick={() => toggleCityQuest(idx, field)}>
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
