// @vitest-environment jsdom
//
// GuardAvatar's portrait-failure state must be scoped to the portrait that
// failed, not to the component instance.
//
// GuardPanel is not remounted when the player switches between the two active
// guards — App renders it in the same position with no key — so a bare
// `failed` boolean stuck at `true` for the rest of the session. One slow or
// blocked request (offline before the service worker had precached
// public/guards/) made every guard viewed afterwards fall back to initials,
// including the seven whose portraits load fine.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { GuardPanel } from './GuardPanel';

function makeGuard(name) {
  return {
    name,
    hp: 12,
    maxHp: 20,
    baseAtk: 2,
    baseDef: 1,
    expandedSatchel: false,
    satchel: Array.from({ length: 8 }, () => ({ item: '', qty: 1 })),
    equipment: { weapon: '', armor: '', accessory: '', item: '' },
  };
}

const noop = () => {};
const actions = {
  adjustGuardHp: noop,
  adjustGuardMaxHp: noop,
  setGuardEquipment: noop,
  setGuardSatchelItem: noop,
  toggleExpandedSatchel: noop,
};

function renderGuard(name) {
  return createElement(GuardPanel, { guard: makeGuard(name), guardIdx: 0, actions });
}

describe('GuardAvatar portrait fallback', () => {
  it('falls back to initials for the guard whose portrait failed', () => {
    render(renderGuard('Alek'));
    fireEvent.error(screen.getByAltText('Alek'));
    expect(screen.queryByAltText('Alek')).toBeNull();
    expect(document.querySelector('.guard-avatar').textContent).toBe('AL');
  });

  it('still renders the portrait for a different guard after one fails', () => {
    const { rerender } = render(renderGuard('Alek'));
    fireEvent.error(screen.getByAltText('Alek'));

    rerender(renderGuard('Grigory'));

    // Grigory's portrait was never requested, let alone failed.
    expect(screen.queryByAltText('Grigory')).not.toBeNull();
  });

  it('keeps the fallback when switching back to the guard that failed', () => {
    const { rerender } = render(renderGuard('Alek'));
    fireEvent.error(screen.getByAltText('Alek'));

    rerender(renderGuard('Grigory'));
    rerender(renderGuard('Alek'));

    expect(screen.queryByAltText('Alek')).toBeNull();
    expect(document.querySelector('.guard-avatar').textContent).toBe('AL');
  });
});
