/**
 * syncStatus.js
 *
 * Presentation for `useSupabaseSync`'s status enum, in one place.
 *
 * Two consumers — the campaign pill in `App.jsx` and `SyncBadge` in
 * `SettingsPanel.jsx` — previously kept their own maps, held in agreement by a
 * "matches SyncBadge in SettingsPanel" comment. That is the same kind of
 * hand-maintained correspondence that let the tab strip ship with a dead
 * active-state rule, so it lives here instead and both import it. It is a plain
 * constant module rather than an export from a component file, matching
 * `data/buildings.js`: a component module that also exports constants trips
 * `react-refresh/only-export-components` and can't be asserted against directly.
 *
 * Three fields, and the split between them is load-bearing:
 *
 *   dot    the status colour, used for a 7px circle. Decoration, so the base
 *          semantic colour is fine.
 *   text   the same status as *text*. It must clear WCAG AA at 12px, and the
 *          base colours do not: --c-red measures 3.93:1 and --c-brand 4.02:1
 *          on a light surface. Same split as --guard-color / --guard-color-text.
 *   phrase the accessible-name fragment for the campaign pill. Without it the
 *          only signal that sync is broken is a colour, which a screen reader
 *          cannot convey — and the pill's old label ("Connected to campaign
 *          WOLF-7F3K9Q") actively contradicted it.
 *
 * `disabled` is not a state the sync machine enters; it is derived by
 * `useSupabaseSync` when there is no Supabase client at all. Without it the
 * status sits on 'idle' — painted green and labelled "Synced" — while nothing
 * syncs. That is reachable in the field: `campaignId` is restored from
 * localStorage independently of the client, so a deploy that loses its Supabase
 * env vars leaves every returning player with a stored campaign code and a
 * green "Synced" pill.
 */

export const SYNC_STATUS = {
  idle: {
    label: 'Synced',
    dot:   'var(--c-green)',
    text:  'var(--c-green-text)',
    phrase: 'synced',
  },
  syncing: {
    label: 'Syncing…',
    dot:   'var(--c-brand)',
    text:  'var(--c-brand-ink)',
    phrase: 'syncing',
  },
  offline: {
    label: 'Offline',
    dot:   'var(--c-text2)',
    text:  'var(--c-text2)',
    phrase: 'offline, changes will send when you reconnect',
  },
  error: {
    label: 'Sync error',
    dot:   'var(--c-red)',
    text:  'var(--c-red-text)',
    phrase: 'sync error',
  },
  disabled: {
    label: 'Not syncing',
    dot:   'var(--c-red)',
    text:  'var(--c-red-text)',
    phrase: 'not syncing, multiplayer is unavailable in this build',
  },
};

/**
 * Look up a status, falling back to a neutral rendering that shows the raw
 * value rather than an empty badge. A status this module has not heard of is a
 * programming error, but it should still be legible on screen when it happens.
 */
export function syncStatusView(status) {
  return SYNC_STATUS[status] ?? {
    label: String(status),
    dot:   'var(--c-text2)',
    text:  'var(--c-text2)',
    phrase: String(status),
  };
}
