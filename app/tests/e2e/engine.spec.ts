import { test, expect } from '@playwright/test';

// Phase 3 §10: the engine runs in a Web Worker in a real browser, served with COOP/COEP, never blocking the UI.
test('Stockfish worker boots under COOP/COEP and finds a mate in one', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  const result = await page.evaluate(
    () =>
      new Promise<{ uciok: boolean; best: string; mate: boolean }>((resolve, reject) => {
        const w = new Worker('/engine/stockfish-19-lite-single.js');
        const seen = { uciok: false, best: '', mate: false };
        w.onmessage = (e) => {
          for (const l of String(e.data).split('\n')) {
            if (l === 'uciok') seen.uciok = true;
            if (l.includes('score mate 1')) seen.mate = true;
            if (l.startsWith('bestmove')) {
              seen.best = l.split(' ')[1];
              w.terminate();
              resolve(seen);
            }
          }
        };
        w.onerror = (e) => reject(new Error(String(e.message)));
        w.postMessage('uci');
        w.postMessage('position fen 6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
        w.postMessage('go depth 8');
      }),
  );
  expect(result).toEqual({ uciok: true, best: 'a1a8', mate: true });
});
