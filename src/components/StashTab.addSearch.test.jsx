// @vitest-environment jsdom
/**
 * Tests for the Stash tab's "add item" search.
 *
 * The panel deliberately excludes items already in the stash — you cannot "add"
 * what is already there. But it excluded them *silently*: typing the name of an
 * item you hold rendered nothing at all — no rows, no container, no message —
 * which reads as a broken search rather than an answered one. The sibling
 * filter box above it handles the same case properly.
 *
 * Held items are now surfaced as informational rows that still increment on
 * tap, and a query matching nothing at all gets an explicit empty state.
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StashTab } from './StashTab';

const h = React.createElement;

function setup(stash = {}) {
  const adjustStash = vi.fn();
  const utils = render(h(StashTab, {
    sil: 0, lux: 0, setSil: vi.fn(), setLux: vi.fn(),
    stash, adjustStash,
    stonebound: { max: 6, locations: [] },
    setStoneboundMax: vi.fn(),
    addStoneboundLocation: vi.fn(),
    removeStoneboundLocation: vi.fn(),
    updateStoneboundLocation: vi.fn(),
    onShowSource: vi.fn(),
  }));
  // The add panel's input is the last .stash-search on the tab (the first is
  // the filter box over items already held).
  const inputs = utils.container.querySelectorAll('.stash-search');
  return { adjustStash, input: inputs[inputs.length - 1], ...utils };
}

const type = (input, value) => fireEvent.change(input, { target: { value } });
const results = container => container.querySelector('.stash-add-results');

describe('stash add search — items already held', () => {
  it('shows a held item with its count instead of rendering nothing', () => {
    const { container, input } = setup({ Pearl: 3 });
    type(input, 'Pearl');

    const box = results(container);
    expect(box).toBeTruthy();
    const held = box.querySelector('.stash-add-result--held');
    expect(held).toBeTruthy();
    expect(held.textContent).toContain('Pearl');
    expect(held.textContent).toContain('3');
  });

  it('tapping a held row increments it rather than doing nothing', () => {
    const { container, input, adjustStash } = setup({ Pearl: 3 });
    type(input, 'Pearl');
    fireEvent.click(container.querySelector('.stash-add-result--held'));
    expect(adjustStash).toHaveBeenCalledWith('Pearl', 1);
  });

  it('names the held row for screen readers, including the count', () => {
    const { container, input } = setup({ Pearl: 3 });
    type(input, 'Pearl');
    expect(container.querySelector('.stash-add-result--held').getAttribute('aria-label'))
      .toBe('Pearl, 3 in stash. Add one more.');
  });

  it('covers custom items too, not just predefined ones', () => {
    const { container, input } = setup({ 'Lucky Charm': 2 });
    type(input, 'lucky');
    const held = container.querySelector('.stash-add-result--held');
    expect(held).toBeTruthy();
    expect(held.textContent).toContain('Lucky Charm');
  });

  it('still lists unheld matches as addable, alongside held ones', () => {
    const { container, input } = setup({ Iron: 8 });
    type(input, 'Iron');
    const box = results(container);
    // "Iron" itself is held; "Iron Hammer" and friends are not.
    expect(box.querySelectorAll('.stash-add-result--held')).toHaveLength(1);
    const addable = [...box.querySelectorAll('.stash-add-result')]
      .filter(r => !r.classList.contains('stash-add-result--held'));
    expect(addable.length).toBeGreaterThan(0);
  });

  it('a zero-count tombstone is not treated as held', () => {
    // 0 is kept as a map tombstone rather than deleted (AVE-369); read sites
    // treat 0 and absent identically, so it must still be addable.
    const { container, input } = setup({ Pearl: 0 });
    type(input, 'Pearl');
    const box = results(container);
    expect(box.querySelector('.stash-add-result--held')).toBeNull();
    expect(box.textContent).toContain('Pearl');
  });
});

describe('stash add search — no matches', () => {
  it('offers an unknown string as a custom item', () => {
    const { container, input } = setup({});
    type(input, 'Bag of Holding');
    expect(container.querySelector('.stash-add-result--custom').textContent)
      .toContain('Bag of Holding');
  });

  it('renders nothing at all for an empty query', () => {
    const { container, input } = setup({ Pearl: 3 });
    type(input, '');
    expect(results(container)).toBeNull();
  });
});

describe('stonebound select has an accessible name', () => {
  it('is reachable by its label rather than as an unnamed combo box', () => {
    render(h(StashTab, {
      sil: 0, lux: 0, setSil: vi.fn(), setLux: vi.fn(),
      stash: {}, adjustStash: vi.fn(),
      stonebound: { max: 6, locations: [{ id: 1, selection: 'Mir', count: 1 }] },
      setStoneboundMax: vi.fn(),
      addStoneboundLocation: vi.fn(),
      removeStoneboundLocation: vi.fn(),
      updateStoneboundLocation: vi.fn(),
      onShowSource: vi.fn(),
    }));
    expect(screen.getByRole('combobox', { name: 'Stonebound location' })).toBeTruthy();
  });
});
