// @vitest-environment jsdom
/**
 * Tests for the Autocomplete draft-until-commit behavior (AVE-534).
 *
 * The core guarantee: partially-typed text never becomes committed state.
 * `onChange` fires exactly once per edit, at a resolved commit point (select /
 * Enter / blur) — never per keystroke — and unknown text in a constrained field
 * reverts instead of persisting garbage. `allowFreeText` opts into keeping
 * arbitrary text (custom items).
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Autocomplete } from './Autocomplete';
import { ALL_MATERIALS } from '../data/materials';

const h = React.createElement;
const OPTIONS = ['Silver Flame', 'Silver Sword', 'Iron Dagger'];

function setup(props = {}) {
  const onChange = vi.fn();
  const utils = render(
    h(Autocomplete, { value: '', onChange, options: OPTIONS, ...props }),
  );
  const input = utils.container.querySelector('input');
  return { onChange, input, ...utils };
}

describe('Autocomplete draft-until-commit (AVE-534)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('does not call onChange while typing', () => {
    const { onChange, input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 's' } });
    fireEvent.change(input, { target: { value: 'si' } });
    fireEvent.change(input, { target: { value: 'silver f' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reverts unknown text in a constrained field on blur (no commit)', () => {
    const { onChange, input } = setup({ value: 'Iron Dagger' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'silver f' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('Iron Dagger'); // reverted to committed value
  });

  it('commits the canonical option on exact case-insensitive match at blur', () => {
    const { onChange, input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'silver flame' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Silver Flame');
  });

  it('commits empty string when the field is cleared on blur', () => {
    const { onChange, input } = setup({ value: 'Silver Flame' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('keeps arbitrary text when allowFreeText is set', () => {
    const { onChange, input } = setup({ allowFreeText: true });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'My Custom Thing' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('My Custom Thing');
  });

  it('commits exactly once when an option is picked after typing', () => {
    const { onChange, input, container } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'silver' } });
    const opt = [...container.querySelectorAll('.autocomplete-option')]
      .find(o => o.textContent === 'Silver Flame');
    fireEvent.mouseDown(opt);
    // blur fires after the option mousedown; the selecting guard must skip revert
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Silver Flame');
  });

  it('commits the top match on Enter', () => {
    const { onChange, input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'iron' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Iron Dagger');
  });

  it('does not commit on blur when the user never edited', () => {
    const { onChange, input } = setup({ value: 'Silver Flame' });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Autocomplete browse on focus (AVE-794)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('shows options on focus when the field is empty', () => {
    const { input, container } = setup();
    fireEvent.focus(input);
    const options = container.querySelectorAll('.autocomplete-option');
    expect(options.length).toBe(3);
    expect(options[0].textContent).toBe('Silver Flame');
    expect(options[1].textContent).toBe('Silver Sword');
    expect(options[2].textContent).toBe('Iron Dagger');
  });

  it('does not call onChange on Enter when field was freshly focused (empty, no typing)', () => {
    const { onChange, input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits the highlighted option on ArrowDown + Enter in an empty field', () => {
    const { onChange, input } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Silver Flame');
  });

  it('still shows filtered results on focus when field has a committed value', () => {
    const { input, container } = setup({ value: 'Silver Flame' });
    fireEvent.focus(input);
    const options = container.querySelectorAll('.autocomplete-option');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toBe('Silver Flame');
  });
});

// ─── Exact match beats a containing option on Enter (AVE-872) ────────────────

describe('Autocomplete Enter prefers an exact match (AVE-872)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  // `filtered` is a substring match in source order, so an option that merely
  // CONTAINS the typed text and sorts earlier used to win on Enter. Blur always
  // resolved these correctly, so the two commit gestures disagreed on the same
  // input.
  const SHADOWED = ['Black Diamond', 'Diamond'];

  function setupShadowed(props = {}) {
    const onChange = vi.fn();
    const utils = render(
      h(Autocomplete, { value: '', onChange, options: SHADOWED, ...props }),
    );
    return { onChange, input: utils.container.querySelector('input'), ...utils };
  }

  it('commits the exactly-typed option, not the earlier-sorting one that contains it', () => {
    const { onChange, input } = setupShadowed();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Diamond' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Diamond');
  });

  it('matches the exact option case-insensitively and commits the canonical string', () => {
    const { onChange, input } = setupShadowed();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'diamond' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Diamond');
  });

  it('trims surrounding whitespace before matching, like blur does', () => {
    const { onChange, input } = setupShadowed();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '  Diamond ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Diamond');
  });

  it('still lets an explicitly highlighted option win over the exact match', () => {
    // ArrowDown is a deliberate choice by the user; it must not be overridden.
    const { onChange, input } = setupShadowed();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Diamond' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlights 'Black Diamond'
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Black Diamond');
  });

  it('still commits the top filtered row for a non-exact prefix', () => {
    const { onChange, input } = setupShadowed();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Diam' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Black Diamond');
  });

  it('Enter and blur agree on the same input', () => {
    const viaEnter = setupShadowed();
    fireEvent.focus(viaEnter.input);
    fireEvent.change(viaEnter.input, { target: { value: 'Diamond' } });
    fireEvent.keyDown(viaEnter.input, { key: 'Enter' });
    cleanup();

    const viaBlur = setupShadowed();
    fireEvent.focus(viaBlur.input);
    fireEvent.change(viaBlur.input, { target: { value: 'Diamond' } });
    fireEvent.blur(viaBlur.input);

    expect(viaEnter.onChange.mock.calls).toEqual(viaBlur.onChange.mock.calls);
  });

  it('holds for the real shipped material list', () => {
    // Guards against a future data change reintroducing the shadowing pair.
    // ALL_MATERIALS is sorted, so 'Black Diamond' and 'Clayhorn Steak' both
    // precede the shorter names they contain.
    for (const name of ['Diamond', 'Horn']) {
      const onChange = vi.fn();
      const utils = render(
        h(Autocomplete, { value: '', onChange, options: ALL_MATERIALS }),
      );
      const input = utils.container.querySelector('input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith(name);
      cleanup();
    }
  });

  it('reverts unknown text on Enter in a constrained field, unchanged', () => {
    const { onChange, input } = setupShadowed({ value: 'Diamond' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Ruby' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('Diamond');
  });

  it('still commits raw text on Enter when allowFreeText is set', () => {
    const { onChange, input } = setupShadowed({ allowFreeText: true });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Ruby' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Ruby');
  });
});
