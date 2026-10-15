import { describe, expect, it } from 'vitest'
import { isUnsafeCatalogPath } from './catalog-path'

describe('isUnsafeCatalogPath', () => {
  it('rejects dot-segment bypasses that the URL parser would turn into the home page', () => {
    for (const path of ['/go/%2e%2e', '/go/%2E%2E', '/go/..', '/go/%2e%2e/', '/go/foo/../../../', '/best/%2e%2e', '/tools/%2e%2e']) {
      expect(isUnsafeCatalogPath(path), path).toBe(true)
    }
  })

  it('rejects encoded slashes, nulls, double encoding, and slugs that are not lowercase', () => {
    for (const path of [
      '/go/%252e%252e',
      '/go/%2e%2e%2f%2e%2e',
      '/go/chatgpt%2fsecret',
      '/go/%00',
      '/go/chatgpt%00',
      '/go/ChatGPT',
      '/go/foo/bar',
      '/best/Not_A_Task',
      '/tools/../chatgpt',
    ]) {
      expect(isUnsafeCatalogPath(path), path).toBe(true)
    }
  })

  it('allows a single catalog slug and ignores other routes', () => {
    expect(isUnsafeCatalogPath('/go/chatgpt')).toBe(false)
    expect(isUnsafeCatalogPath('/go/chatgpt/?next=https://evil.example')).toBe(false)
    expect(isUnsafeCatalogPath('/best/coding')).toBe(false)
    expect(isUnsafeCatalogPath('/tools/github-copilot')).toBe(false)
    expect(isUnsafeCatalogPath('/')).toBe(false)
    expect(isUnsafeCatalogPath('/search?q=secret')).toBe(false)
  })
})
