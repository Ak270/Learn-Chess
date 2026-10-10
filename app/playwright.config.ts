import { defineConfig } from '@playwright/test';

// Locally the pre-installed Chromium is reused (do not run `playwright install`): set PW_CHROMIUM to its path.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: true, timeout: 120000 },
  use: { baseURL: 'http://localhost:4173', launchOptions: { executablePath } },
});
