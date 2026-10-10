import { test, expect } from '@playwright/test';

// Phase 9 §3-4: the CSP is enforced with no violations, and the installed app reopens offline.
test('CSP has no violations and the app reopens offline after the first visit', async ({ page, context }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // give the worker a moment to cache the shell and the engine
    await new Promise((r) => setTimeout(r, 1500));
  });
  // touch the engine path so it is certainly cached
  expect(await page.evaluate(async () => (await fetch('/engine/stockfish-19-lite-single.wasm')).ok)).toBe(true);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const cached = await page.evaluate(
    async () => (await caches.match('/engine/stockfish-19-lite-single.js')) !== undefined,
  );
  expect(cached).toBe(true);
  await context.setOffline(false);
  expect(problems).toEqual([]);
});
