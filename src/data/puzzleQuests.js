// Puzzle Quest location reference data — transcribed from the physical
// companion book. 24 puzzle quests total: 6 Cities × 4 Campaigns, one each.
//
// This is STATIC reference data (just a location), kept separate from
// per-quest completion state (which lives in `campaign.completedPuzzleQuests`
// and syncs with the campaign section) — the same split used by Bounty Quests
// in `bounties.js`.
//
// Puzzle quests are city-scoped and campaign-scoped, and are NOT cumulative
// across campaigns: a city's puzzle quest location is unique to each campaign.

import { CITIES } from './constants';

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const SOURCE = [
  { city: 'Mir', campaign: 1, location: 'Node 83' },
  { city: 'Mir', campaign: 2, location: 'Frozen Wastes: Reka Glacier' },
  { city: 'Mir', campaign: 3, location: 'Node 45' },
  { city: 'Mir', campaign: 4, location: 'Node 58' },

  { city: 'Razdor', campaign: 1, location: 'Node 98' },
  { city: 'Razdor', campaign: 2, location: 'Razdor: Guild District' },
  { city: 'Razdor', campaign: 3, location: 'Node 27' },
  { city: 'Razdor', campaign: 4, location: 'Node 21' },

  { city: 'Ryba', campaign: 1, location: "Ryba: Seer's Temple" },
  { city: 'Ryba', campaign: 2, location: 'Node 63' },
  { city: 'Ryba', campaign: 3, location: 'Node 41' },
  { city: 'Ryba', campaign: 4, location: 'Ryba: The Narrows' },

  { city: 'Silny', campaign: 1, location: 'Silny: Tower District' },
  { city: 'Silny', campaign: 2, location: 'Node 25' },
  { city: 'Silny', campaign: 3, location: "Silny: Seer's Tower" },
  { city: 'Silny', campaign: 4, location: 'Node 13' },

  { city: 'Strofa', campaign: 1, location: 'Ice Caves: Frozen Lake' },
  { city: 'Strofa', campaign: 2, location: 'Frozen Wastes: Skryvat Temple' },
  { city: 'Strofa', campaign: 3, location: 'Node 26' },
  { city: 'Strofa', campaign: 4, location: 'Node 46' },

  { city: 'Vouno', campaign: 1, location: 'Vouno: Shaft One' },
  { city: 'Vouno', campaign: 2, location: 'Node 8' },
  { city: 'Vouno', campaign: 3, location: 'Node 24' },
  { city: 'Vouno', campaign: 4, location: 'Node 6' },
];

export const PUZZLE_QUESTS = SOURCE.map(q => ({
  ...q,
  id: `${slug(q.city)}-c${q.campaign}-puzzle`,
}));

const CITY_NAMES = new Set(CITIES.map(c => c.name));

/**
 * The puzzle quest location for a city during a given campaign, or null if
 * the city/campaign combination isn't defined.
 */
export function puzzleQuestForCity(cityName, campaignId) {
  if (!CITY_NAMES.has(cityName)) return null;
  return PUZZLE_QUESTS.find(q => q.city === cityName && q.campaign === campaignId) ?? null;
}
