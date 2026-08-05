import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
  // Use the automatic JSX runtime for esbuild's transform too (not just
  // @vitejs/plugin-react's Babel pass). During `vite build` this is a no-op —
  // plugin-react transforms JSX first and esbuild only sees plain JS — but it
  // lets Vitest import JSX-authored components (e.g. Autocomplete) without a
  // bare `import React`, which the lint config forbids.
  esbuild: { jsx: 'automatic' },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy third-party deps out of the app bundle (AVE-292).
        // Supabase and Sentry rarely change and can be cached independently,
        // and keeping them out of the entry chunk trims first paint.
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
      include: ['src/hooks/gameReducers.js', 'src/data/recipes.js'],
    },
  },
});
