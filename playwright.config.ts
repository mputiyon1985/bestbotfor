import { defineConfig, devices } from '@playwright/test'

const databaseUrl = process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
const ratingsOnUrl = 'http://127.0.0.1:3001'
const sitePort = new URL(siteUrl).port || '3000'

const sharedEnv = {
  ...process.env,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
  // Faults are denied unless VERCEL_ENV is development or test.
  // npm start sets NODE_ENV=production, so the servers below set VERCEL_ENV=test.
  VERCEL_ENV: 'test',
  RESULT_FAULTS: '1',
  // The two-process /result burst shares one file and needs the longer budget.
  RESULT_SHARED_LIMIT_MS: '800',
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-TESTCONSENT',
  // Boot runs the review-secret validator. These are test keys, distinct from each other.
  // The flag-on server sets USER_RATINGS=on, so the review secret and key id are required.
  RATE_LIMIT_HMAC_SECRET: 'playwright-rate-limit-hmac-secret-37b',
  REVIEW_IP_HMAC_SECRET: 'playwright-review-ip-hmac-secret-37b!',
  REVIEW_IP_HMAC_KEY_ID: 'k1',
  REVIEW_IP_HMAC_SECRET_PREVIOUS: '',
  REVIEW_IP_HMAC_KEY_ID_PREVIOUS: '',
  BBF_E2E_HOOKS: '',
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/user-ratings-on.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: siteUrl },
    },
    {
      name: 'ratings-on',
      testMatch: '**/user-ratings-on.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: ratingsOnUrl },
    },
  ],
  webServer: [
    {
      command: 'tsx scripts/prepare-db.ts && npm run start',
      url: siteUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: sitePort,
        TURSO_DATABASE_URL: databaseUrl,
        // Blank keeps user ratings off. VERCEL_ENV=test still allows result faults.
        USER_RATINGS: '',
        NEXT_PUBLIC_SITE_URL: siteUrl,
      },
    },
    {
      command: 'tsx scripts/prepare-db.ts && npm run start',
      url: ratingsOnUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: '3001',
        TURSO_DATABASE_URL: 'file:./data/e2e-ratings-on.db',
        USER_RATINGS: 'on',
        NEXT_PUBLIC_SITE_URL: ratingsOnUrl,
      },
    },
  ],
})
