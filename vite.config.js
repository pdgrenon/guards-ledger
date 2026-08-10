import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Vitest 3 runs on its own bundled Vite 7, which transforms with **esbuild**;
// `vite build` runs the Vite 8 in package.json, which transforms with **oxc**.
// The `esbuild` option below is what lets Vitest import JSX-authored components
// (e.g. Autocomplete) without a bare `import React`, which the lint config
// forbids — dropping it fails 41 tests with "React is not defined". It must not
// be set for the build, though: @vitejs/plugin-react already sets the oxc
// equivalent there, and Vite 8 warns and discards the esbuild one when both are
// present. Hence the mode gate rather than an unconditional option.
export default defineConfig(({ mode }) => ({
  ...(mode === 'test' ? { esbuild: { jsx: 'automatic' } } : {}),
  plugins: [
    react(),
    VitePWA({
      // NOT 'autoUpdate'. That emits skipWaiting() + clientsClaim() +
      // cleanupOutdatedCaches(), so a new deploy took over the page that was
      // already running and deleted the precache underneath it. The running
      // page still holds the OLD entry chunk, whose lazy() calls reference old
      // hashed filenames (AVE-292) — those were now missing from the precache
      // and 404 on the origin, since Cloudflare Pages serves only the current
      // deployment. The next tap on Crafting / Campaign / More / Settings /
      // Search died with "Failed to fetch dynamically imported module", while
      // Guards / Cities / Stash (statically bundled into the entry chunk that
      // had already downloaded) kept working. Cache-first index.html made the
      // window very wide: a backgrounded PWA can boot the stale bundle long
      // after the deploy.
      //
      // With 'prompt' the new worker waits, the old one keeps serving the old
      // precache for the whole session, and UpdateBanner lets the player take
      // the update at a moment of their choosing. Registration lives in
      // main.jsx (see injectRegister below), which is why the plugin must not
      // inject its own.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [
        'favicon.svg',
        'icons.svg',
        'apple-touch-icon.png',
        'pwa-192x192.svg',
        'pwa-512x512.svg',
      ],
      // This block is the ONLY manifest. vite-plugin-pwa generates
      // manifest.webmanifest from it and injects the link tag into index.html
      // at build time — do not add a hand-written manifest link there, and do
      // not add a public/manifest.json. A document may carry only one manifest
      // link and the user agent uses the first in tree order, so a hand-written
      // one shadows this with a 404 and the app is treated as having no
      // manifest at all: no Android install prompt, no standalone display, none
      // of the icons or colours below. iOS hides the symptom because it reads
      // the apple-mobile-web-app-* meta tags instead (AVE-939).
      manifest: {
        name: "The Guard's Ledger",
        short_name: "Guard's Ledger",
        description:
          'Campaign companion tracker for The Isofarian Guard board game',
        theme_color: '#1a1a18',
        background_color: '#1a1a18',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // `webp` matters: the eight guard portraits in public/guards/ are webp,
        // and without it they were the only referenced asset type left out of
        // the precache — offline, every guard fell back to initials (AVE-939).
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Split the heavy third-party deps out of the app bundle (AVE-292).
        // Supabase and Sentry rarely change, so giving them their own chunks
        // lets a deploy that only touches app code reuse them from cache.
        // Note this does NOT trim first paint: both are statically imported by
        // the entry graph and get a modulepreload link, so the same bytes are
        // still fetched on the initial load — the win is cache granularity on
        // repeat visits, not a smaller first download. Removing this block
        // rebuilds them into a single 577 kB entry chunk, so it is load-bearing
        // despite `codeSplitting` reading like a Rollup option that Vite 8's
        // Rolldown might ignore. It does not: verify with `npm run build`.
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'sentry', test: /node_modules[\\/]@sentry[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // All of src, not a two-file allowlist. Narrowing `include` to the two
      // best-covered modules reported 99.7% for the project while saying
      // nothing about the hooks and components that actually carry the risk —
      // a number that reads as reassurance and isn't one.
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/main.jsx'],
    },
  },
}));
