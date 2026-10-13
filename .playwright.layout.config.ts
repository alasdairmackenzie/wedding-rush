import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5301', hasTouch: true },
  webServer: {
    command: 'npm run dev -- --port 5301',
    url: 'http://127.0.0.1:5301',
    reuseExistingServer: false,
    env: { ADMIN_TOKEN: 'test-admin-token' },
  },
});
