import { defineConfig, devices } from '@playwright/test'

const databaseUrl = process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
const e2eStripeKey = ['sk', 'test', 'e2e', 'placeholder'].join('_')
const e2eWebhookSecret = ['whsec', 'e2e', 'placeholder'].join('_')

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
    command: 'tsx scripts/e2e-server.ts',
    url: siteUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      TURSO_DATABASE_URL: databaseUrl,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
      RESULT_FAULTS: '1',
      NEXT_PUBLIC_SITE_URL: siteUrl,
      NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-TESTCONSENT',
      STRIPE_SECRET_KEY: e2eStripeKey,
      STRIPE_WEBHOOK_SECRET: e2eWebhookSecret,
      STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
      STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
      STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
      STRIPE_API_HOST: '127.0.0.1',
      STRIPE_API_PORT: '12111',
      STRIPE_ALLOW_LIVE: 'false',
    },
  },
})
