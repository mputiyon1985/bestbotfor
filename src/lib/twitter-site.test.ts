import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pageMetadata } from './metadata'
import { resultMissMetadata } from './result-http'
import { TWITTER_SITE } from './site'

describe('twitter:site', () => {
  it('is @bestbotfor on the root, every pageMetadata page, and the result miss page', () => {
    expect(TWITTER_SITE).toBe('@bestbotfor')
    const twitter = (m: { twitter?: unknown }) => m.twitter as { site?: string } | undefined
    for (const file of ['src/app/layout.tsx', 'src/app/not-found.tsx']) {
      expect(readFileSync(path.join(process.cwd(), file), 'utf8'), file).toContain('site: TWITTER_SITE')
    }
    expect(twitter(pageMetadata({ title: 'T', description: 'D', path: '/best/music' }))?.site).toBe('@bestbotfor')
    expect(twitter(resultMissMetadata())?.site).toBe('@bestbotfor')
  })
})
