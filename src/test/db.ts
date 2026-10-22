import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '@/lib/db/schema'
import type { Database } from '@/lib/db/client'
import { adoptSponsorCardSchema, adoptSponsorshipSchema, adoptSuggestionsSchema } from '@/lib/db/migrate'

export async function createTestDatabase(): Promise<{ db: Database; url: string; close: () => Promise<void> }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-'))
  const file = path.join(directory, 'test.db')
  const url = `file:${file}`
  const client = createClient({ url })
  const directorySql = path.join(process.cwd(), 'drizzle')
  const files = (await readdir(directorySql)).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(path.join(directorySql, file), 'utf8')
    await client.executeMultiple(sql)
  }
  await adoptSponsorshipSchema(client)
  await adoptSponsorCardSchema(client)
  await adoptSuggestionsSchema(client)
  const db = drizzle(client, { schema })
  return {
    db,
    url,
    async close() {
      client.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
