import { test, expect } from '@playwright/test';
import { axeClean, dbRead, playMove, seedGames } from './helpers';

test('M2: lesson, Blunder Box card, session plan, puzzles, profile, progress', async ({ page }) => {
  test.setTimeout(300_000);
  await seedGames(page);
  await axeClean(page, 'home');

  // ---- Learn: play the first lesson through ----
  await page.goto('/#/learn');
  await expect(page.getByRole('heading', { name: 'Learn', level: 1 })).toBeVisible();
  await axeClean(page, 'learn');
  await page.locator('.lesson-row', { hasText: 'The Safety Check' }).click();
  await page.getByRole('button', { name: 'Next' }).click(); // text -> board
  await page.getByRole('button', { name: 'Next' }).click(); // board -> interactive
  await playMove(page, '#bd', 'd1d5', 'w');
  await expect(page.getByText('Nothing could recapture')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('it is attacked and can be taken without loss to the attacker').check();
  await page.getByRole('button', { name: 'Check my answer' }).click();
  await page.getByRole('button', { name: 'Finish lesson' }).click();
  await expect(page.locator('.lesson-row.done')).toHaveCount(1);

  // ---- Blunder Box: solve a real card from the learner's own game ----
  await page.goto('/#/blunders');
  await expect(page.getByRole('heading', { name: 'Blunder Box', level: 1 })).toBeVisible();
  await axeClean(page, 'blunders');
  const cards = await dbRead<{ id: string; fen: string; solution: string[]; kind: string }>(page, 'cards');
  const card = cards.find((c) => c.kind === 'blunder')!;
  expect(card).toBeTruthy();
  await page.goto(`/#/blunders/${card.id}`);
  await expect(page.locator('#pz-bd')).toBeVisible();
  const go = page.getByRole('button', { name: /I've looked/ });
  if (await go.count()) await go.click();
  const turn = card.fen.split(' ')[1] as 'w' | 'b';
  await playMove(page, '#pz-bd', card.solution[0], turn);
  await expect(page.getByText('Clean solve')).toBeVisible();
  await expect(page.getByText('Returns in 1 day.')).toBeVisible();
  const after = (await dbRead<{ id: string; srs: { step: number; cleanStreak: number } }>(page, 'cards')).find(
    (c) => c.id === card.id,
  )!;
  expect(after.srs.step).toBe(1);
  expect(after.srs.cleanStreak).toBe(1);
  expect((await dbRead(page, 'attempts')).length).toBeGreaterThan(0);

  // ---- Session: a real plan with the six blocks and a reason ----
  await page.goto('/#/session');
  await expect(page.getByRole('heading', { name: "Today's Session" })).toBeVisible();
  await expect(page.getByText('Why this focus?')).toBeVisible();
  const plans = await dbRead<{ blocks: { id: string }[]; focusSkill: string }>(page, 'plans');
  expect(plans.length).toBe(1);
  expect(plans[0].blocks.map((b) => b.id)).toEqual(['recall', 'lesson', 'drills', 'play', 'test', 'note']);
  await axeClean(page, 'session');

  // ---- Puzzles: shards load and the board appears ----
  await page.goto('/#/puzzles');
  await page.getByRole('button', { name: /Start \d+ puzzles/ }).click();
  await expect(page.locator('#pz-bd')).toBeVisible({ timeout: 20_000 });
  await axeClean(page, 'puzzle');
  const looked = page.getByRole('button', { name: /I've looked/ });
  if (await looked.count()) await looked.click();
  await page.getByRole('button', { name: /Hint/ }).click();
  await expect(page.getByText('Hint 1')).toBeVisible();

  // ---- Profile and Progress ----
  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await axeClean(page, 'profile');
  await page.goto('/#/progress');
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await axeClean(page, 'progress');
});
