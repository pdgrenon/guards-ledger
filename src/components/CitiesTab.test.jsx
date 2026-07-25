// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { CitiesTab } from './CitiesTab';
import { createInitialCities } from '../data/constants';

const h = React.createElement;

const cities = createInitialCities().cities;
const defaultProps = {
  cities,
  campaignId: 1,
  completedBounties: [],
  completedPuzzleQuests: [],
  toggleBountyComplete: vi.fn(),
  togglePuzzleQuestComplete: vi.fn(),
};

function setup(props = {}) {
  const onTargetApplied = vi.fn();
  const utils = render(h(CitiesTab, { ...defaultProps, onTargetApplied, ...props }));
  return { onTargetApplied, ...utils };
}

describe('CitiesTab scroll-and-highlight (AVE-793)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('scrolls the matching city card into view when cityTarget is provided', () => {
    const { container } = setup({ cityTarget: { id: 'silny', nonce: 1 } });
    const card = container.querySelector('.city-card:nth-child(4)');
    expect(card).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      { behavior: 'smooth', block: 'center' },
    );
  });

  it('adds the highlight class to the target city card', () => {
    const { container } = setup({ cityTarget: { id: 'silny', nonce: 1 } });
    const card = container.querySelector('.city-card--highlight');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Silny');
  });

  it('removes the highlight class after 2 seconds', () => {
    const { container } = setup({ cityTarget: { id: 'silny', nonce: 1 } });
    expect(container.querySelector('.city-card--highlight')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.querySelector('.city-card--highlight')).toBeNull();
  });

  it('calls onTargetApplied once after consuming the target', () => {
    const { onTargetApplied } = setup({ cityTarget: { id: 'silny', nonce: 1 } });
    expect(onTargetApplied).toHaveBeenCalledTimes(1);
  });

  it('does not re-trigger scroll when re-rendered with the same nonce', () => {
    Element.prototype.scrollIntoView.mockClear();
    const { rerender } = render(
      h(CitiesTab, { ...defaultProps, onTargetApplied: vi.fn(), cityTarget: { id: 'silny', nonce: 1 } }),
    );
    const scrollCalls = Element.prototype.scrollIntoView.mock.calls.length;
    rerender(
      h(CitiesTab, { ...defaultProps, onTargetApplied: vi.fn(), cityTarget: { id: 'silny', nonce: 1 } }),
    );
    expect(Element.prototype.scrollIntoView.mock.calls.length).toBe(scrollCalls);
  });

  it('triggers scroll with a new nonce for the same city id', () => {
    Element.prototype.scrollIntoView.mockClear();
    const { rerender } = render(
      h(CitiesTab, { ...defaultProps, onTargetApplied: vi.fn(), cityTarget: { id: 'silny', nonce: 1 } }),
    );
    Element.prototype.scrollIntoView.mockClear();
    act(() => {
      rerender(
        h(CitiesTab, { ...defaultProps, onTargetApplied: vi.fn(), cityTarget: { id: 'silny', nonce: 2 } }),
      );
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('scrolls nothing when cityTarget is null', () => {
    Element.prototype.scrollIntoView.mockClear();
    setup({ cityTarget: null });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not call onTargetApplied when cityTarget is null', () => {
    const { onTargetApplied } = setup({ cityTarget: null });
    expect(onTargetApplied).not.toHaveBeenCalled();
  });

  it('does not throw when cityTarget id is unknown', () => {
    expect(() => {
      setup({ cityTarget: { id: 'atlantis', nonce: 1 } });
    }).not.toThrow();
  });

  it('scrolls the correct card for the given city id', () => {
    Element.prototype.scrollIntoView.mockClear();
    const { container } = setup({ cityTarget: { id: 'mir', nonce: 1 } });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    const card = container.querySelector('.city-card--highlight');
    expect(card.textContent).toContain('Mir');
  });
});
