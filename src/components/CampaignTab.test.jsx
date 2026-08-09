// @vitest-environment jsdom
/**
 * Tests for the Campaign tab's draft-until-commit text inputs (AVE-784).
 *
 * The core guarantee, mirroring what AVE-534 established for Autocomplete:
 * typing never commits. `onSetFixed` / `onUpdateDynamic` fire exactly once per
 * edit, at a resolved commit point (blur / Enter) — never per keystroke. That
 * keeps one field edit to ONE undo snapshot and ONE sync write, instead of one
 * per character (which made Undo revert a single letter).
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { LocationsCard, DraftInput, BuildingCard } from './CampaignTab';
import { FT_ISTRA_BUILDINGS } from '../data/buildings';

const h = React.createElement;

function setupCard(locations = {}) {
  const onSetFixed      = vi.fn();
  const onUpdateDynamic = vi.fn();
  const onAddDynamic    = vi.fn();
  const onRemoveDynamic = vi.fn();
  const utils = render(h(LocationsCard, {
    locations: {
      party: '', caravan: '', mainQuest: '', boat: '',
      sideQuests: [{ id: 1, label: '' }],
      ...locations,
    },
    onSetFixed, onUpdateDynamic, onAddDynamic, onRemoveDynamic,
  }));
  return {
    onSetFixed, onUpdateDynamic, onAddDynamic, onRemoveDynamic,
    partyInput: utils.container.querySelector('#loc-party'),
    sideQuestInput: utils.container.querySelector('.campaign-dynamic-row input'),
    ...utils,
  };
}

describe('Campaign fixed-location inputs (AVE-784)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('does not commit while typing', () => {
    const { onSetFixed, partyInput } = setupCard();
    fireEvent.focus(partyInput);
    fireEvent.change(partyInput, { target: { value: 'N' } });
    fireEvent.change(partyInput, { target: { value: 'No' } });
    fireEvent.change(partyInput, { target: { value: 'Node' } });
    fireEvent.change(partyInput, { target: { value: 'Node 83' } });
    expect(onSetFixed).not.toHaveBeenCalled();
  });

  it('commits exactly once on blur, with the full text', () => {
    const { onSetFixed, partyInput } = setupCard();
    fireEvent.focus(partyInput);
    fireEvent.change(partyInput, { target: { value: 'Node 83' } });
    fireEvent.blur(partyInput);
    expect(onSetFixed).toHaveBeenCalledTimes(1);
    expect(onSetFixed).toHaveBeenCalledWith('party', 'Node 83');
  });

  it('commits exactly once on Enter', () => {
    const { onSetFixed, partyInput } = setupCard();
    fireEvent.focus(partyInput);
    fireEvent.change(partyInput, { target: { value: 'Ryba: The Narrows' } });
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    expect(onSetFixed).toHaveBeenCalledTimes(1);
    expect(onSetFixed).toHaveBeenCalledWith('party', 'Ryba: The Narrows');
  });

  // These two use REAL focus (`input.focus()`), not `fireEvent.focus`. The
  // difference is the whole bug: fireEvent.focus dispatches a focus event but
  // leaves document.activeElement alone, so the `e.currentTarget.blur()` inside
  // the keydown handler emits nothing and the handler's second, stale-closure
  // commit() never runs. In a real browser the field IS focused — the user just
  // typed into it — so Enter committed twice and Escape committed the draft it
  // was supposed to discard (AVE-924).
  it('does not double-commit when Enter is followed by blur', () => {
    const { onSetFixed, partyInput } = setupCard();
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'Node 12' } });
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    fireEvent.blur(partyInput);
    expect(onSetFixed).toHaveBeenCalledTimes(1);
    expect(onSetFixed).toHaveBeenCalledWith('party', 'Node 12');
  });

  it('commits exactly once on Enter when the field is really focused', () => {
    const { onSetFixed, partyInput } = setupCard();
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'Node 12' } });
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    expect(onSetFixed).toHaveBeenCalledTimes(1);
  });

  it('abandons the edit on Escape and restores the committed value', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'typo' } });
    fireEvent.keyDown(partyInput, { key: 'Escape' });
    expect(onSetFixed).not.toHaveBeenCalled();
    expect(partyInput.value).toBe('Node 45');
  });

  it('still commits nothing when Escape is followed by a blur', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'typo' } });
    fireEvent.keyDown(partyInput, { key: 'Escape' });
    fireEvent.blur(partyInput);
    expect(onSetFixed).not.toHaveBeenCalled();
    expect(partyInput.value).toBe('Node 45');
  });

  it('commits once on a real blur with no key press', () => {
    const { onSetFixed, partyInput } = setupCard();
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'Node 83' } });
    partyInput.blur();
    expect(onSetFixed).toHaveBeenCalledTimes(1);
    expect(onSetFixed).toHaveBeenCalledWith('party', 'Node 83');
  });

  it('does not commit on Enter when the typed text equals the current value', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'Node 45' } });
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    expect(onSetFixed).not.toHaveBeenCalled();
  });

  it('does not commit on Enter when the user never edited', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    partyInput.focus();
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    expect(onSetFixed).not.toHaveBeenCalled();
  });

  it('a second edit after an Enter commit still commits exactly once', () => {
    const { onSetFixed, partyInput } = setupCard();
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'first' } });
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    partyInput.focus();
    fireEvent.change(partyInput, { target: { value: 'second' } });
    fireEvent.keyDown(partyInput, { key: 'Enter' });
    expect(onSetFixed).toHaveBeenCalledTimes(2);
    expect(onSetFixed).toHaveBeenNthCalledWith(2, 'party', 'second');
  });

  it('does not commit on blur when the user never edited', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    fireEvent.focus(partyInput);
    fireEvent.blur(partyInput);
    expect(onSetFixed).not.toHaveBeenCalled();
  });

  it('does not commit when the typed text equals the current value', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    fireEvent.focus(partyInput);
    fireEvent.change(partyInput, { target: { value: 'Node 4' } });
    fireEvent.change(partyInput, { target: { value: 'Node 45' } });
    fireEvent.blur(partyInput);
    expect(onSetFixed).not.toHaveBeenCalled();
  });

  it('commits an empty string when the field is cleared', () => {
    const { onSetFixed, partyInput } = setupCard({ party: 'Node 45' });
    fireEvent.focus(partyInput);
    fireEvent.change(partyInput, { target: { value: '' } });
    fireEvent.blur(partyInput);
    expect(onSetFixed).toHaveBeenCalledTimes(1);
    expect(onSetFixed).toHaveBeenCalledWith('party', '');
  });

  it('routes each fixed field to its own key', () => {
    const { onSetFixed, container } = setupCard();
    const boat = container.querySelector('#loc-boat');
    fireEvent.focus(boat);
    fireEvent.change(boat, { target: { value: 'Docked at Ryba' } });
    fireEvent.blur(boat);
    expect(onSetFixed).toHaveBeenCalledWith('boat', 'Docked at Ryba');
  });
});

describe('Campaign side-quest inputs (AVE-784)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('does not commit while typing', () => {
    const { onUpdateDynamic, sideQuestInput } = setupCard();
    fireEvent.focus(sideQuestInput);
    fireEvent.change(sideQuestInput, { target: { value: 'Fin' } });
    fireEvent.change(sideQuestInput, { target: { value: 'Find the seer' } });
    expect(onUpdateDynamic).not.toHaveBeenCalled();
  });

  it('commits once on blur, against that row\'s id', () => {
    const { onUpdateDynamic, sideQuestInput } = setupCard();
    fireEvent.focus(sideQuestInput);
    fireEvent.change(sideQuestInput, { target: { value: 'Find the seer' } });
    fireEvent.blur(sideQuestInput);
    expect(onUpdateDynamic).toHaveBeenCalledTimes(1);
    expect(onUpdateDynamic).toHaveBeenCalledWith('sideQuests', 1, 'Find the seer');
  });

  it('does not render tombstoned side quests', () => {
    const { container } = setupCard({
      sideQuests: [{ id: 1, label: 'live' }, { id: 2, label: 'gone', deleted: true }],
    });
    const inputs = container.querySelectorAll('.campaign-dynamic-row input');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].value).toBe('live');
  });
});

describe('DraftInput remote-update behavior (AVE-784)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('reflects a new value prop while the field is untouched', () => {
    const onCommit = vi.fn();
    const { container, rerender } = render(
      h(DraftInput, { value: 'old', onCommit, className: 'x' }),
    );
    const input = container.querySelector('input');
    expect(input.value).toBe('old');
    // A co-player's edit arrives while this field is not being edited.
    rerender(h(DraftInput, { value: 'remote', onCommit, className: 'x' }));
    expect(input.value).toBe('remote');
  });

  it('keeps the in-flight draft when a value prop arrives mid-edit', () => {
    const onCommit = vi.fn();
    const { container, rerender } = render(
      h(DraftInput, { value: 'old', onCommit, className: 'x' }),
    );
    const input = container.querySelector('input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'my typing' } });
    rerender(h(DraftInput, { value: 'remote', onCommit, className: 'x' }));
    expect(input.value).toBe('my typing');   // local edit is not clobbered
    expect(onCommit).not.toHaveBeenCalled();
  });
});

/**
 * The upgrade description belongs to the Upgraded state alone. Gated at
 * `>= 1` it appeared the moment a building was merely Built, promising a
 * benefit the player had not bought — for the Barracks, "remove all negative
 * chips" when a Built Barracks removes exactly one. Asserted against the real
 * FT_ISTRA_BUILDINGS entries so the data and the gate cannot drift apart.
 */
