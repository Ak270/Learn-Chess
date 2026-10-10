import { test, expect } from '@playwright/test';
import { axeClean, dbRead, playMove } from './helpers';

test('M4: openings drill with a why, model game pause, flash position', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#/openings');
  await expect(page.getByRole('heading', { name: 'Openings', level: 1 })).toBeVisible();
  await axeClean(page, 'openings');
  await page.locator('[data-add="w-italian"]').click();
  await expect(page.getByRole('link', { name: /Drill \d+ due/ }).first()).toBeVisible();
  await page
    .getByRole('link', { name: /Drill \d+ due/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'What do you play?' })).toBeVisible();
  await playMove(page, '#bd', 'e2e4', 'w');
  await expect(page.getByText('Take the centre')).toBeVisible();
  await page.getByRole('button', { name: 'Good' }).click();
  const cards = await dbRead<{ kind: string; srs: { scheduler: string; reps?: number }; state: string }>(page, 'cards');
  expect(cards.filter((c) => c.kind === 'opening').length).toBeGreaterThanOrEqual(5);
  expect(cards.some((c) => c.kind === 'opening' && c.srs.scheduler === 'fsrs' && c.state !== 'new')).toBe(true);

  await page.goto('/#/learn/game/mg-legal');
  await page.getByRole('button', { name: /Next move/ }).click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: /Next move/ }).click();
  await expect(page.getByText('Pause')).toBeVisible();
  await page.getByLabel('What is attacked? What do they threaten?').check();
  await page.getByRole('button', { name: 'Show what happened' }).click();
  await expect(page.getByText('What happened')).toBeVisible();
  await axeClean(page, 'model-game');

  await page.goto('/#/puzzles');
  await page.getByRole('button', { name: /Flash position/ }).click();
  await expect(page.getByRole('heading', { name: 'Flash position' })).toBeVisible();
});
