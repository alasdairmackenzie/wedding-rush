import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5300', hasTouch: true },
  webServer: {
    command: 'npm run dev -- --port 5300',
    url: 'http://127.0.0.1:5300',
    reuseExistingServer: false,
    env: { ADMIN_TOKEN: 'test-admin-token' },
  },
});
