/**
 * materials.test.js
 *
 * Data-integrity tests for src/data/materials.js.
 * Ensures every item name appears in exactly one MATERIAL_CATEGORIES group.
 */
import { describe, it, expect } from 'vitest';
import {
  MATERIAL_CATEGORIES,
  ALL_ITEMS_WITH_CATEGORY,
  MATERIAL_SOURCES,
  ENEMIES,
  ITEMS,
} from './materials';
import { BOUNTIES } from './bounties';
import { TRAINING_YARD_FIGHTS, SPIRIT_BOSSES } from './encounters';

describe('MATERIAL_CATEGORIES', () => {
  it('every item name appears at most once across all categories', () => {
    const allItems = MATERIAL_CATEGORIES.flatMap(c => c.items);
    const dups = allItems.filter((item, i) => allItems.indexOf(item) !== i);
    expect(dups).toEqual([]);
  });

  it('ALL_ITEMS_WITH_CATEGORY contains no duplicate item names', () => {
    const names = ALL_ITEMS_WITH_CATEGORY.map(e => e.item);
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dups).toEqual([]);
  });
});

describe('MATERIAL_SOURCES coverage (AVE-548)', () => {
  // MaterialName only makes a name tappable when it has a MATERIAL_SOURCES entry,
  // so a missing entry is indistinguishable from a broken control. Speaking stones,
  // special ingredients and Cooked Fish have no farmable source *by design* — they
  // carry `questReward: true`, which is an answer rather than a placeholder.
  it('every non-gear material has a source entry', () => {
    const missing = MATERIAL_CATEGORIES
      .filter(c => c.id !== 'gear')
      .flatMap(c => c.items)
      .filter(item => !MATERIAL_SOURCES[item]);
    expect(missing).toEqual([]);
  });

  it('marks the quest/event-reward materials as such rather than leaving them blank', () => {
    for (const name of ['Topaz', 'Pearl', 'Orichalcum', 'Rainbow Obsidian', 'Cooked Fish', 'Jade']) {
      expect(MATERIAL_SOURCES[name]?.questReward).toBe(true);
    }
  });

  it('keeps Health Potion equippable in the active item slot', () => {
    expect(ITEMS).toContain('Health Potion');
  });

  it("keeps Raven's Beak Flask — a real quest reward — resolvable as an item", () => {
    expect(ITEMS).toContain("Raven's Beak Flask");
  });
});

describe('Volrok (enemy) vs Volkrok (place) (AVE-548)', () => {
  // These are two different things, not a spelling drift: "Volrok" is the enemy in
  // the bestiary, "Volkrok" is the place the Strofa inn and the Volkrok Tunic are
  // named after. The original ticket proposed renaming the enemy to match the place,
  // which would have corrupted the two entries that were already correct.
  const encounterText = [...TRAINING_YARD_FIGHTS, ...SPIRIT_BOSSES]
    .map(f => String(f.enemies ?? ''))
    .join(' ');

  it('has Volrok as an enemy and no enemy called Volkrok', () => {
    expect(ENEMIES).toContain('Volrok');
    expect(ENEMIES).not.toContain('Volkrok');
  });

  it('never names Volkrok as a combat target', () => {
    const offenders = BOUNTIES
      .filter(b => String(b.targets ?? '').includes('Volkrok'))
      .map(b => b.id);
    expect(offenders).toEqual([]);
    expect(encounterText).not.toContain('Volkrok');
  });

  it('still uses Volkrok for the inn it is named after', () => {
    // The place name is correct and must survive any future de-duplication pass.
    expect(BOUNTIES.some(b => b.inn === 'Strofa: The Volkrok')).toBe(true);
  });
});

describe('bounty targets name real enemies (AVE-548)', () => {
  // The general invariant behind the Volkrok fix: every combat target in a bounty
  // must resolve to a bestiary entry. Targets read "★★★★ Volrok (I)", optionally
  // with several slot markers and several segments separated by semicolons.
  it('resolves every target segment to an ENEMIES entry', () => {
    const unresolved = [];
    for (const b of BOUNTIES) {
      for (const segment of String(b.targets ?? '').split(';')) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const name = trimmed
          .replace(/^★+\s*/, '')
          .replace(/(\s*\([IVX]+\))+$/, '')
          .trim();
        if (!ENEMIES.includes(name)) unresolved.push(`${b.id}: "${name}"`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});
