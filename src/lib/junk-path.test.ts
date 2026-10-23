import { describe, expect, it } from 'vitest'
import { isJunkPath, normalizeProbePath } from './junk-path'

describe('isJunkPath', () => {
  it.each(['/wp-admin', '/wp-login.php', '/wp-content/plugins/x.js', '/index.php', '/a/b/shell.php7', '/xmlrpc.php', '/.env', '/.env.local', '/api/.env', '/.git/config', '/cgi-bin/test', '/default.aspx', '/WP-ADMIN', '/.aws/credentials'])(
    'flags %s',
    (path) => expect(isJunkPath(path)).toBe(true),
  )
  it.each(['/', '/tools/chatgpt', '/best/writing', '/compare/chatgpt-vs-claude', '/deals', '/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt', '/.well-known/security.txt', '/tools/php-helper', '/guides/wordpress-ai', '/result', '/go/chatgpt', '/environment'])(
    'allows %s',
    (path) => expect(isJunkPath(path)).toBe(false),
  )
})

describe('encoded probes', () => {
  it.each(['/%2Eenv', '/x%2ephp', '//wp-admin', '/.env%00', '/%252Eenv', '/%77p-login.php', '/a/%2egit/config', '/WP%2DADMIN'])('flags %s', (path) =>
    expect(isJunkPath(path)).toBe(true),
  )
  it.each(['/%E0%A4%A', '/%', '/tools/%zz', '/best/%E0%A4%A'])('does not throw on malformed %s', (path) => {
    expect(() => isJunkPath(path)).not.toThrow()
    expect(isJunkPath(path)).toBe(false)
  })
  it('flags a probe even when a later escape is malformed', () => expect(isJunkPath('/wp-admin/%zz')).toBe(true))
  it.each(['/tools/caf%C3%A9', '/compare/a-vs-b', '/guides/what%20is%20php-like'])('allows %s', (path) => expect(isJunkPath(path)).toBe(false))
  it('normalizes', () => {
    expect(normalizeProbePath('/%252Eenv')).toBe('/.env')
    expect(normalizeProbePath('/%zz/%2e')).toBe('/%zz/%2e')
    expect(normalizeProbePath('//a///b')).toBe('/a/b')
  })
})
