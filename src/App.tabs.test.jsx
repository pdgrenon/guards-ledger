// @vitest-environment jsdom
/**
 * Tests for the tab strip: active state, ARIA wiring, and keyboard navigation.
 *
 * The strip spent several releases with no active state at all — the stylesheet
 * matched `.tab.active` while App emitted `tab--active`, so the rule was dead
 * and all six tabs rendered identically. jsdom applies no stylesheets, so a
 * test asserting "the button carries the class App gives it" would have passed
 * throughout. These tests therefore assert against the *stylesheet itself* —
 * the selector that actually paints the active tab — which is the only
 * assertion that could have caught the original bug.
 *
 * Built with React.createElement rather than JSX to match the project's
 * automatic-JSX-runtime lint config (no bare React import flagged as unused).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import App from './App.jsx';

const CSS = fs.readFileSync(path.join(import.meta.dirname, 'index.css'), 'utf8');

const app = () => render(React.createElement(App));
const selectedTab = () => screen.getByRole('tab', { selected: true });
const press = key => fireEvent.keyDown(selectedTab(), { key });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  // Skip the first-run overlay so the tab strip is the thing under test.
  localStorage.setItem('guards_ledger_v2', JSON.stringify({
    settings: { initialized: true, hasSeenOnboarding: true },
  }));
  // jsdom does not implement scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('tab strip active state', () => {
  it('the selected tab matches the selector the stylesheet styles', () => {
    app();
    // Every selector in index.css that applies the active-tab treatment.
    const activeRules = [...CSS.matchAll(/^(\.tab[^\s{,]*)\s*\{([^}]*)\}/gm)]
      .filter(([, , body]) => /border-bottom-color|font-weight/.test(body))
      .map(([, sel]) => sel);

    expect(activeRules.length).toBeGreaterThan(0);
    expect(activeRules.some(sel => selectedTab().matches(sel))).toBe(true);
  });

  it('no unselected tab matches the active selector', () => {
    app();
    const unselected = screen.getAllByRole('tab')
      .filter(t => t.getAttribute('aria-selected') !== 'true');
    expect(unselected).toHaveLength(5);
    for (const t of unselected) {
      expect(t.matches('.tab[aria-selected="true"]')).toBe(false);
    }
  });

  it('emits no class the stylesheet never defines', () => {
    app();
    for (const t of screen.getAllByRole('tab')) {
      for (const cls of t.className.split(/\s+/).filter(Boolean)) {
        expect(CSS).toContain(`.${cls}`);
      }
    }
  });
});

describe('tab strip ARIA wiring', () => {
  it('each tab points at the panel, and the panel points back at the active tab', () => {
    app();
    const panel = screen.getByRole('tabpanel');
    expect(selectedTab().getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(selectedTab().id);
  });

  it('uses a roving tabindex so the strip is a single Tab stop', () => {
    app();
    const zero = screen.getAllByRole('tab').filter(t => t.getAttribute('tabindex') === '0');
    expect(zero).toHaveLength(1);
    expect(zero[0].getAttribute('aria-selected')).toBe('true');
  });

  it('has exactly one main landmark and one h1', () => {
    app();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('tab strip keyboard navigation', () => {
  // Roving tabindex takes the unselected tabs out of the Tab order, so without
  // arrow keys they would be unreachable by keyboard entirely.
  it('ArrowRight and ArrowLeft move the selection', () => {
    app();
    expect(selectedTab().textContent).toBe('Guards');
    press('ArrowRight');
    expect(selectedTab().textContent).toBe('Cities');
    press('ArrowLeft');
    expect(selectedTab().textContent).toBe('Guards');
  });

  it('wraps at both ends and supports Home/End', () => {
    app();
    press('ArrowLeft');
    expect(selectedTab().textContent).toBe('More');
    press('ArrowRight');
    expect(selectedTab().textContent).toBe('Guards');
    press('End');
    expect(selectedTab().textContent).toBe('More');
    press('Home');
    expect(selectedTab().textContent).toBe('Guards');
  });

  it('ignores keys it does not handle', () => {
    app();
    const before = selectedTab().textContent;
    press('a');
    expect(selectedTab().textContent).toBe(before);
  });
});

describe('step selector sizing', () => {
  // The guard HP row puts .step-selector in a flex container beside the large
  // HP display; without flex-shrink:0 the group collapsed to ~35px total,
  // giving 9px-wide buttons. jsdom has no layout, so this asserts the CSS
  // declarations that prevent it rather than a measured width.
  it('.step-selector does not shrink and .step-btn clears the 24px target floor', () => {
    const selector = CSS.match(/^\.step-selector\s*\{([^}]*)\}/m)?.[1] ?? '';
    const btn      = CSS.match(/^\.step-btn\s*\{([^}]*)\}/m)?.[1] ?? '';

    expect(selector).toMatch(/flex-shrink:\s*0/);
    const minWidth = Number(btn.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
    // WCAG 2.5.8 (AA) sets a 24x24 CSS px floor for pointer targets.
    expect(minWidth).toBeGreaterThanOrEqual(24);
  });
});

describe('tab switching', () => {
  it('keeps exactly one tab selected', () => {
    app();
    fireEvent.click(screen.getByRole('tab', { name: 'Stash' }));
    const selected = screen.getAllByRole('tab')
      .filter(t => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toBe('Stash');
  });

  it('scrolls the newly selected tab into view', () => {
    app();
    Element.prototype.scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole('tab', { name: 'Campaign' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // inline, not block: scroll the strip horizontally, never the page.
    expect(Element.prototype.scrollIntoView.mock.calls[0][0]).toMatchObject({ inline: 'nearest' });
  });
});
