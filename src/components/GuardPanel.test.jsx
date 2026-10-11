// @vitest-environment jsdom
/**
 * Tests for the GuardPanel HP controls.
 *
 * HP adjusts by exactly ±1. There used to be a 1/5/10 step selector here, but
 * ±1 was the only step the table ever used, and fitting three more buttons into
 * the HP row is what collapsed them to 9px wide. The Sil/Lux steppers in
 * StashTab deliberately keep theirs — craft costs run to 75 Sil.
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { GuardPanel } from './GuardPanel';

const h = React.createElement;

const GUARD_FIXTURE = {
  name: 'Grigory',
  hp: 12,
  maxHp: 20,
  baseAtk: 3,
  baseDef: 2,
  expandedSatchel: false,
  satchel: Array(8).fill({ item: '', qty: 1 }),
  equipment: { weapon: '', armor: '', accessory: '', item: '' },
};

function setup(guard = GUARD_FIXTURE, guardIdx = 0) {
  const actions = {
    adjustGuardHp: vi.fn(),
    adjustGuardTalent: vi.fn(),
    setGuardEquipment: vi.fn(),
    setGuardSatchelItem: vi.fn(),
    toggleExpandedSatchel: vi.fn(),
  };
  const utils = render(
    h(GuardPanel, { guard, guardIdx, actions }),
  );
  return { actions, ...utils };
}

describe('GuardPanel HP controls', () => {
  it('renders no step selector', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.step-btn')).toHaveLength(0);
    expect(container.querySelectorAll('.step-selector')).toHaveLength(0);
  });

  it('+ adjusts by exactly +1', () => {
    const { actions, container } = setup();
    fireEvent.click(container.querySelector('.adj-pair .plus'));
    expect(actions.adjustGuardHp).toHaveBeenCalledTimes(1);
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(0, 1);
  });

  it('− adjusts by exactly −1', () => {
    const { actions, container } = setup();
    fireEvent.click(container.querySelector('.adj-pair .minus'));
    expect(actions.adjustGuardHp).toHaveBeenCalledTimes(1);
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(0, -1);
  });

  it('repeated taps each send ±1 rather than accumulating a step', () => {
    const { actions, container } = setup();
    const plus = container.querySelector('.adj-pair .plus');
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(actions.adjustGuardHp).toHaveBeenCalledTimes(3);
    for (const call of actions.adjustGuardHp.mock.calls) {
      expect(call).toEqual([0, 1]);
    }
  });

  it('passes the correct guardIdx to adjustGuardHp', () => {
    const { actions, container } = setup(GUARD_FIXTURE, 1);
    fireEvent.click(container.querySelector('.adj-pair .plus'));
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(1, 1);
  });

  it('names both HP buttons for screen readers, including the step', () => {
    const { container } = setup();
    expect(container.querySelector('.adj-pair .plus').getAttribute('aria-label'))
      .toBe('Increase Grigory HP by 1');
    expect(container.querySelector('.adj-pair .minus').getAttribute('aria-label'))
      .toBe('Decrease Grigory HP by 1');
  });
});

describe('GuardPanel talent bonus', () => {
  const toggle = (container, i) => container.querySelectorAll('.combat-stat-toggle')[i];

  it('hides the stepper until the stat is tapped', () => {
    const { container } = setup();
    expect(container.querySelector('.talent-edit-row')).toBeNull();
    fireEvent.click(toggle(container, 0));
    expect(container.querySelector('.talent-edit-row')).not.toBeNull();
    expect(toggle(container, 0).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle(container, 0));
    expect(container.querySelector('.talent-edit-row')).toBeNull();
  });

  it('sends the stat and guard index', () => {
    const { actions, container } = setup(GUARD_FIXTURE, 4);
    fireEvent.click(toggle(container, 1));
    fireEvent.click(container.querySelector('.talent-edit-row .plus'));
    expect(actions.adjustGuardTalent).toHaveBeenCalledWith(4, 'def', 1);
  });

  it('disables − at 0', () => {
    const { container } = setup();
    fireEvent.click(toggle(container, 0));
    expect(container.querySelector('.talent-edit-row .minus').disabled).toBe(true);
  });

  it('adds the bonus to the total and shows it in the breakdown', () => {
    const { container } = setup({
      ...GUARD_FIXTURE, talentAtk: 1,
      equipment: { ...GUARD_FIXTURE.equipment },
    });
    const box = container.querySelectorAll('.combat-stat-box')[0];
    expect(box.querySelector('.combat-stat-value').textContent).toBe('4');
    expect(box.querySelector('.combat-stat-breakdown').textContent).toBe('3 base + 1 talent');
  });

  it('shows no breakdown when there is only a base value', () => {
    const { container } = setup();
    expect(container.querySelector('.combat-stat-breakdown')).toBeNull();
  });

  it('does not leave the stepper open after switching guards', () => {
    const { container, rerender, actions } = setup();
    fireEvent.click(toggle(container, 0));
    rerender(h(GuardPanel, { guard: { ...GUARD_FIXTURE, name: 'Alek' }, guardIdx: 1, actions }));
    expect(container.querySelector('.talent-edit-row')).toBeNull();
  });
});
