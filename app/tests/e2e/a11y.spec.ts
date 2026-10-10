import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Phase 9 §1: 0 critical/serious violations on every migrated screen.
for (const route of ['settings']) {
  for (const theme of ['dark', 'light']) {
    test(`a11y: ${route} (${theme})`, async ({ page }) => {
      await page.goto(`/#/${route}`);
      if (theme === 'light') await page.getByRole('button', { name: 'Light' }).click();
      // let entrance animations finish so axe measures final colours, not mid-fade blends
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
      const r = await new AxeBuilder({ page }).analyze();
      const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}
