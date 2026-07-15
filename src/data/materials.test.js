/**
 * materials.test.js
 *
 * Data-integrity tests for src/data/materials.js.
 * Ensures every item name appears in exactly one MATERIAL_CATEGORIES group.
 */
import { describe, it, expect } from 'vitest';
import { MATERIAL_CATEGORIES, ALL_ITEMS_WITH_CATEGORY } from './materials';

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
