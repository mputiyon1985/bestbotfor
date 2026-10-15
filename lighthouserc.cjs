const port = process.env.LHCI_PORT || '4321'
const base = `http://127.0.0.1:${port}`
const chromeFlags = '--no-sandbox --disable-dev-shm-usage --headless=new'

module.exports = {
  ci: {
    collect: {
      url: [`${base}/`, `${base}/best/coding`, `${base}/tools/cursor`],
      startServerCommand: `npx next start --port ${port}`,
      startServerReadyPattern: 'Ready',
      startServerReadyTimeout: 120000,
      numberOfRuns: 1,
      settings: {
        chromeFlags,
        ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