describe('BuildingCard description by state', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  const barracks = FT_ISTRA_BUILDINGS.find(b => b.name === 'Barracks');

  function descFor(building, state) {
    const { container } = render(h(BuildingCard, {
      building, state, stash: {}, onSetState: vi.fn(), onShowSource: vi.fn(),
    }));
    return container.querySelector('.fi-building-desc').textContent;
  }

  it('shows the base description when the building is Not Owned', () => {
    expect(descFor(barracks, 'not_owned')).toBe(barracks.description);
  });

  it('shows the base description when the building is Built, not the upgrade one', () => {
    expect(descFor(barracks, 'built')).toBe(barracks.description);
  });

  it('shows the upgrade description only once Upgraded', () => {
    expect(descFor(barracks, 'upgraded')).toBe(barracks.upgradeDescription);
  });

  it('says 1 negative chip when Built and all negative chips only when Upgraded', () => {
    expect(descFor(barracks, 'built')).toMatch(/remove 1 negative chip/i);
    expect(descFor(barracks, 'built')).not.toMatch(/all negative chips/i);
    expect(descFor(barracks, 'upgraded')).toMatch(/all negative chips/i);
  });

  it('holds for every Ft. Istra building, not just the Barracks', () => {
    for (const b of FT_ISTRA_BUILDINGS) {
      expect(descFor(b, 'built')).toBe(b.description);
      cleanup();
      if (b.upgradeDescription) {
        expect(descFor(b, 'upgraded')).toBe(b.upgradeDescription);
        cleanup();
      }
    }
  });

  it('falls back to the base description when a building has no upgrade text', () => {
    const noUpgrade = { ...barracks, upgradeDescription: null };
    expect(descFor(noUpgrade, 'upgraded')).toBe(noUpgrade.description);
  });
});
