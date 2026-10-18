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

const click = (el) => act(() => { el.click(); });
const button = (name) => screen.getByRole('button', { name });
const cardOf = (container, name) =>
  [...container.querySelectorAll('.craft-card')].find(c => c.querySelector('.craft-card-name').textContent === name);

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

describe('CraftTab — "Crafting for" guard selector', () => {
  const pressed = (name) => button(name).getAttribute('aria-pressed');
  // Names repeat (Leather Gauntlets, Scale Shield, Traveling Boots), so a card
  // is allowed if any recipe of that name is.
  const usableBy = (name, guard) =>
    RECIPES.filter(r => r.name === name).some(r => r.limitedTo.length === 0 || r.limitedTo.includes(guard));
  const sorted = (names) => [...new Set(names)].sort();

  it('offers Both and each active guard, defaulting to Both with the full party list', () => {
    const { container } = setup();
    const group = screen.getByRole('group', { name: 'Crafting for' });
    expect([...group.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Both', 'Alek', 'Grigory']);
    expect(pressed('Both')).toBe('true');
    const expected = RECIPES.filter(
      r => r.limitedTo.length === 0 || r.limitedTo.some(g => baseProps.activeParty.includes(g))
    );
    expect(container.querySelectorAll('.craft-card')).toHaveLength(expected.length);
  });

  it('shows no Exclusive toggle under Both', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Exclusive' })).toBeNull();
  });

  it("narrows to one guard's gear, keeping universal items", () => {
    const { container } = setup();
    click(button('Alek'));
    const alek = cardNames(container);
    expect(alek).toEqual(expect.arrayContaining(["Guard's Tunic", 'Journey Attire', "Zephyr's Tunic"]));
    expect(alek).not.toContain('Tenebris Scale');
    expect(alek).not.toContain('Tunic of the Wild');
    for (const name of alek) {
      expect(usableBy(name, 'Alek'), `${name} is restricted to someone other than Alek`).toBe(true);
    }

    click(button('Grigory'));
    const grigory = cardNames(container);
    expect(grigory).toEqual(expect.arrayContaining(['Tenebris Scale', 'Tunic of the Wild']));
    expect(grigory).not.toContain('Journey Attire');
  });

  it("Exclusive leaves only the gear restricted to the chosen guard", () => {
    const { container } = setup();
    click(button('Alek'));
    click(button('Exclusive'));
    expect(pressed('Exclusive')).toBe('true');
    expect(sorted(cardNames(container))).toEqual(
      sorted(RECIPES.filter(r => r.limitedTo.includes('Alek')).map(r => r.name))
    );
  });

  it('falls back to Both when the selected guard leaves the party', () => {
    const { container, rerender } = setup();
    click(button('Alek'));
    act(() => { rerender(h(CraftTab, { ...baseProps, activeParty: ['Yana', 'Pavel'] })); });
    expect(pressed('Both')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Exclusive' })).toBeNull();
    const count = container.querySelectorAll('.craft-card').length;

    cleanup();
    const { container: fresh } = setup({ activeParty: ['Yana', 'Pavel'] });
    expect(count).toBe(fresh.querySelectorAll('.craft-card').length);
  });

  it('a deep-link seed resets the guard selection so the target is visible', () => {
    const { container, rerender } = setup();
    click(button('Alek'));
    click(button('Exclusive'));
    act(() => {
      rerender(h(CraftTab, { ...baseProps, searchSeed: { term: 'Tenebris Scale', nonce: 1 } }));
    });
    expect(pressed('Both')).toBe('true');
    expect(cardNames(container)).toContain('Tenebris Scale');
  });

  it("states the item's full restriction, not just the guards in the party", () => {
    const { container } = setup();
    expect(cardOf(container, 'Journey Attire').querySelector('.craft-restriction').textContent).toBe('Alek, Yury only');
  });
});

describe('CraftTab — upgrade comparison', () => {
  // Grigory, not Alek: the spreadsheet restricts Volk Blade and Argent Blade to
  // Grigory, so this fixture is the one the coming data corrections (AVE-1186)
  // are least likely to hide them from.
  const guards = createInitialGuards().guards.map(g =>
    g.name === 'Grigory'
      ? { ...g, equipment: { weapon: 'Volk Blade', armor: 'Reinforced Tunic', accessory: '', item: '' } }
      : g
  );
  const upgrade = (container, name) => cardOf(container, name).querySelector('.craft-upgrade');
  const better = (container, name) =>
    upgrade(container, name).querySelector('.craft-upgrade-value').classList.contains('craft-upgrade-value--better');
  const muted = (container, name) => cardOf(container, name).classList.contains('craft-card--not-upgrade');
  const section = (container, type) =>
    [...container.querySelectorAll('.craft-section-label')].find(el => el.textContent === type).parentElement;

  function forGrigory() {
    const { container } = setup({ guards });
    click(button('Grigory'));
    return container;
  }

  it('shows the gain over the equipped weapon and highlights it', () => {
    const container = forGrigory();
    expect(upgrade(container, 'Argent Blade').textContent).toBe('+1 👊 vs Volk Blade');
    expect(better(container, 'Argent Blade')).toBe(true);
    expect(muted(container, 'Argent Blade')).toBe(false);
  });

  it('compares armor with the equipped armor', () => {
    const container = forGrigory();
    expect(upgrade(container, 'Horned Cuirass').textContent).toBe('+1 ⛊ vs Reinforced Tunic');
  });

  it('marks the equipped item and mutes it', () => {
    const container = forGrigory();
    expect(upgrade(container, 'Volk Blade').textContent).toBe('Equipped');
    expect(better(container, 'Volk Blade')).toBe(false);
    expect(muted(container, 'Volk Blade')).toBe(true);
  });

  it('mutes a sidegrade', () => {
    const container = forGrigory();
    expect(upgrade(container, 'Alloy Short Sword').textContent).toBe('±0 👊 vs Volk Blade');
    expect(muted(container, 'Alloy Short Sword')).toBe(true);
  });

  it('shows a downgrade with a true minus sign, and mutes it', () => {
    const container = forGrigory();
    // Guard's Tunic is 0 ⛊ against Reinforced Tunic's 1.
    expect(upgrade(container, "Guard's Tunic").textContent).toBe('−1 ⛊ vs Reinforced Tunic');
    expect(muted(container, "Guard's Tunic")).toBe(true);
  });

  it('says when the slot is empty', () => {
    const { container } = setup({ guards });
    click(button('Alek'));
    expect(upgrade(container, 'Alloy Short Sword').textContent).toBe('+1 👊 (slot empty)');
  });

  it('never compares accessories or items', () => {
    const container = forGrigory();
    for (const type of ['Accessory', 'Item']) {
      const cards = section(container, type);
      expect(cards.querySelectorAll('.craft-card').length, `${type} section renders cards`).toBeGreaterThan(0);
      expect(cards.querySelectorAll('.craft-upgrade')).toHaveLength(0);
      expect(cards.querySelectorAll('.craft-card--not-upgrade')).toHaveLength(0);
    }
  });

  it('shows no comparison under Both', () => {
    const { container } = setup({ guards });
    expect(container.querySelectorAll('.craft-upgrade')).toHaveLength(0);
    expect(container.querySelectorAll('.craft-card--not-upgrade')).toHaveLength(0);
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
