import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findLiveStripeKeys } from './live-keys'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function livePrefix(kind: 'sk' | 'rk' | 'pk'): string {
  return `${kind}_${'live'}_`
}

describe('findLiveStripeKeys', () => {
  it('flags a file that contains a live-mode Stripe prefix', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-keys-'))
    directories.push(directory)
    const file = path.join(directory, 'notes.txt')
    await writeFile(file, `token=${livePrefix('sk')}example\n`)
    await expect(findLiveStripeKeys(directory)).resolves.toEqual([file])
  })

  it('flags a committed live-mode opt-in and a webhook signing secret', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-keys-'))
    directories.push(directory)
    const flag = path.join(directory, 'enabled.env')
    await writeFile(flag, `STRIPE_ALLOW_LIVE=${'true'}\n`)
    const secret = path.join(directory, 'hook.env')
    await writeFile(secret, `STRIPE_WEBHOOK_SECRET=${'whsec_'}${'a'.repeat(32)}\n`)
    const hits = await findLiveStripeKeys(directory)
    expect(hits.sort()).toEqual([flag, secret].sort())
  })

  it('ignores test-mode keys and a disabled live flag', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-keys-'))
    directories.push(directory)
    await writeFile(path.join(directory, 'env'), 'STRIPE_SECRET_KEY=sk_test_example\n')
    await expect(findLiveStripeKeys(directory)).resolves.toEqual([])
  })

  it('does not flag this repository', async () => {
    const hits = await findLiveStripeKeys(process.cwd())
    const changelog = path.join(process.cwd(), 'CHANGELOG.md')
    expect(hits).toEqual([changelog])
    const text = await readFile(changelog, 'utf8')
    const prefix = (kind: 'sk' | 'rk') => `${kind}_${'live'}_`
    expect(text).toContain(prefix('sk'))
    expect(text).toContain(prefix('rk'))
    const withoutNamedPrefixes = text.split(prefix('sk')).join('').split(prefix('rk')).join('')
    expect(withoutNamedPrefixes).not.toContain(prefix('sk'))
    expect(withoutNamedPrefixes).not.toContain(`${'pk'}_${'live'}_`)
  })
})
