// @vitest-environment jsdom
/**
 * Tests for the GuardPanel HP step selector.
 *
 * The step selector lets a player pick 1/5/10 as the HP adjustment delta
 * instead of the fixed ±1. The step choice is local component state (never
 * synced), applied to both the + and − buttons.
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
    setGuardEquipment: vi.fn(),
    setGuardSatchelItem: vi.fn(),
    toggleExpandedSatchel: vi.fn(),
  };
  const utils = render(
    h(GuardPanel, { guard, guardIdx, actions }),
  );
  return { actions, ...utils };
}

describe('GuardPanel HP step selector', () => {
  function getAttr(el, attr) { return el.getAttribute(attr); }

  it('defaults to step 1 on mount', () => {
    const { container } = setup();
    const stepButtons = container.querySelectorAll('.step-btn');
    expect(stepButtons).toHaveLength(3);
    expect(stepButtons[0].classList.contains('active')).toBe(true);
    expect(getAttr(stepButtons[0], 'aria-pressed')).toBe('true');
    expect(stepButtons[1].classList.contains('active')).toBe(false);
    expect(getAttr(stepButtons[1], 'aria-pressed')).toBe('false');
    expect(stepButtons[2].classList.contains('active')).toBe(false);
    expect(getAttr(stepButtons[2], 'aria-pressed')).toBe('false');
  });

  it('calls adjustGuardHp(guardIdx, 1) with step 1 and + button', () => {
    const { actions, container } = setup();
    const plus = container.querySelector('.adj-pair .plus');
    fireEvent.click(plus);
    expect(actions.adjustGuardHp).toHaveBeenCalledTimes(1);
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(0, 1);
  });

  it('calls adjustGuardHp(guardIdx, 5) with step 5 and + button', () => {
    const { actions, container } = setup();
    const stepButtons = container.querySelectorAll('.step-btn');
    fireEvent.click(stepButtons[1]); // step 5
    const plus = container.querySelector('.adj-pair .plus');
    fireEvent.click(plus);
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(0, 5);
  });

  it('calls adjustGuardHp(guardIdx, -5) with step 5 and - button', () => {
    const { actions, container } = setup();
    const stepButtons = container.querySelectorAll('.step-btn');
    fireEvent.click(stepButtons[1]); // step 5
    const minus = container.querySelector('.adj-pair .minus');
    fireEvent.click(minus);
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(0, -5);
  });

  it('updates active class and aria-pressed when step changes', () => {
    const { container } = setup();
    const stepButtons = container.querySelectorAll('.step-btn');
    fireEvent.click(stepButtons[2]); // step 10
    expect(stepButtons[2].classList.contains('active')).toBe(true);
    expect(getAttr(stepButtons[2], 'aria-pressed')).toBe('true');
    expect(stepButtons[0].classList.contains('active')).toBe(false);
    expect(getAttr(stepButtons[0], 'aria-pressed')).toBe('false');
  });

  it('passes the correct guardIdx to adjustGuardHp', () => {
    const { actions, container } = setup(GUARD_FIXTURE, 1);
    const plus = container.querySelector('.adj-pair .plus');
    fireEvent.click(plus);
    expect(actions.adjustGuardHp).toHaveBeenCalledWith(1, 1);
  });
});
