import { describe, expect, it } from 'vitest'
import { isUnsafeCatalogPath, isUnsafeCatalogSlug } from './catalog-path'

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
    expect(isUnsafeCatalogPath('/tools')).toBe(false)
    expect(isUnsafeCatalogPath('/tools/')).toBe(false)
    expect(isUnsafeCatalogPath('/tools?category=chat-assistant')).toBe(false)
    expect(isUnsafeCatalogPath('/tools/?category=coding')).toBe(false)
    expect(isUnsafeCatalogPath('/tools?page=2')).toBe(false)
    expect(isUnsafeCatalogPath('/tools?category=coding-assistant&page=2')).toBe(false)
    expect(isUnsafeCatalogPath('/best')).toBe(true)
    expect(isUnsafeCatalogPath('/go')).toBe(true)
    expect(isUnsafeCatalogPath('/')).toBe(false)
    expect(isUnsafeCatalogPath('/search?q=secret')).toBe(false)
  })

  it('still requires a slug for /go and /best', () => {
    expect(isUnsafeCatalogPath('/go')).toBe(true)
    expect(isUnsafeCatalogPath('/go/')).toBe(true)
    expect(isUnsafeCatalogPath('/best')).toBe(true)
    expect(isUnsafeCatalogPath('/best/')).toBe(true)
  })

  it('reads an absolute URL without letting the parser collapse dot segments', () => {
    expect(isUnsafeCatalogPath('http://127.0.0.1:3000/go/%2e%2e')).toBe(true)
    expect(isUnsafeCatalogPath('https://bestbotfor.com/best/%2e%2e')).toBe(true)
    expect(isUnsafeCatalogPath('https://bestbotfor.com/tools/%2e%2e?page=2')).toBe(true)
    expect(isUnsafeCatalogPath('https://bestbotfor.com/go/chatgpt')).toBe(false)
    expect(isUnsafeCatalogPath('https://bestbotfor.com/tools?page=2')).toBe(false)
    expect(isUnsafeCatalogPath('https://bestbotfor.com/')).toBe(false)
  })
})

describe('isUnsafeCatalogSlug', () => {
  it('rejects dot segments and keeps a normal slug', () => {
    expect(isUnsafeCatalogSlug('..')).toBe(true)
    expect(isUnsafeCatalogSlug('.')).toBe(true)
    expect(isUnsafeCatalogSlug('%2e%2e')).toBe(true)
    expect(isUnsafeCatalogSlug('%252e%252e')).toBe(true)
    expect(isUnsafeCatalogSlug('chatgpt')).toBe(false)
    expect(isUnsafeCatalogSlug('github-copilot')).toBe(false)
  })
})
