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
      // Faults are denied unless the runtime is explicitly preview or NODE_ENV=test.
      VERCEL_ENV: 'preview',
      RESULT_FAULTS: '1',
      // Preview would enable user ratings if this were "on". E2E keeps the flag off.
      USER_RATINGS: '',
      // Boot runs the review-secret validator. These are test keys, distinct from each other.
      RATE_LIMIT_HMAC_SECRET: 'playwright-rate-limit-hmac-secret-48b',
      REVIEW_IP_HMAC_SECRET: 'playwright-review-ip-hmac-secret-48b!',
      REVIEW_IP_HMAC_KEY_ID: 'k1',
      REVIEW_IP_HMAC_SECRET_PREVIOUS: '',
      REVIEW_IP_HMAC_KEY_ID_PREVIOUS: '',
      BBF_E2E_HOOKS: '',
      NEXT_PUBLIC_SITE_URL: siteUrl,
      NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-TESTCONSENT',
    },
  },
})
