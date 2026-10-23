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
      // Three runs per URL, gated on the median (below). One run let a single
      // noisy CI sample at 0.94 fail the 0.95 bar.
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      },
    },
    assert: {
      // Median of the three runs per URL. LHCI's default is optimistic (the best
      // run for minScore), which would quietly loosen the bar.
      aggregationMethod: 'median',
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
