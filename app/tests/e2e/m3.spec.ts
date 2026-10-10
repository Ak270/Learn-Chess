import { test, expect } from '@playwright/test';
import { axeClean, dbRead, playMove } from './helpers';

// M3: the real opponent (Stockfish in its own worker), coach mode, interception with a question, Ask Mentor.
const BLUNDER_FEN = 'r3k2r/ppp2pp1/2np1qbp/2b1p3/2B1P1P1/2NP1N1P/PPP2P2/R2Q1RK1 w kq - 1 11'; // prototype game after 10...Bg6

test('M3: normal game vs the sparring partner, coach take-back with a question, Ask Mentor', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/#/play');
  await expect(page.getByRole('heading', { name: 'Play', level: 1 })).toBeVisible();
  await axeClean(page, 'play-lobby');

  // ---- a normal game against level 1: the opponent answers with a legal move ----
  await page.locator('[data-lv="1"]').click();
  await page.locator('#tcs button', { hasText: 'Untimed' }).click();
  await page.locator('#modes button', { hasText: 'Normal' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#bd')).toBeVisible();
  await playMove(page, '#bd', 'e2e4', 'w');
  await expect(page.locator('#pane .m')).toHaveCount(2, { timeout: 40_000 });
  await axeClean(page, 'play-game');
  const games = await dbRead<{ source: string; pgn: string }>(page, 'games');
  expect(games.some((g) => g.source === 'mentor' && g.pgn.includes('1. e4'))).toBe(true);
  await page.getByRole('button', { name: /Resign/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByText('You lost')).toBeVisible();
  await page.getByRole('button', { name: 'New game' }).click();

  // ---- coach: critical position, the learner plays Nh4?? and is asked what the opponent threatens ----
  await page.goto(`/#/play?fen=${encodeURIComponent(BLUNDER_FEN)}&mode=critical`);
  await expect(page.locator('#bd')).toBeVisible();
  await playMove(page, '#bd', 'f3h4', 'w');
  await page.getByRole('tab', { name: /Coach/ }).click();
  await expect(page.getByText('Wait, look at that move')).toBeVisible({ timeout: 40_000 });
  await axeClean(page, 'play-offer');
  await page.getByLabel(/take my knight on h4/i).check();
  await page.getByRole('button', { name: 'Answer' }).click();
  await expect(page.getByText('Take-back granted')).toBeVisible();
  const meta = (
    await dbRead<{ key: string; value: { takebacksUsed: number; interceptions: { granted: boolean }[] } }>(page, 'kv')
  )
    .filter((r) => r.key.startsWith('play.meta:'))
    .map((r) => r.value);
  expect(meta.some((m) => m.takebacksUsed === 1 && m.interceptions[0].granted)).toBe(true);

  // ---- Ask Mentor: a practice question gets an answer from the plan, with a verification label ----
  await page.getByRole('button', { name: 'Ask the teacher' }).click();
  await page.getByRole('button', { name: 'Explain forks' }).click();
  await expect(page.getByText('Verified by engine and rules')).toBeVisible({ timeout: 20_000 });
  await axeClean(page, 'teacher');
});
