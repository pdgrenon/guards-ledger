// Bounty Quest reference data — transcribed from the physical companion book
// (AVE-359). 48 bounties total: 6 Inns × 4 Campaigns × 2 bounties each.
//
// This is STATIC reference data, kept separate from per-bounty completion state
// (which lives in `campaign.completedBounties` and syncs with the campaign
// section) — the same split used by Training Yard fights / Spirit Bosses in
// `encounters.js`.
//
// Each bounty is Inn-scoped and Campaign-scoped. Bounties are NOT cumulative
// across campaigns: a campaign's two bounties for a given Inn are unique to that
// campaign and can only be completed during it. The Cities tab therefore shows,
// per city, only the two bounties matching the active campaign.
//
// `targets`, `conditions`, and `rewards` are stored as the verbatim transcribed
// strings (freeform), mirroring the `enemies` / `reward` fields on encounters.

import { CITIES } from './constants';

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Inn → city name: the city is the prefix before the colon in the Inn label,
// matching the six CITIES names (Mir, Razdor, Ryba, Silny, Strofa, Vouno).
function cityFromInn(inn) {
  return inn.split(':')[0].trim();
}

// Source rows, grouped by Inn then Campaign for easy cross-checking against the
// companion book. `id` and `city` are derived below so they can't drift.
const SOURCE = [
  // ─── Mir: The Clayhorn ──────────────────────────────────────────────────────
  {
    inn: 'Mir: The Clayhorn', campaign: 1, name: 'A Feud between Guilds',
    location: 'Node 76',
    targets: '★★★ Broken Plough Soldier (I); ★★★ Golden Scythe Soldier (II)',
    conditions: 'All enemies have +2 ATK, and +5 HP above base stats.',
    rewards: '2x Purifying Seed; 2x Ruinous Seed',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 1, name: 'Stone Idols',
    location: 'Node 14',
    targets: '★★★★ Stone Guardian (I) (II)',
    conditions: 'All enemies have +2 ATK, +1 DEF, and +6 HP above base stats.',
    rewards: '1x Barrier Tonic (Item); 1x Ancient Roots (Speaking Stone)',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 2, name: 'Lurking in the Shadows',
    location: 'Node 30',
    targets: '★★★★ Dusk Stalker (I) (II)',
    conditions: 'All enemies have +2 ATK above base stats.',
    rewards: '20 Sil; 2x Clayhorn Steak (Item)',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 2, name: 'Order of the Poison Hearts',
    location: 'Node 17',
    targets: "★★★ Tumani Hunter (I); ★★★ Seer's Assassin (II); ★★★ Tumani Mender (III); ★★★ Brigand Chief (IV)",
    conditions: 'All enemies have +1 DEF, and +10 HP above base stats.',
    rewards: '1x Bottled Courage (Item); 1x Ancient Roots (Speaking Stone)',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 3, name: 'Great Beasts',
    location: 'Node 25',
    targets: '★★★ Clayhorn (I); ★★★ Mountain Bear (II); ★★★ Drakondor (III)',
    conditions: 'All enemies have +2 ATK, and +10 HP above base stats.',
    rewards: '2x Ruinous Seed (Item); 2x Coastal Bluecaps (Item)',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 3, name: 'Greater Beasts',
    location: 'Node 2',
    targets: '★★★★ Tenebris Clayhorn (I); ★★★★ Tenebris Colossus (II); ★★★★ Tenebris Drakondor (III)',
    conditions: 'All enemies have +3 ATK, and +10 HP above base stats.',
    rewards: '2x Aged Drink (Item); 1x Ancient Roots (Speaking Stone)',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 4, name: "Mine's Deep",
    location: 'Node 88',
    targets: '★★ Mountain Bear (I); ★★ Cave Stalker (III); ★★ Armored Zhuk (IV)',
    conditions: 'All enemies have +1 ATK, +1 DEF, and +10 HP above base stats.',
    rewards: '30 Sil; 1x Aquamarine (Speaking Stone)',
  },
  {
    inn: 'Mir: The Clayhorn', campaign: 4, name: 'Ancient Stones',
    location: 'Node 13',
    targets: '★★★★★ Stone Guardian (I); ★★★★ Tumani Hunter (III)',
    conditions: 'All enemies have +2 ATK, and +10 HP above base stats.',
    rewards: '1x Bottled Courage (Item); 1x Ancient Roots (Speaking Stone)',
  },

  // ─── Razdor: The Lookout Inn ─────────────────────────────────────────────────
  {
    inn: 'Razdor: The Lookout Inn', campaign: 1, name: 'Two Arms and a Hand',
    location: 'Razdor: Guild District',
    targets: '★★★★ Seer Zealot (I) (II); ★★★ Hand of Uvidet (III)',
    conditions: 'All enemies have +1 ATK, +1 DEF above base stats.',
    rewards: '20 Sil; 1x Ancient Roots (Speaking Stone)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 1, name: 'Widow Maker',
    location: 'Node 88',
    targets: '★★★★ Cave Stalker (I)',
    conditions: 'All enemies have +2 ATK, +1 DEF, and +10 HP above base stats.',
    rewards: '2x Midnight Hydrangea (Item); 1x Garnet (Speaking Stone)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 2, name: 'Expecting You',
    location: 'Razdor: Slums',
    targets: '★★ Seer Zealot (I) (II); ★★ Hand of Uvidet (III); ★★ Eye of Uvidet (IV)',
    conditions: 'This battle is an Ambush, and all enemies have +1 ATK above base stats.',
    rewards: '1x Adamant (Speaking Stone)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 2, name: 'Barinov no more',
    location: 'Node 14',
    targets: '★★★★ Tenebris Hunter (I)',
    conditions: 'Tenebris Hunter has +2 ATK, +1 DEF, and +14 HP over base stats.',
    rewards: '2x Midnight Hydrangea (Item); 1x Aquamarine (Speaking Stone)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 3, name: "A Temple's Treasures",
    location: 'Skryvat Temple',
    targets: '★★ Waste Prowler (I); ★★ Tenebris Hunter (III)',
    conditions: 'All enemies have +1 ATK, and +12 HP above base stats.',
    rewards: '2x Midnight Hydrangea (Item); 1x Garnet (Speaking Stone)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 3, name: 'Beast from the depths',
    location: 'Node 82',
    targets: '★★★★ Volkrok (I)',
    conditions: 'All enemies have +2 ATK, +1 DEF, and +10 HP above base stats.',
    rewards: '2x Amethyst Trout (Item); 1x Aquamarine (Speaking Stone)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 4, name: "It Just Won't Die!",
    location: 'Node 63',
    targets: '★★ Tenebris Colossus (I)',
    conditions: 'All enemies have +2 ATK, and +12 HP above base stats.',
    rewards: '1x Bear Tunic (Armor); 2x Coastal Bluecaps (Item)',
  },
  {
    inn: 'Razdor: The Lookout Inn', campaign: 4, name: 'Tenebris Elite Guard',
    location: 'Node 62',
    targets: '★★★★ Tenebris Guard (I) (II)',
    conditions: 'All enemies have +2 ATK, +1 AP, and +6 HP above base stats.',
    rewards: '2x Purifying Seed; 1x Adamant (Speaking Stone)',
  },

  // ─── Ryba: Tradewinds ────────────────────────────────────────────────────────
  {
    inn: 'Ryba: Tradewinds', campaign: 1, name: 'Falmundian Detachment',
    location: 'Node 103',
    targets: '★★★ Stonehunter (I); ★★★ Corrupted Soldier (II)',
    conditions: 'All enemies have +1 ATK, and +10 HP above base stats.',
    rewards: '20 Sil; 1x Garnet (Speaking Stone)',
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 1, name: 'Breaking through the ice',
    location: 'Frozen Wastes: Ice Fields',
    targets: '★★★★ Glacial Worm (I)',
    conditions: 'All enemies have +2 ATK, and +2 DEF above base stats.',
    rewards: '2x Coastal Bluecaps (Item); 2x Aged Drink (Item); 1x Aventurine (Speaking Stone)',
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 2, name: 'The Vipers',
    location: 'Ryba: Warehouse District',
    targets: "★★★ Seer Zealot (I); ★★★ Seer's Assassin (III)",
    conditions: 'All enemies have +1 AP, and +10 HP above base stats.',
    rewards: '2x Purifying Seed (Item); 1x Garnet (Speaking Stone)',
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 2, name: 'Discord on the beach',
    location: 'Node 1',
    targets: '★★★★ Corrupted Lobster (I)',
    conditions: 'All enemies have +10 HP above base stats.',
    rewards: '1x Red Scale Armor (Armor)',
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 3, name: "Brigand's Hideout",
    location: 'Node 28',
    targets: '★★ Brigand Marauder (I) (II); ★★ Brigand Archer (III); ★★★ Corrupted Brigand (IV)',
    conditions: 'All enemies have +2 ATK, and +10 HP above base stats.',
    rewards: "40 Sil; 1x Hunter's Spear (Weapon)",
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 3, name: 'Raiding Party',
    location: 'Node 41',
    targets: '★★★★ Tumani Raider (I) (II); ★★★★ Tumani Hunter (III) (IV)',
    conditions: 'All enemies have +1 ATK, and +1 AP above base stats.',
    rewards: '2x Clayhorn Steak (Item); 1x Ancient Roots (Speaking Stone)',
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 4, name: 'Dug Too Deep',
    location: 'Node 24',
    targets: '★★★ Armored Zhuk (I); ★★★ Cave Stalker (III)',
    conditions: 'All enemies have +2 ATK, and +1 AP above base stats.',
    rewards: '2x Coastal Bluecaps (Item); 1x Adamant (Speaking Stone)',
  },
  {
    inn: 'Ryba: Tradewinds', campaign: 4, name: 'Atop the great mountain',
    location: 'Frozen Wastes: Mount Nebesa',
    targets: '★★★★ Tenebris Drakondor (I)',
    conditions: 'All enemies have +2 ATK, and +2 DEF above base stats.',
    rewards: '50 Sil; 1x Ancient Roots (Speaking Stone)',
  },

  // ─── Silny: Raven's Beak Inn ─────────────────────────────────────────────────
  {
    inn: "Silny: Raven's Beak Inn", campaign: 1, name: 'Into the Wolves Den',
    location: 'Node 1',
    targets: '★★★ Timber Wolf (I) (II); ★★★★ Dusk Stalker (III) (IV)',
    conditions: 'All enemies have +2 ATK above base stats.',
    rewards: '25 Sil; 1x Jade (Speaking Stone)',
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 1, name: "The Militia's Request",
    location: 'Node 98',
    targets: '★★★ Brigand Marauder (I) (II); ★★★ Corrupted Brigand (III); ★★★ Brigand Chief (IV)',
    conditions: 'All enemies have +2 ATK, and +1 DEF above base stats.',
    rewards: "1x Raven's Beak Flask (Item); 1x Aquamarine (Speaking Stone)",
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 2, name: "A Farmer's Dilemma",
    location: 'Node 77',
    targets: '★★ Tenebris Colossus (I); ★★ Tenebris Clayhorn (II); ★★ Tenebris Strider (III)',
    conditions: 'All enemies have +3 ATK above base stats.',
    rewards: '30 Sil; 2x Mir Bread (Item)',
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 2, name: 'Trouble at the Docks',
    location: 'Node 21',
    targets: '★★★★ Corrupted Brigand (I); ★★★★ Tumani Raider (III) (IV)',
    conditions: 'All enemies have +2 ATK, and +1 DEF above base stats.',
    rewards: '2x Aged Drink (Item); 1x Adamant (Speaking Stone)',
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 3, name: 'Enemy Reinforcements',
    location: 'Node 28',
    targets: '★★ Stonehunter (I); ★★ Falmund Scout (III); ★★ Brigand Archer (IV)',
    conditions: 'This battle is an Ambush, and all enemies have +1 ATK above base stats.',
    rewards: '25 Sil; 1x Wolf Tooth Ring (Accessory)',
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 3, name: 'Shadow over the Forest',
    location: 'Node 41',
    targets: '★★★★ Seer Zealot (I) (II); ★★★★ Drakondor (III)',
    conditions: 'All enemies have +2 ATK, and +1 DEF above base stats.',
    rewards: '2x Purifying Seed (Item); 1x Adamant (Speaking Stone)',
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 4, name: 'Old Foes',
    location: 'Silny: Rynok Square',
    targets: "★★★ Kingsguard (I); ★★★ Seer's Assassin (III)",
    conditions: 'All enemies have +2 ATK above base stats.',
    rewards: '1x Leather Gauntlets (Accessory); 2x Aged Drink (Item)',
  },
  {
    inn: "Silny: Raven's Beak Inn", campaign: 4, name: 'Crossing Borders',
    location: 'Node 37',
    targets: '★★★★ Corrupted Fylakes (I); ★★★★ Disruptor (III)',
    conditions: 'All enemies have +1 ATK, and +1 DEF above base stats.',
    rewards: '2x Midnight Hydrangea (Item); 1x Garnet (Speaking Stone)',
  },

  // ─── Strofa: The Volkrok ─────────────────────────────────────────────────────
  {
    inn: 'Strofa: The Volkrok', campaign: 1, name: 'Beasts of the Field',
    location: 'Node 44',
    targets: '★★ Clayhorn (I); ★★★ Plains Strider (III)',
    conditions: 'All enemies have +2 ATK, and +10 HP above base stats.',
    rewards: '2x Bottled Courage (Item); 2x Purifying Seed (Item)',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 1, name: 'Something In The Water',
    location: 'Node 89',
    targets: '★★★★ Volkrok (I); ★★★★ Flesh Eating Fish (III); ★★★★ Flesh Eating Fish (IV)',
    conditions: 'This battle is an Ambush, and all enemies have +1 ATK above base stats.',
    rewards: '30 Sil; 2x Falmundian Rosehips (Item); 1x Adamant (Speaking Stone)',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 2, name: 'Got My Eye on You',
    location: 'Node 26',
    targets: '★★ Seer Acolyte (I); ★★★ Eye of Uvidet (III)',
    conditions: 'This battle is an Ambush, and all enemies have +1 DEF above base stats.',
    rewards: '2x Ruinous Seed; 2x Aged Drink',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 2, name: 'Corrupted Swarm',
    location: 'Node 2',
    targets: '★★★★ Corrupted Soldier (I) (II); ★★★★ Tenebris Strider (III); ★★★★ Tenebris Hunter (IV)',
    conditions: 'All enemies have +3 ATK above base stats.',
    rewards: '70 Sil; 1x Ancient Roots (Speaking Stone)',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 3, name: 'I Used to Be an Adventurer Like You',
    location: 'Node 31',
    targets: '★★★ Falmund Scout (I); ★★★ Brigand Archer (III) (IV)',
    conditions: 'All enemies have +2 ATK, and +2 AP above base stats.',
    rewards: '30 Sil; 1x Silver Bow (Weapon)',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 3, name: 'The Executioner',
    location: 'Strofa: Tower of Uvidet',
    targets: '★★★★ Seer Acolyte (I) (II); ★★★★★ Hand of Uvidet (IV)',
    conditions: 'Hand of Uvidet has +2 ATK, +2 DEF, and +20 HP above base stats. Before battle begins add 5 Break chips to both bags.',
    rewards: '1x Barrier Tonic (Item); 1x Adamant (Speaking Stone)',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 4, name: 'Blindsided',
    location: 'Node 73',
    targets: '★★ Metal Eater (I); ★★★ Corrupted Fylakes (III)',
    conditions: 'This battle is an Ambush, and all enemies have +1 DEF above base stats.',
    rewards: '2x Ruinous Seed (Item)',
  },
  {
    inn: 'Strofa: The Volkrok', campaign: 4, name: 'Twin Horns',
    location: 'Node 90',
    targets: '★★★★ Tenebris Clayhorn (I) (II)',
    conditions: 'All enemies have +3 ATK, and +2 AP above base stats.',
    rewards: '2x Midnight Hydrangea (Item); 1x Garnet (Speaking Stone)',
  },

  // ─── Vouno: Vrachos Inn ──────────────────────────────────────────────────────
  {
    inn: 'Vouno: Vrachos Inn', campaign: 1, name: 'Grin and Bear It',
    location: 'Node 28',
    targets: '★★★ Disruptor (I); ★★★ Mountain Bear (III)',
    conditions: 'All enemies have +2 ATK above base stats.',
    rewards: '1x Bear Tunic (Armor); 1x Tent (Item)',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 1, name: 'Escaped Experiment',
    location: 'Node 6',
    targets: '★★★★ Tenebris Hunter (I)',
    conditions: 'All enemies have +3 ATK, +3 DEF, and +24 HP above base stats.',
    rewards: '50 Sil; 1x Natural Remedies Vol. 3 (Item)',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 2, name: 'Creatures of the Forest',
    location: 'Node 45',
    targets: '★★ Timber Wolf (I); ★★ Mountain Bear (II); ★★★ Drakondor (III)',
    conditions: 'All enemies have +1 ATK, and +1 DEF above base stats.',
    rewards: '3x Coastal Bluecaps',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 2, name: 'Unbreakable',
    location: 'Node 2',
    targets: '★★★★ Tenebris Guard (I) (II)',
    conditions: 'All enemies have +2 ATK, +2 DEF, and +2 AP above base stats.',
    rewards: '2x Barrier Tonic; 1x Garnet (Speaking Stone)',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 3, name: 'Skilled Thieves',
    location: 'Node 64',
    targets: '★★★ Brigand Marauder (I) (II); ★★★ Corrupted Brigand (III)',
    conditions: 'All enemies have +2 ATK, and +2 AP above base stats.',
    rewards: '2x Bottled Courage (Item); 1x Garnet (Speaking Stone)',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 3, name: 'Pack of Striders',
    location: 'Node 61',
    targets: '★★★ Plains Strider (I); ★★★★ Tenebris Strider (III)',
    conditions: 'Plains Strider has +2 DEF, and +10 HP over base stats. Tenebris Strider has +1 DEF and +10 HP over base stats.',
    rewards: '2x Smoke Bomb (Item); 1x Obsidian (Speaking Stone)',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 4, name: 'Outsiders',
    location: 'Node 18',
    targets: '★★ Tumani Hunter (I) (II); ★★ Tumani Mender (III); ★★ Waste Nomad (IV)',
    conditions: 'All enemies have +2 AP, and +10 HP above base stats.',
    rewards: '2x Ruinous Seed (Item)',
  },
  {
    inn: 'Vouno: Vrachos Inn', campaign: 4, name: 'King of Beasts',
    location: 'Node 6',
    targets: '★★★★ Waste Prowler (I)',
    conditions: 'All enemies have +3 ATK, and +2 DEF above base stats.',
    rewards: '1x Spicy Stew (Item); 1x Jade (Speaking Stone)',
  },
];

export const BOUNTIES = SOURCE.map(b => {
  const city = cityFromInn(b.inn);
  return { ...b, city, id: `${slug(city)}-c${b.campaign}-${slug(b.name)}` };
});

const CITY_NAMES = new Set(CITIES.map(c => c.name));

/**
 * The bounties available at a city's Inn during a given campaign. Returns the
 * two campaign-scoped bounties for that city (bounties are not cumulative — a
 * campaign only exposes its own two per Inn).
 */
export function bountiesForCity(cityName, campaignId) {
  if (!CITY_NAMES.has(cityName)) return [];
  return BOUNTIES.filter(b => b.city === cityName && b.campaign === campaignId);
}
