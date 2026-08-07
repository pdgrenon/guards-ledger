// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';
import { reportUpdateReady, resetUpdateStateForTests } from '../utils/swUpdate';

beforeEach(() => resetUpdateStateForTests());
afterEach(() => cleanup());

describe('UpdateBanner', () => {
  it('renders nothing until an update is reported', () => {
    render(createElement(UpdateBanner));
    expect(screen.queryByText('A new version is ready')).toBeNull();
  });

  it('appears when the service worker reports a waiting update', () => {
    render(createElement(UpdateBanner));
    act(() => reportUpdateReady(() => {}));

    expect(screen.getByText('A new version is ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
  });

  it('shows an update reported before mount', () => {
    reportUpdateReady(() => {});
    render(createElement(UpdateBanner));

    expect(screen.getByText('A new version is ready')).toBeTruthy();
  });

  it('is role=status, not role=alert — it must not outrank a corrupt save', () => {
    render(createElement(UpdateBanner));
    act(() => reportUpdateReady(() => {}));

    const banner = screen.getByRole('status');
    expect(banner.className).toContain('corruption-banner--update');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('applies the update when Reload is pressed, and disables both buttons', () => {
    const apply = vi.fn();
    render(createElement(UpdateBanner));
    act(() => reportUpdateReady(apply));

    act(() => screen.getByRole('button', { name: 'Reload' }).click());

    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reloading…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Later' }).disabled).toBe(true);
  });

  it('does not double-apply on a second tap before the reload lands', () => {
    const apply = vi.fn();
    render(createElement(UpdateBanner));
    act(() => reportUpdateReady(apply));

    const reload = screen.getByRole('button', { name: 'Reload' });
    act(() => reload.click());
    act(() => reload.click());

    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('hides on Later without activating the waiting worker', () => {
    const apply = vi.fn();
    render(createElement(UpdateBanner));
    act(() => reportUpdateReady(apply));

    act(() => screen.getByRole('button', { name: 'Later' }).click());

    expect(screen.queryByText('A new version is ready')).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it('keeps the banner up when applying throws', () => {
    render(createElement(UpdateBanner));
    act(() => reportUpdateReady(() => { throw new Error('no controller'); }));

    act(() => screen.getByRole('button', { name: 'Reload' }).click());

    expect(screen.getByRole('button', { name: 'Reload' }).disabled).toBe(false);
  });
});
