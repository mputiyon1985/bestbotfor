import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import type { Database } from '@/lib/db/client'

export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-'))
  const file = path.join(directory, 'test.db')
  const client = createClient({ url: `file:${file}` })
  const sql = await readFile(path.join(process.cwd(), 'drizzle', '0001_init.sql'), 'utf8')
  await client.executeMultiple(sql)
  const db = drizzle(client, { schema })
  return {
    db,
    async close() {
      client.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
