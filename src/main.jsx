import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx'
import { installChunkReloadHandler } from './utils/chunkReload';
import { reportUpdateReady } from './utils/swUpdate';

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    integrations: [],
  });
}

// Recover from a lazy tab whose chunk hash no longer exists (see chunkReload.js
// and swUpdate.js). Installed before render so it is listening by the time the
// player can tap a tab.
installChunkReloadHandler();

// A standalone PWA on a table can go hours without a navigation, and the update
// check otherwise only runs on one. Without this the prompt would essentially
// never appear for exactly the players the stale-chunk failure hits hardest.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// `registerType: 'prompt'` in vite.config.js — the new worker waits instead of
// claiming the running page, so this session's already-referenced chunks stay
// served by the old precache until the player accepts.
const updateSW = registerSW({
  onNeedRefresh() {
    reportUpdateReady(() => updateSW(true));
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => {
      // Rejects offline, which is normal and not worth surfacing.
      registration.update().catch(() => {});
    }, UPDATE_CHECK_INTERVAL_MS);
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
