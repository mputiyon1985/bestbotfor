import { readdirSync, readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import tls from 'node:tls'
import { describe, expect, it } from 'vitest'

const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'data', '.turbo'])
const GUARD_FILES = new Set(['src/test/block-outbound.ts', 'src/test/block-outbound.test.ts'])
const UNSAFE_FETCH_IMPORTERS = ['src/lib/rate-limit.remote.test.ts']

describe('outbound network guard', () => {
  it('blocks lookalike hosts and still allows loopback', async () => {
    await expect(fetch('https://example.com/newsletter')).rejects.toThrow(/Blocked outbound test fetch to example.com/)
    await expect(fetch('https://api.beehiiv.com/v2/publications/pub_x/subscriptions')).rejects.toThrow(
      /Blocked outbound test fetch to api.beehiiv.com/,
    )
    await expect(fetch('https://127.example.com/')).rejects.toThrow(/Blocked outbound test fetch to 127.example.com/)
    await expect(fetch('https://127.0.0.1.nip.io/')).rejects.toThrow(/Blocked outbound test fetch to 127.0.0.1.nip.io/)
    await expect(fetch('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/Blocked outbound test fetch/)
    await expect(fetch('http://8.8.8.8/')).rejects.toThrow(/Blocked outbound test fetch to 8.8.8.8/)
    await expectAllowed(() => fetch('http://127.0.0.1:1/'))
    await expectAllowed(() => fetch('http://127.255.255.255:1/'))
    await expectAllowed(() => fetch('http://[::1]:1/'))
    await expectAllowed(() => fetch('http://localhost:1/'))
  })

  it('blocks node http, https, net, and tls calls that leave loopback', async () => {
    expect(() => http.request('http://127.example.com/')).toThrow(/Blocked outbound test connection to 127.example.com/)
    expect(() => http.get('https://127.0.0.1.nip.io/')).toThrow(/Blocked outbound test connection to 127.0.0.1.nip.io/)
    expect(() => https.request('https://example.com/')).toThrow(/Blocked outbound test connection to example.com/)
    expect(() => https.get('https://api.beehiiv.com/')).toThrow(/Blocked outbound test connection to api.beehiiv.com/)
    expect(() => net.connect(443, 'example.com')).toThrow(/Blocked outbound test connection to example.com/)
    expect(() => net.createConnection(443, '127.0.0.1.nip.io')).toThrow(
      /Blocked outbound test connection to 127.0.0.1.nip.io/,
    )
    expect(() => tls.connect(443, 'example.com')).toThrow(/Blocked outbound test connection to example.com/)
    expect(() => tls.connect({ port: 443, host: '127.example.com' })).toThrow(
      /Blocked outbound test connection to 127.example.com/,
    )
    await expectAllowedSocket(() => {
      const req = http.request({ hostname: '127.0.0.1', port: 1 })
      req.end()
      return req
    })
    await expectAllowedSocket(() => https.get({ hostname: 'localhost', port: 1 }))
    await expectAllowedSocket(() => net.connect(1, '127.0.0.1'))
    await expectAllowedSocket(() => net.connect({ port: 1, host: '::1' }))
    await expectAllowedSocket(() => tls.connect({ port: 1, host: '127.0.0.1', rejectUnauthorized: false }))
  })

  it('lets only the allowlisted modules import unsafeRealFetch', () => {
    const found: string[] = []
    for (const file of sourceFiles(process.cwd())) {
      const relative = path.relative(process.cwd(), file).split(path.sep).join('/')
      if (GUARD_FILES.has(relative)) continue
      const text = readFileSync(file, 'utf8')
      if (text.includes('unsafeRealFetch')) found.push(relative)
    }
    expect(found.sort()).toEqual([...UNSAFE_FETCH_IMPORTERS].sort())
  })
})

async function expectAllowed(run: () => Promise<unknown>): Promise<void> {
  try {
    await run()
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).not.toMatch(/Blocked outbound/)
  }
}

async function expectAllowedSocket(open: () => NodeJS.EventEmitter & { destroy: () => void }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let target: (NodeJS.EventEmitter & { destroy: () => void }) | undefined
    const timer = setTimeout(() => {
      target?.destroy()
      reject(new Error('allowed connection did not settle'))
    }, 2000)
    const finish = (error?: unknown) => {
      clearTimeout(timer)
      target?.destroy()
      if (error instanceof Error && error.message.includes('Blocked outbound')) reject(error)
      else resolve()
    }
    try {
      target = open()
    } catch (error) {
      finish(error)
      return
    }
    target.once('error', () => finish())
    target.once('close', () => finish())
  })
}

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) found.push(full)
  }
  return found
}
