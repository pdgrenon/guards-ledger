// src/data/encounterNames.js
//
// Encounter id → display name, for every Training Yard fight and Spirit Boss.
//
// Committed as a literal rather than derived from encounters.js at module load,
// for the same reason as prereqUpgrades.js. `encounterLabel` in gameReducers.js
// needs a human name for one log string ("<name> completed"), and gameReducers
// is imported by useGameState — the eager path. That single lookup pulled all
// of encounters.js (≈32 kB raw / 4.9 kB gzip of freeform enemy setups, rewards
// and unlock conditions) into the entry chunk, even though its real consumers,
// MoreTab and GlobalSearch, are both lazy. Extracted, encounters.js loads with
// them instead.
//
// `encounters.test.js` asserts this map has exactly one entry per encounter id
// with the matching name — no extras, no omissions — so an added or renamed
// encounter fails loudly instead of silently logging a raw id. Keep the two
// sections in the same order as TRAINING_YARD_FIGHTS / SPIRIT_BOSSES so the
// diff against that file stays readable.
export const ENCOUNTER_NAMES = {
  "for-the-king": "For the King!",
  "the-guilds-of-mir": "The Guilds of Mir",
  "going-all-in": "Going All-In",
  "overflowing": "Overflowing",
  "formation-breaker": "Formation Breaker",
  "taste-of-your-own-medicine": "Taste of Your Own Medicine",
  "going-green": "Going Green",
  "sixth-sense": "Sixth Sense",
  "ice-cold": "Ice Cold",
  "watch-your-step": "Watch Your Step!",
  "combat-tactics": "Combat Tactics",
  "be-flexible": "Be Flexible!",
  "sword-of-flame-campaign-1": "Sword of Flame",
  "iron-sharpens-iron": "Iron Sharpens Iron",
  "the-tactician": "The Tactician",
  "deja-vu": "Déjà Vu",
  "healer-of-isofar": "Healer of Isofar",
  "glass-cannon": "Glass Cannon",
  "power-multiplied": "Power Multiplied",
  "save-your-energy": "Save Your Energy",
  "barrier-breaker": "Barrier Breaker",
  "true-potential": "True Potential",
  "play-it-again": "Play It Again",
  "sword-of-flame-campaign-2": "Sword of Flame",
  "sound-waves": "Sound Waves",
  "more-left-in-the-tank": "More Left in the Tank",
  "renew-your-mind": "Renew Your Mind",
  "from-pain-to-purpose": "From Pain to Purpose",
  "daughter-of-alina": "Daughter of Alina",
  "light-in-the-darkness": "Light in the Darkness",
  "the-greatest-of-these": "The Greatest of These",
  "do-it-again": "Do It Again",
  "snap-pop": "Snap, ……., Pop",
  "snowball-fight": "Snowball Fight!",
  "c1-1": "C1:1",
  "c1-2": "C1:2",
  "c1-3": "C1:3",
  "c1-4": "C1:4",
  "c2-1": "C2:1",
  "c2-2": "C2:2",
  "c2-3": "C2:3",
  "c2-4": "C2:4",
  "c3-1": "C3:1",
  "c3-2": "C3:2",
  "c3-3": "C3:3",
  "c3-4": "C3:4",
  "c4-1": "C4:1",
  "c4-2": "C4:2",
  "c4-3": "C4:3",
  "c5-end-game": "End Game",
};
