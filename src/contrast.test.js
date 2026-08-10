/**
 * contrast.test.js
 *
 * WCAG AA contrast enforcement for the colour tokens in index.css.
 *
 * docs/PRODUCT.md names a WCAG AA pass as success criterion 4, and the app was
 * failing it: --c-text3 measured 3.01:1 on --c-surface2 in light mode and
 * 2.45:1 in dark, across ~34 text rules — while a comment beside the token
 * claimed 4.6:1. Six of the eight guard identity colours also failed as text,
 * because the app wired each guard's `border` colour (chosen for presence
 * against a surface) into `.guard-name` and `.sec-label-primary` rather than
 * the purpose-built `text` variant sitting unused beside it.
 *
 * These tests parse index.css directly, so they hold whatever the stylesheet
 * actually ships — not a copy of the values maintained here.
 *
 * All thresholds are the 4.5:1 normal-text bar. Everything checked is 10-15px,
 * which is below the 18.66px/24px large-text exemption, so none of it qualifies
 * for the relaxed 3:1 threshold.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(path.join(import.meta.dirname, 'index.css'), 'utf8');

// ─── WCAG relative luminance / contrast ratio ────────────────────────────────

const channel = c => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

// ─── Token extraction ────────────────────────────────────────────────────────
//
// Light tokens live in the bare :root block; dark ones in the
// prefers-color-scheme override. Splitting on the media query is enough here
// because index.css declares each token exactly once per theme.

const splitAt   = CSS.indexOf('prefers-color-scheme');
const LIGHT_SRC = CSS.slice(0, splitAt);
const DARK_SRC  = CSS.slice(splitAt);

function token(src, name) {
  const m = src.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1] : null;
}

function guardColors(src) {
  const out = {};
  for (const m of src.matchAll(/--c-guard-([a-z]+)-(border|bg|text):\s*(#[0-9a-fA-F]{6})/g)) {
    (out[m[1]] ??= {})[m[2]] = m[3];
  }
  return out;
}

// Every surface a text token can land on. Each is used somewhere for all three,
// so the worst case is what counts.
const SURFACES = {
  light: ['--c-bg', '--c-surface', '--c-surface2'].map(n => token(LIGHT_SRC, n)),
  dark:  ['--c-bg', '--c-surface', '--c-surface2'].map(n => token(DARK_SRC, n)),
};

const THEMES = [
  { name: 'light', src: LIGHT_SRC, surfaces: SURFACES.light },
  { name: 'dark',  src: DARK_SRC,  surfaces: SURFACES.dark  },
];

describe('token extraction sanity', () => {
  // If index.css is restructured such that these stop resolving, every
  // assertion below would vacuously pass. Fail loudly instead.
  it('resolves three distinct surfaces per theme', () => {
    for (const { name, surfaces } of THEMES) {
      expect(surfaces.filter(Boolean), `${name} surfaces`).toHaveLength(3);
      expect(new Set(surfaces).size, `${name} surfaces are distinct`).toBe(3);
    }
  });

  it('resolves all eight guard colour families per theme', () => {
    for (const { name, src } of THEMES) {
      expect(Object.keys(guardColors(src)), `${name} guards`).toHaveLength(8);
    }
  });
});

describe('body text tokens clear AA on every surface', () => {
  for (const { name, src, surfaces } of THEMES) {
    for (const tokenName of ['--c-text', '--c-text2', '--c-text3']) {
      it(`${name}: ${tokenName}`, () => {
        const fg = token(src, tokenName);
        expect(fg, `${tokenName} not found in ${name}`).toBeTruthy();
        for (const bg of surfaces) {
          expect(contrast(fg, bg), `${tokenName} on ${bg}`).toBeGreaterThanOrEqual(AA);
        }
      });
    }
  }
});

describe('guard identity colours', () => {
  // The `text` variant is what .guard-name / .sec-label-primary /
  // .settings-guard-name render through, via --guard-color-text.
  for (const { name, src, surfaces } of THEMES) {
    it(`${name}: every guard's text variant clears AA on every surface`, () => {
      const failures = [];
      for (const [family, colors] of Object.entries(guardColors(src))) {
        for (const bg of surfaces) {
          const ratio = contrast(colors.text, bg);
          if (ratio < AA) failures.push(`${family} ${colors.text} on ${bg} = ${ratio.toFixed(2)}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('the text rules use --guard-color-text, and the decoration rules use --guard-color', () => {
    // The original bug in one assertion: text rendered through the border
    // colour. Keep these two roles apart.
    const textRules = ['.guard-name', '.sec-label-primary', '.settings-guard-header'];
    for (const selector of textRules) {
      const body = CSS.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(body, `${selector} not found`).toBeTruthy();
      const colorLine = body.match(/(?<!-)color:\s*([^;]+);/)?.[1] ?? '';
      expect(colorLine, `${selector} should render text through --guard-color-text`)
        .toContain('--guard-color-text');
    }
    // The card's top border and the section pip keep the identity colour.
    expect(CSS).toMatch(/\.guard-card\s*\{[^}]*border-top:[^;]*--guard-color[,)]/);
  });
});

describe('active pills do not put white on a mid-tone fill', () => {
  // Literal #fff on the solid brand/red measured 2.70:1 and 2.20:1 in dark
  // mode. Active states use the tinted-bg + dark-text pairing instead.
  const pills = [
    ['.craft-star-pill--active',    '--c-brand-bg', '--c-brand-text'],
    ['.craft-star-pill--ft-active', '--c-red-bg',   '--c-red-text'],
  ];

  for (const [selector, bgToken, fgToken] of pills) {
    it(`${selector} pairs ${fgToken} with ${bgToken} and clears AA in both themes`, () => {
      const body = CSS.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(body, `${selector} not found`).toBeTruthy();
      expect(body).not.toMatch(/color:\s*#fff/i);
      expect(body).toContain(bgToken);
      expect(body).toContain(fgToken);

      for (const { name, src } of THEMES) {
        const bg = token(src, bgToken);
        const fg = token(src, fgToken);
        expect(contrast(fg, bg), `${selector} in ${name}`).toBeGreaterThanOrEqual(AA);
      }
    });
  }
});

describe('no rule hard-codes white on a base colour fill', () => {
  // Catches the pattern generally rather than the two known instances.
  it('no `background: var(--c-brand|--c-red)` rule also sets color: #fff', () => {
    const offenders = [];
    for (const m of CSS.matchAll(/^([.#][\w-]+[^{]*)\{([^}]*)\}/gm)) {
      const [, selector, body] = m;
      if (!/background:\s*var\(--c-(brand|red|green)\)/.test(body)) continue;
      if (/color:\s*#fff/i.test(body)) offenders.push(selector.trim());
    }
    expect(offenders).toEqual([]);
  });
});
