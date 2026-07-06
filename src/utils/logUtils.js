import { createElement } from 'react';
import { GUARD_COLOR_MAP, PARTY_TERMS } from '../data/constants';

const ALL_GUARD_NAMES  = Object.keys(GUARD_COLOR_MAP);
const GUARD_NAME_SPLIT_REGEX = new RegExp(`\\b(${[...ALL_GUARD_NAMES, ...PARTY_TERMS].join('|')})\\b`, 'g');

export function colorizeLogMessage(message) {
  const parts = message.split(GUARD_NAME_SPLIT_REGEX);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const color = GUARD_COLOR_MAP[part];
    if (!color) return createElement('strong', { key: i }, part);
    return createElement('span', { key: i, className: `log-name-${color.key}` }, part);
  });
}
