// @vitest-environment jsdom
//
// CraftTab had no tests at all. These cover its *behaviour* — filtering,
// search, the guard restriction, the prestige discount, the deep-link seed.
//
// They deliberately do NOT try to pin the render-performance work that landed
// alongside them (`memo` on RecipeCard, `useDeferredValue` on the search term).
// That benefit is scheduling-priority-dependent and jsdom has no layout and no
// concurrent scheduling to observe, so any assertion here would either pass
// vacuously or be a brittle render-count proxy. The measurements live in
// CLAUDE.md instead, and the load-bearing comments live at the two sites. What
// these tests do guard is that the perf change did not alter what the tab
// shows — which is the part that CAN regress silently.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act, screen, fireEvent } from '@testing-library/react';
import { CraftTab } from './CraftTab';
import { RECIPES } from '../data/recipes';
import { createInitialCities, createInitialGuards } from '../data/constants';

const h = React.createElement;

const baseProps = {
  stash: {},
  sil: 0,
  lux: 0,
  guards: createInitialGuards().guards,
  activeParty: ['Alek', 'Grigory'],
  cities: createInitialCities().cities,
  campaignId: 1,
  completedBounties: [],
  completedPuzzleQuests: [],
  onShowSource: vi.fn(),
  searchSeed: null,
  onSeedApplied: vi.fn(),
};

function setup(props = {}) {
  return render(h(CraftTab, { ...baseProps, ...props }));
}

const cardNames = (container) =>
  [...container.querySelectorAll('.craft-card-name')].map(el => el.textContent);

// fireEvent.change, not a raw `input.value =` assignment: React's controlled
// input keeps a value tracker and silently ignores a direct write, so the
// component never sees the keystroke and the test passes vacuously. Wrapped in
// act() so the deferred render settles before the assertions read the list.
function type(input, value) {
  act(() => { fireEvent.change(input, { target: { value } }); });
}

afterEach(cleanup);

describe('CraftTab — unfiltered list', () => {
  it('renders a card for every recipe available to the active party', () => {
    const { container } = setup();
    // Guard-restricted recipes are hidden unless a matching guard is active.
    const expected = RECIPES.filter(
      r => r.limitedTo.length === 0 || r.limitedTo.some(g => baseProps.activeParty.includes(g))
    );
    expect(container.querySelectorAll('.craft-card')).toHaveLength(expected.length);
  });

  it('hides recipes restricted to a guard who is not in the active party', () => {
    const restricted = RECIPES.find(r => r.limitedTo.length > 0);
    const { container } = setup({ activeParty: ['Yana', 'Pavel'] });
    const shown = cardNames(container);
    if (!restricted.limitedTo.some(g => ['Yana', 'Pavel'].includes(g))) {
      expect(shown).not.toContain(restricted.name);
    }
    // And the same recipe appears once its guard is active.
    cleanup();
    const { container: c2 } = setup({ activeParty: [restricted.limitedTo[0], 'Grigory'] });
    expect(cardNames(c2)).toContain(restricted.name);
  });
});

describe('CraftTab — search', () => {
  it('filters by recipe name', () => {
    const { container } = setup();
    type(container.querySelector('.craft-search'), 'tunic');
    const shown = cardNames(container);
    expect(shown).toEqual(expect.arrayContaining(["Guard's Tunic", 'Reinforced Tunic', 'Bear Tunic']));
    // Every surviving card matches on its own name or its prereq — "Horned
    // Cuirass" is a legitimate hit because its prereq is Reinforced Tunic.
    // Asserting name-only would be stricter than the documented behaviour.
    for (const name of shown) {
      const recipe = RECIPES.find(r => r.name === name);
      const hit = name.toLowerCase().includes('tunic')
        || (recipe.prereq ?? '').toLowerCase().includes('tunic');
      expect(hit, `${name} matched "tunic" through neither name nor prereq`).toBe(true);
    }
  });

  it('matches on a material name, not just the recipe name', () => {
    const { container } = setup();
    type(container.querySelector('.craft-search'), 'bear pelt');
    const shown = cardNames(container);
    expect(shown).toContain('Bear Tunic');
    // Bear Tunic does not contain the string "bear pelt" in its own name, so
    // this can only have matched through the materials list.
    expect('Bear Tunic'.toLowerCase()).not.toContain('bear pelt');
  });

  it('matches on a prereq item name', () => {
    const { container } = setup();
    type(container.querySelector('.craft-search'), "guard's tunic");
    expect(cardNames(container)).toContain('Reinforced Tunic');
  });

  it('shows the empty state when nothing matches', () => {
    const { container } = setup();
    type(container.querySelector('.craft-search'), 'zzzznotarecipe');
    expect(container.querySelectorAll('.craft-card')).toHaveLength(0);
    expect(screen.getByText('No recipes match')).toBeTruthy();
  });

  it('restores the full list when the search is cleared', () => {
    const { container } = setup();
    const before = container.querySelectorAll('.craft-card').length;
    type(container.querySelector('.craft-search'), 'tunic');
    expect(container.querySelectorAll('.craft-card').length).toBeLessThan(before);
    type(container.querySelector('.craft-search'), '');
    expect(container.querySelectorAll('.craft-card')).toHaveLength(before);
  });
});

describe('CraftTab — deep-link seed', () => {
  it('applies the seed on first mount and reports it consumed', () => {
    const onSeedApplied = vi.fn();
    const { container } = setup({
      searchSeed: { term: 'Reinforced Tunic', nonce: 1 },
      onSeedApplied,
    });
    expect(container.querySelector('.craft-search').value).toBe('Reinforced Tunic');
    expect(cardNames(container)).toContain('Reinforced Tunic');
    expect(onSeedApplied).toHaveBeenCalled();
  });

  it('re-applies when the nonce changes, even for the same term', () => {
    const { container, rerender } = setup({ searchSeed: { term: 'Bear Tunic', nonce: 1 } });
    type(container.querySelector('.craft-search'), 'something else');
    act(() => {
      rerender(h(CraftTab, { ...baseProps, searchSeed: { term: 'Bear Tunic', nonce: 2 } }));
    });
    expect(container.querySelector('.craft-search').value).toBe('Bear Tunic');
  });
});

describe('CraftTab — can-craft filter', () => {
  it('hides everything when the stash is empty, and reveals a recipe once its materials are held', () => {
    // Guard's Tunic: 2 Metal Frag. + 4 Rough Leather, 10 sil, craftable in Mir.
    const { container } = setup();
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Can craft'));
    act(() => { toggle.click(); });
    expect(cardNames(container)).not.toContain("Guard's Tunic");

    cleanup();
    const { container: c2 } = setup({
      stash: { 'Metal Frag.': 2, 'Rough Leather': 4 },
      sil: 50,
    });
    const toggle2 = [...c2.querySelectorAll('button')].find(b => b.textContent.includes('Can craft'));
    act(() => { toggle2.click(); });
    expect(cardNames(c2)).toContain("Guard's Tunic");
  });

  it('counts an active guard\'s satchel toward craftability, not just the stash', () => {
    const guards = createInitialGuards().guards.map(g =>
      g.name === 'Alek'
        ? { ...g, satchel: [{ item: 'Metal Frag.', qty: 2 }, { item: 'Rough Leather', qty: 4 }, ...g.satchel.slice(2)] }
        : g
    );
    const { container } = setup({ guards, sil: 50 });
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Can craft'));
    act(() => { toggle.click(); });
    expect(cardNames(container)).toContain("Guard's Tunic");
  });
});
