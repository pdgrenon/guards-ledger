// @vitest-environment jsdom
/**
 * The talent-bonus stepper must work through the real App wiring.
 *
 * App hands GuardPanel a hand-picked `guardActions` object rather than the
 * whole game handle, and the talent action shipped missing from it: the
 * stepper rendered, and every tap called `undefined`. GuardPanel's own tests
 * pass a mocked actions object, so they could not see it. This renders App
 * with the real useGameState and checks the number actually changes.
 *
 * Supabase env vars are stubbed empty so the app runs local-only (see
 * App.syncPill.test.jsx for why stubEnv + resetModules is needed).
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('guards_ledger_v2', JSON.stringify({
    settings: { initialized: true, hasSeenOnboarding: true },
  }));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function renderApp() {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  vi.resetModules();
  const { default: App } = await import('./App.jsx');
  return render(React.createElement(App));
}

describe('talent bonus through App', () => {
  it('+ raises Attack and shows the talent in the breakdown', async () => {
    const { container } = await renderApp();
    const box = () => container.querySelectorAll('.combat-stat-box')[0];
    const before = Number(box().querySelector('.combat-stat-value').textContent);

    fireEvent.click(box().querySelector('.combat-stat-toggle'));
    fireEvent.click(screen.getByRole('button', { name: /^Increase .* talent Attack bonus$/ }));

    expect(Number(box().querySelector('.combat-stat-value').textContent)).toBe(before + 1);
    expect(box().querySelector('.combat-stat-breakdown').textContent).toContain('1 talent');
    expect(box().querySelector('.talent-edit-row .adj-val').textContent).toBe('1');
  });
});
