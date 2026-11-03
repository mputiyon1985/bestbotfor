const port = process.env.LHCI_PORT || '4321'
const base = `http://127.0.0.1:${port}`

/** Home-only paint budget. Inner pages are scored by category in lighthouserc.cjs. */
module.exports = {
  ci: {
    collect: {
      url: [`${base}/`],
      // Quiet runs of / are about 1.9s. A busy runner can put all three samples
      // near 2.3s (2026-11-03, best 2306ms) while the performance score stays
      // above 0.95. Optimistic aggregation uses the best sample.
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      },
    },
    assert: {
      aggregationMethod: 'optimistic',
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2499 }],
        'total-blocking-time': ['error', { maxNumericValue: 229 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
