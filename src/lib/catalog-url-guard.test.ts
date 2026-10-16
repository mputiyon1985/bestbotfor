import { describe, expect, it } from 'vitest'
import { CATALOG_REJECT_PATH } from './catalog-path'
import { installCatalogUrlGuard } from './catalog-url-guard'

describe('installCatalogUrlGuard', () => {
  it('stops encoded dot segments from collapsing to the home page', () => {
    installCatalogUrlGuard()
    expect(new URL('http://127.0.0.1:3000/go/%2e%2e').pathname).toBe(CATALOG_REJECT_PATH)
    expect(new URL('/best/%2e%2e', 'http://127.0.0.1:3000').pathname).toBe(CATALOG_REJECT_PATH)
    expect(new URL('/tools/%2e%2e/', 'http://127.0.0.1:3000').pathname).toBe(CATALOG_REJECT_PATH)
    expect(new URL('http://127.0.0.1:3000/go/foo/../../../').pathname).toBe(CATALOG_REJECT_PATH)
    expect(URL.parse('http://127.0.0.1:3000/go/%2E%2E')?.pathname).toBe(CATALOG_REJECT_PATH)
  })

  it('leaves ordinary catalog and site URLs unchanged', () => {
    installCatalogUrlGuard()
    expect(new URL('http://127.0.0.1:3000/go/chatgpt').pathname).toBe('/go/chatgpt')
    expect(new URL('http://127.0.0.1:3000/best/coding').pathname).toBe('/best/coding')
    expect(new URL('http://127.0.0.1:3000/tools/github-copilot').pathname).toBe('/tools/github-copilot')
    expect(new URL('http://127.0.0.1:3000/tools?page=2').pathname).toBe('/tools')
    expect(new URL('http://127.0.0.1:3000/').pathname).toBe('/')
    expect(new URL('https://chatgpt.com/').href).toBe('https://chatgpt.com/')
  })
})
