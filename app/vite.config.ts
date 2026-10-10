import { defineConfig } from 'vitest/config';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Writes dist/precache.json listing every built file so the service worker can cache the whole app for offline use. */
const precacheManifest = {
  name: 'precache-manifest',
  closeBundle() {
    const root = 'dist';
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) =>
        statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [relative(root, join(d, f))],
      );
    try {
      writeFileSync(
        join(root, 'precache.json'),
        JSON.stringify(walk(root).filter((f) => f !== 'precache.json' && f !== 'sw.js' && f !== '_headers')),
      );
    } catch {
      /* dist missing in test runs */
    }
  },
};

// COOP/COEP are sent by the dev/preview servers so Stockfish can use threads when available.
// Phase 1 §6: the app must still work when these headers are absent (single-thread fallback).
// Basic CSP (docs/backend/09 §4, personal use keeps the basics only): no remote scripts, only the three APIs we call.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://lichess.org https://api.chess.com https://api.groq.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const isolation = {
  'Content-Security-Policy': csp,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [precacheManifest],
  server: {
    port: 5173,
    headers: Object.fromEntries(Object.entries(isolation).filter(([k]) => k !== 'Content-Security-Policy')),
  }, // dev server injects inline scripts
  preview: { port: 4173, headers: isolation },
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
