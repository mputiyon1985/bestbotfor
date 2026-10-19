const port = process.env.LHCI_PORT || '4321'
const base = `http://127.0.0.1:${port}`

/**
 * Quiz URLs and every match list (view=all) are noindex, follow; match lists
 * canonicalize to /best/<task>.
 * Lighthouse CI cannot assert a maximum audit score, so crawl policy is
 * checked in scripts/check-lighthouse.ts. These runs still have to clear
 * performance, accessibility, and best-practices.
 */
module.exports = {
  ci: {
    collect: {
      url: [
        `${base}/result?task=chat&budget=any&skill=beginner`,
        `${base}/result?task=seo&budget=free&skill=beginner`,
        `${base}/result?task=chat&view=all`,
        `${base}/result?task=seo&view=all&budget=free`,
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
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
