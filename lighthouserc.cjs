const port = process.env.LHCI_PORT || '4321'
const base = `http://127.0.0.1:${port}`

module.exports = {
  ci: {
    collect: {
      url: [
        `${base}/`,
        `${base}/best/coding`,
        `${base}/best/seo`,
        `${base}/tools`,
        `${base}/tools/chatgpt`,
      ],
      // Three runs per URL. The median (below) is the gate, so one outlier
      // does not pass or fail the URL by itself.
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      },
    },
    assert: {
      // Median of the three runs per URL. Performance is not gated here:
      // scripts/check-lighthouse.ts compares this branch to main on the same
      // runner (within 0.02, and at least 0.95 when main itself clears 0.95).
      aggregationMethod: 'median',
      assertions: {
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
