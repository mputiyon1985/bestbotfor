import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

describe('tool redirects', () => {
  it('permanently redirects /tools/devin-desktop to /tools/windsurf with 301', async () => {
    if (!nextConfig.redirects) throw new Error('next config is missing redirects')
    const redirects = await nextConfig.redirects()
    expect(redirects).toContainEqual({
      source: '/tools/devin-desktop',
      destination: '/tools/windsurf',
      statusCode: 301,
    })
  })
})
