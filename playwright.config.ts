import { defineConfig, devices } from '@playwright/test'

const databaseUrl = process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: siteUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'tsx scripts/prepare-db.ts && npm run start',
    url: siteUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      TURSO_DATABASE_URL: databaseUrl,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
      NEXT_PUBLIC_SITE_URL: siteUrl,
    },
  },
})
