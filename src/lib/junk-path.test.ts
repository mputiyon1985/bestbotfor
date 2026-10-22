import { describe, expect, it } from 'vitest'
import { isJunkPath } from './junk-path'

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
