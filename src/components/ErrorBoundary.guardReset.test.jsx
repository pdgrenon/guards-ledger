// @vitest-environment jsdom
//
// The guard-level ErrorBoundary's fallback tells the player "The other guards
// are still available. Switch to a different guard to keep playing." That is
// only true if switching actually clears the boundary.
//
// A boundary keeps its `error` until it unmounts, and App renders the
// guard-level boundary in a fixed position — switching guards re-renders it
// with new props rather than replacing it. So the fallback survived the switch
// and re-labelled itself with the NEW guard's name, blaming a record that is
// fine. The Guards tab stayed dead until a full reload. `resetKey` closes that.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function GuardBody({ name, broken }) {
  if (name === broken) throw new Error('corrupt guard record');
  return createElement('div', null, `${name} panel`);
}

// Mirrors App.jsx's usage exactly — deliberately NO React `key`, so this pins
// the boundary's own behavior rather than a remount the test itself forced.
function guardTree(name, broken) {
  return createElement(
    ErrorBoundary,
    { level: 'guard', guardName: name, resetKey: name },
    createElement(GuardBody, { name, broken }),
  );
}

let consoleError;
afterEach(() => consoleError?.mockRestore());

describe('guard-level ErrorBoundary', () => {
  it('shows the fallback for the guard that threw', () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(guardTree('Alek', 'Alek'));
    expect(screen.getByText(/Alek's record could not be loaded/)).toBeTruthy();
  });

  it('recovers when the player switches to a different guard', () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(guardTree('Alek', 'Alek'));
    expect(screen.getByText(/Alek's record could not be loaded/)).toBeTruthy();

    // The player does exactly what the fallback tells them to do.
    rerender(guardTree('Vera', 'Alek'));

    expect(screen.getByText('Vera panel')).toBeTruthy();
    expect(screen.queryByText(/could not be loaded/)).toBeNull();
  });

  it('re-shows the fallback on returning to the broken guard', () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(guardTree('Alek', 'Alek'));
    rerender(guardTree('Vera', 'Alek'));
    rerender(guardTree('Alek', 'Alek'));

    expect(screen.getByText(/Alek's record could not be loaded/)).toBeTruthy();
  });

  it('does not clear the error on a re-render that keeps the same resetKey', () => {
    // The reset has to be keyed, not unconditional: an unconditional clear
    // would re-render the throwing child, catch again, and loop.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(guardTree('Alek', 'Alek'));
    rerender(guardTree('Alek', 'Alek'));

    expect(screen.getByText(/Alek's record could not be loaded/)).toBeTruthy();
  });

  it('leaves boundaries without a resetKey (app / tab level) unaffected', () => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tabTree = () => createElement(
      ErrorBoundary,
      { level: 'tab', tabName: 'Stash' },
      createElement(GuardBody, { name: 'x', broken: 'x' }),
    );
    const { rerender } = render(tabTree());
    rerender(tabTree());

    expect(screen.getByText(/Stash failed to load/)).toBeTruthy();
  });
});
