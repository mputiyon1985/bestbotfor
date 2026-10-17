import { defineConfig, devices } from '@playwright/test'

const databaseUrl = process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
const ratingsOnUrl = 'http://127.0.0.1:3001'
const sitePort = new URL(siteUrl).port || '3000'

const sharedEnv = {
  ...process.env,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
  // Faults are denied unless the runtime is explicitly preview or NODE_ENV=test.
  // npm start sets NODE_ENV=production. Preview still allows the ratings flag.
  VERCEL_ENV: 'preview',
  RESULT_FAULTS: '1',
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-TESTCONSENT',
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
        // Preview would enable user ratings if this were "on". This server keeps the flag off.
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
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SITE_URL: ratingsOnUrl,
      },
    },
  ],
})
