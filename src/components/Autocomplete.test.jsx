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
