import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

async function axeClean(page: Page, label: string) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    bad.map(
      (v) =>
        `${label} ${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 4)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

// M1 flow: onboarding with a pasted PGN -> background import + review -> baseline report -> Home -> Review.
const dir = 'tests/fixtures/pgn';
const pgn = readdirSync(dir)
  .filter((f) => /^game_|castle|checkmate|promotion\.|resignation|draw/.test(f))
  .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
  .join('\n\n');

test('onboarding -> baseline -> home -> review (real engine in a worker)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/#/onboarding');
  await expect(page.getByRole('heading', { name: 'What to expect' })).toBeVisible();
  await axeClean(page, 'onboarding-welcome');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Platform').selectOption('pgn');
  await page.getByLabel('PGN', { exact: true }).fill(pgn);
  await page.getByLabel('Your name in these games').fill('amarkelotra');
  await page.getByRole('button', { name: 'Import and review my games' }).click();

  // rules check (answer all with the first option; some will be wrong on purpose) then skip think-aloud
  await expect(page.getByRole('heading', { name: 'Quick rules check' })).toBeVisible();
  for (let i = 1; i <= 8; i++) await page.locator(`input[name="r${i}"]`).first().check();
  await page.getByRole('button', { name: 'Check my answers' }).click();
  await expect(page.getByText(/of 8 right/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip this part' }).click();

  await expect(page.getByRole('heading', { name: 'Baseline report' })).toBeVisible();
  await expect(page.getByText('Blunders per 40 moves')).toBeVisible({ timeout: 200_000 });
  await page.getByRole('button', { name: 'Go to Home' }).click();

  await expect(page.getByText(/games imported/)).toBeVisible();
  await expect(page.getByText('Recent games & first meaningful mistake')).toBeVisible();
  await axeClean(page, 'home');

  await page.goto('/#/review');
  await page.locator('.glist .it').first().click();
  await expect(page.getByRole('heading', { name: 'Game Review' })).toBeVisible();
  await expect(page.locator('#mv .m').first()).toBeVisible();
  await axeClean(page, 'review');
  // keyboard navigation moves through the game
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mv .m.cur')).toHaveCount(1);
});
