import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  it('ignores test-mode keys', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-keys-'))
    directories.push(directory)
    await writeFile(path.join(directory, 'env'), 'STRIPE_SECRET_KEY=sk_test_example\n')
    await expect(findLiveStripeKeys(directory)).resolves.toEqual([])
  })

  it('does not flag this repository', async () => {
    await expect(findLiveStripeKeys(process.cwd())).resolves.toEqual([])
  })
})
