import { defineConfig } from 'vitest/config';

// COOP/COEP are sent by the dev/preview servers so Stockfish can use threads when available.
// Phase 1 §6: the app must still work when these headers are absent (single-thread fallback).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { port: 5173, headers: isolation },
  preview: { port: 4173, headers: isolation },
  build: { target: 'es2022' },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts', 'tests/integration/**/*.test.ts'] },
});
