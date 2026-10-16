const port = process.env.LHCI_PORT || '4321'
const base = `http://127.0.0.1:${port}`

module.exports = {
  ci: {
    collect: {
      url: [
        `${base}/`,
        `${base}/result?task=chat&view=all`,
        `${base}/result?task=seo&view=all`,
        `${base}/best/coding`,
        `${base}/tools`,
        `${base}/tools/chatgpt`,
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
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
