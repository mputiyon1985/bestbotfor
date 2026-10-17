import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JsonLd } from '@/components/json-ld'
import { jsonLdScript } from './jsonld'

const malicious = '</script><script>alert(1)</script>&<>\u2028\u2029'

describe('jsonLdScript', () => {
  it('escapes a malicious field so it cannot break out of the script tag', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: malicious,
    }
    const script = jsonLdScript(data)
    expect(script).not.toContain('<')
    expect(script).not.toContain('>')
    expect(script).not.toContain('&')
    expect(script).not.toContain('\u2028')
    expect(script).not.toContain('\u2029')
    expect(script).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(script)).toMatchObject({ name: malicious })

    const markup = renderToStaticMarkup(createElement(JsonLd, { data, nonce: null }))
    const embedded = markup.match(/<script[^>]*>([\s\S]*)<\/script>/)?.[1] ?? ''
    expect(embedded).toBe(script)
    expect(embedded).not.toContain('</script><script>')
  })
})
