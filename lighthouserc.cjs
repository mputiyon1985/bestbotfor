const port = process.env.LHCI_PORT || '4321'

module.exports = {
  ci: {
    collect: {
      url: [`http://127.0.0.1:${port}/`],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2099 }],
        'total-blocking-time': ['error', { maxNumericValue: 229 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
