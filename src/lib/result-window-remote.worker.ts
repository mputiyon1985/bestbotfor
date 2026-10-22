import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './db/schema'
import { createLibsqlClient } from './db/client'
import { consumeResultRateLimit } from './rate-limit'

/**
 * One process in the remote-window test.
 * A page client is opened first, the way a request creates the shared client
 * before the limiter runs. The limiter then uses a remote client this module
 * did not register. File pragmas on that client make sqld reject the write,
 * and each process would allow its own full limit.
 */
async function main(): Promise<void> {
  const remoteUrl = process.argv[2] ?? ''
  const key = process.argv[3] ?? ''
  const count = Number(process.argv[4])
  const limit = Number(process.argv[5])
  const now = Number(process.argv[6])
  const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-page-'))
  const page = createLibsqlClient(`file:${path.join(directory, 'page.db')}`)
  const remote = createClient({ url: remoteUrl })
  const db = drizzle(remote, { schema })
  let allowed = 0
  let denied = 0
  try {
    for (let index = 0; index < count; index += 1) {
      const decision = await consumeResultRateLimit(db, key, limit, 60_000, now)
      if (decision.ok) allowed += 1
      else denied += 1
    }
    process.stdout.write(`${JSON.stringify({ allowed, denied })}\n`)
  } finally {
    remote.close()
    page.close()
    await rm(directory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'worker failed')
  process.exit(1)
})
