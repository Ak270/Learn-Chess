import { test, expect } from '@playwright/test';

test('settings screen renders, persists theme across reload', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // wait until the async IndexedDB write has landed before reloading
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('mentor');
        open.onsuccess = () => {
          const req = open.result.transaction('kv').objectStore('kv').get('settings.v1');
          req.onsuccess = () => resolve(req.result?.value?.theme === 'light');
          req.onerror = () => resolve(false);
        };
        open.onerror = () => resolve(false);
      }),
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
