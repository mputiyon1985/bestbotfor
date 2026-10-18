import { describe, expect, it } from 'vitest'
import { CLIENT_BUNDLE_FORBIDDEN, clientBundleHits, scrubClientBundleText } from './client-bundle'

const LIVE_PUBLISHABLE = ['pk_', 'live_'].join('')
const CLERK_FORMAT = ['pk_', 'test_', '... or ', 'pk_', 'live_', '...'].join('')
const CLERK_MESSAGE = `The publishableKey passed to Clerk is invalid (key={{key}}, expected format: ${CLERK_FORMAT}).`

describe('client bundle scan', () => {
  it('flags a live publishable key', () => {
    const key = `${LIVE_PUBLISHABLE}51abc`
    expect(clientBundleHits(key, CLIENT_BUNDLE_FORBIDDEN)).toContain(LIVE_PUBLISHABLE)
  })

  it('ignores Clerk’s invalid-key message and still flags a real key beside it', () => {
    expect(scrubClientBundleText(CLERK_MESSAGE)).not.toContain(LIVE_PUBLISHABLE)
    expect(clientBundleHits(CLERK_MESSAGE, CLIENT_BUNDLE_FORBIDDEN)).not.toContain(LIVE_PUBLISHABLE)
    const key = `${LIVE_PUBLISHABLE}51abc`
    expect(clientBundleHits(`${CLERK_MESSAGE}\n${key}`, CLIENT_BUNDLE_FORBIDDEN)).toContain(LIVE_PUBLISHABLE)
    const prefixCheck = `C="${LIVE_PUBLISHABLE}",w="pk_test_"` + `e.startsWith("${LIVE_PUBLISHABLE}")`
    expect(clientBundleHits(prefixCheck, CLIENT_BUNDLE_FORBIDDEN)).not.toContain(LIVE_PUBLISHABLE)
    expect(clientBundleHits(`${prefixCheck}\n${key}`, CLIENT_BUNDLE_FORBIDDEN)).toContain(LIVE_PUBLISHABLE)
  })

  it('flags the Beehiiv API key name', () => {
    expect(CLIENT_BUNDLE_FORBIDDEN).toContain('BEEHIIV_API_KEY')
    expect(clientBundleHits('process.env.BEEHIIV_API_KEY', CLIENT_BUNDLE_FORBIDDEN)).toContain('BEEHIIV_API_KEY')
  })

  it('still flags secret and live secret prefixes', () => {
    expect(clientBundleHits('sk_' + 'live_51abc', CLIENT_BUNDLE_FORBIDDEN)).toContain('sk_' + 'live_')
    expect(clientBundleHits('whsec_abc', CLIENT_BUNDLE_FORBIDDEN)).toContain('whsec_')
  })
})
