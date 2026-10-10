import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, readdirSync } from 'node:fs';

const dir = 'tests/fixtures/pgn';
export const FIXTURE_PGN = readdirSync(dir)
  .filter((f) => /^game_|castle|checkmate|promotion\.|resignation|draw/.test(f))
  .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
  .join('\n\n');

/** Onboarding with a pasted PGN, waits for the baseline report, lands on Home. */
export async function seedGames(page: Page) {
  await page.goto('/#/onboarding');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Platform').selectOption('pgn');
  await page.getByLabel('PGN', { exact: true }).fill(FIXTURE_PGN);
  await page.getByLabel('Your name in these games').fill('amarkelotra');
  await page.getByRole('button', { name: 'Import and review my games' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Skip this part' }).click();
  await expect(page.getByText('Blunders per 40 moves')).toBeVisible({ timeout: 200_000 });
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.getByText('games imported')).toBeVisible();
}

/** Click-to-move on a board element: from/to are algebraic squares; orientation is the board's bottom colour. */
export async function playMove(page: Page, boardSel: string, uci: string, orientation: 'w' | 'b') {
  const box = (await page.locator(boardSel).boundingBox())!;
  const sq = box.width / 8;
  const at = (s: string) => {
    const f = 'abcdefgh'.indexOf(s[0]);
    const r = Number(s[1]) - 1;
    const col = orientation === 'w' ? f : 7 - f;
    const row = orientation === 'w' ? 7 - r : r;
    return { x: box.x + col * sq + sq / 2, y: box.y + row * sq + sq / 2 };
  };
  const a = at(uci.slice(0, 2));
  const b = at(uci.slice(2, 4));
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
}

/** Read one value from the app's IndexedDB (tests only). */
export async function dbRead<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    (t) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('mentor');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(t).objectStore(t).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
    table,
  ) as Promise<T[]>;
}

/** 0 critical/serious axe violations; waits only for finite animations (decorative loops never end). */
export async function axeClean(page: Page, label: string) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  );
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    bad.map(
      (v) =>
        `${label} ${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}
