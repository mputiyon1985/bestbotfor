import { defineConfig, devices } from '@playwright/test'

const databaseUrl = process.env.TURSO_DATABASE_URL || 'file:./data/e2e.db'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
const ratingsOnUrl = 'http://127.0.0.1:3001'
const sponsorsOnUrl = 'http://127.0.0.1:3002'
const freePlanHooksUrl = 'http://127.0.0.1:3003'
const foundingCapUrl = 'http://127.0.0.1:3004'
const sitePort = new URL(siteUrl).port || '3000'
const e2eStripeKey = ['sk', 'test', 'e2e', 'placeholder'].join('_')
const e2eWebhookSecret = ['whsec', 'e2e', 'placeholder'].join('_')

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

/**
 * Every STRIPE_* name from the parent env set to '' (an explicit blank, so it
 * also wins over anything inherited), plus the two keys stripeKeyMode reads.
 * A blank STRIPE_SECRET_KEY is not an allowed key, so the server is keyless.
 */
const keylessStripeEnv: Record<string, string> = {
  ...Object.fromEntries(Object.keys(process.env).filter((key) => key.startsWith('STRIPE_')).map((key) => [key, ''])),
  STRIPE_SECRET_KEY: '',
  STRIPE_ALLOW_LIVE: '',
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
      testIgnore: ['**/user-ratings-on.spec.ts', '**/admin-sponsors-on.spec.ts', '**/free-pages-hooks.spec.ts', '**/founding-cap.spec.ts', '**/sponsor-unconfigured.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: siteUrl },
    },
    {
      name: 'ratings-on',
      testMatch: '**/user-ratings-on.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: ratingsOnUrl },
    },
    {
      name: 'sponsors-on',
      testMatch: '**/admin-sponsors-on.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: sponsorsOnUrl },
    },
    {
      // BBF_E2E_HOOKS=1 lets these tests pin the free-plan clock and drop a note per request.
      name: 'free-plan-hooks',
      testMatch: '**/free-pages-hooks.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: freePlanHooksUrl },
    },
    {
      // Its own server and database file: these tests fill all 5 founding spots,
      // which would close the founding offer for the main server's sponsor tests.
      name: 'founding-cap',
      testMatch: ['**/founding-cap.spec.ts', '**/sponsor-unconfigured.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: foundingCapUrl },
    },
  ],
  webServer: [
    {
      command: 'tsx scripts/e2e-server.ts',
      url: siteUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: sitePort,
        TURSO_DATABASE_URL: databaseUrl,
        // Blank keeps user ratings off. VERCEL_ENV=test still allows result faults.
        USER_RATINGS: '',
        ADMIN_SPONSORS: '',
        NEXT_PUBLIC_SITE_URL: siteUrl,
        // This run is the loopback host. Sponsor checkout must return here, not to production.
        VERCEL_BRANCH_URL: siteUrl,
        STRIPE_SECRET_KEY: e2eStripeKey,
        STRIPE_WEBHOOK_SECRET: e2eWebhookSecret,
        STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
        STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
        STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
        STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_e2e_subscription',
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_e2e_founding_monthly',
        STRIPE_PRICE_FOUNDING_SETUP: 'price_e2e_founding_setup',
        STRIPE_API_HOST: '127.0.0.1',
        STRIPE_API_PORT: '12111',
        STRIPE_ALLOW_LIVE: 'false',
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
        ADMIN_SPONSORS: '',
        NEXT_PUBLIC_SITE_URL: ratingsOnUrl,
      },
    },
    {
      command: 'tsx scripts/prepare-db.ts && npm run start',
      url: sponsorsOnUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: '3002',
        TURSO_DATABASE_URL: 'file:./data/e2e-sponsors-on.db',
        USER_RATINGS: '',
        ADMIN_SPONSORS: 'on',
        NEXT_PUBLIC_SITE_URL: sponsorsOnUrl,
        // Keyless whatever the parent shell holds: stripeKeyMode() is off here.
        // admin-sponsors-on.spec.ts asserts /pricing shows no test-mode note.
        ...keylessStripeEnv,
      },
    },
    {
      command: 'tsx scripts/prepare-db.ts && npm run start',
      url: freePlanHooksUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: '3003',
        TURSO_DATABASE_URL: 'file:./data/e2e-free-plan-hooks.db',
        USER_RATINGS: '',
        ADMIN_SPONSORS: '',
        NEXT_PUBLIC_SITE_URL: freePlanHooksUrl,
        BBF_E2E_HOOKS: '1',
      },
    },
    {
      // Uses the Stripe mock that the main server starts on 12111. A sold-out
      // founding checkout must be refused before it reaches Stripe.
      command: 'tsx scripts/prepare-db.ts && npm run start',
      url: foundingCapUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...sharedEnv,
        PORT: '3004',
        TURSO_DATABASE_URL: 'file:./data/e2e-founding-cap.db',
        USER_RATINGS: '',
        ADMIN_SPONSORS: '',
        NEXT_PUBLIC_SITE_URL: foundingCapUrl,
        VERCEL_BRANCH_URL: foundingCapUrl,
        STRIPE_SECRET_KEY: e2eStripeKey,
        STRIPE_WEBHOOK_SECRET: e2eWebhookSecret,
        STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
        STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
        STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_e2e_founding_monthly',
        STRIPE_PRICE_FOUNDING_SETUP: 'price_e2e_founding_setup',
        STRIPE_API_HOST: '127.0.0.1',
        STRIPE_API_PORT: '12111',
        STRIPE_ALLOW_LIVE: 'false',
      },
    },
  ],
})
