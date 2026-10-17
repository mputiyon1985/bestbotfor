import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations } from './migrate'
import { reviewVersions, reviews } from './schema'

const directories: string[] = []
const migrationName = '0011_user_reviews.sql'
const reviewTables = [
  'reviews',
  'review_versions',
  'review_reports',
  'moderation_events',
  'review_aggregates',
  'tool_vendor_domains',
  'tool_sponsor_links',
  'user_tombstones',
  'webhook_events',
]

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function migrationSql(): Promise<string> {
  return readFile(path.join(process.cwd(), 'drizzle', migrationName), 'utf8')
}

async function readSql(name: string): Promise<string> {
  return readFile(path.join(process.cwd(), 'drizzle', name), 'utf8')
}

async function sqlNames(): Promise<string[]> {
  return (await readdir(path.join(process.cwd(), 'drizzle'))).filter((name) => name.endsWith('.sql')).sort()
}

/** Current schema, then the new migration, on one open connection. */
async function applyPriorThenReviews(client: Client): Promise<void> {
  for (const name of await sqlNames()) {
    if (name === migrationName) continue
    await client.executeMultiple(await readSql(name))
  }
  await client.executeMultiple(await migrationSql())
}

function expectConstraint(run: () => Promise<unknown>) {
  return expect(run()).rejects.toThrow(/constraint/i)
}

async function rollback(client: Client): Promise<void> {
  try {
    await client.execute('ROLLBACK')
  } catch {
    // The failed statement was not inside an open transaction.
  }
}

async function seedTool(client: Client): Promise<void> {
  await client.execute(`
    INSERT INTO tools (
      slug, name, vendor, url, category, short_desc, long_desc, pricing_model,
      has_free_tier, skill_level, platforms, last_verified_at, status
    ) VALUES (
      'test-tool', 'Test Tool', 'Test Vendor', 'https://example.test', 'Chat',
      'short', 'long', 'free', 1, 'beginner', 'Web', '2026-10-17', 'active'
    )
  `)
}

/** Both rows in one script so the deferred foreign keys commit together. */
async function seedReview(client: Client, userId = 'user_1', reviewId = 1, versionId = 1): Promise<void> {
  await client.executeMultiple(`
    BEGIN;
    INSERT INTO reviews (
      id, tool_id, clerk_user_id, status, latest_version_id, display_name, created_at, updated_at
    ) VALUES (${reviewId}, 1, '${userId}', 'pending', ${versionId}, 'Ada L.', 1, 1);
    INSERT INTO review_versions (
      id, review_id, version_no, stars, connection, attestation_version, vendor_domain_check, content_hash, created_at
    ) VALUES (${versionId}, ${reviewId}, 1, 5, 'none', '2026-10-v1', 'pass', 'hash-${versionId}', 1);
    COMMIT;
  `)
}

async function tableNames(client: Client): Promise<string[]> {
  const listed = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${reviewTables.map((name) => `'${name}'`).join(', ')}) ORDER BY name`,
  )
  return listed.rows.map((row) => String(row.name))
}

describe('0011_user_reviews.sql', () => {
  it('is additive and stores no email or raw IP column', async () => {
    const sql = (await migrationSql())
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bALTER\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(sql).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i)
    expect(sql).toMatch(/CREATE TRIGGER IF NOT EXISTS review_versions_content_append_only/)
    expect(sql).toMatch(/BEFORE UPDATE OF stars, pros, cons/)
    expect(sql).toMatch(/BEFORE DELETE ON moderation_events/)
    expect(sql).not.toMatch(/\bemail\b/i)
    expect(sql).not.toMatch(/raw_ip|user_agent/i)
    expect(reviews.ipHmac.name).toBe('ip_hmac')
    expect(reviews.netHmac.name).toBe('net_hmac')
    expect(reviews.ipKeyId.name).toBe('ip_key_id')
    expect(sql).toMatch(/net_hmac TEXT/)
    expect(sql).toMatch(/ip_key_id TEXT/)
    expect(sql).not.toMatch(/network_range_hmac|hmac_key_version/)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS reviews_ip_created_idx ON reviews \(ip_hmac, created_at\)/)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS reviews_net_created_idx ON reviews \(net_hmac, created_at\)/)
    expect(sql).not.toMatch(/competitor/i)
    const raw = await migrationSql()
    expect(raw).toMatch(/keyed HMAC of the full submit IP/)
    expect(raw).toMatch(/keyed HMAC of the IPv4 \/24 or IPv6 \/48 bucket/)
    expect(raw).toMatch(/key version such as 'k1'/)
    expect(raw).toMatch(/REVIEW_IP_HMAC_SECRET/)
    expect(raw).toMatch(/bestbotfor\/review-ip\/v1/)
    expect(raw).toMatch(/bestbotfor\/review-net\/v1/)
    expect(raw).toMatch(/HMAC-SHA256\(K_ip, 'bestbotfor-review-ip\|v1\|' \+ ip\)/)
    expect(raw).toMatch(/competitor-domain match is a moderator hint only/)
    expect(reviewVersions.stars.name).toBe('stars')
  })

  it('applies on an empty file database, on the current schema, and a second time is a no-op', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-reviews-'))
    directories.push(root)
    const url = `file:${path.join(root, 'reviews.db')}`
    await applyMigrations(url)

    const client = createClient({ url })
    try {
      const recorded = await client.execute({ sql: 'SELECT id FROM schema_migrations WHERE id = ?', args: [migrationName] })
      expect(recorded.rows).toHaveLength(1)
      expect(await tableNames(client)).toEqual([...reviewTables].sort())
      const columns = await client.execute('PRAGMA table_info(reviews)')
      const names = columns.rows.map((row) => String(row.name))
      expect(names).toContain('ip_hmac')
      expect(names).toContain('net_hmac')
      expect(names).toContain('ip_key_id')
      const keyId = columns.rows.find((row) => row.name === 'ip_key_id')
      expect(String(keyId?.type).toUpperCase()).toBe('TEXT')
      const before = await client.execute('SELECT COUNT(*) AS n FROM schema_migrations')
      await client.executeMultiple(await migrationSql())
      const after = await client.execute('SELECT COUNT(*) AS n FROM schema_migrations')
      expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n))
      expect(await tableNames(client)).toEqual([...reviewTables].sort())
    } finally {
      client.close()
    }

    await applyMigrations(url)
    const again = createClient({ url })
    try {
      const count = await again.execute({
        sql: 'SELECT COUNT(*) AS n FROM schema_migrations WHERE id = ?',
        args: [migrationName],
      })
      expect(Number(count.rows[0]?.n)).toBe(1)
    } finally {
      again.close()
    }
  })

  it('applies the new file onto the current schema in a memory database and again as a no-op', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      await applyPriorThenReviews(client)
      const first = await tableNames(client)
      await client.executeMultiple(await migrationSql())
      expect(await tableNames(client)).toEqual(first)
      expect(first).toEqual([...reviewTables].sort())
    } finally {
      client.close()
    }
  })

  it('rejects a bad star, weight, or status, a second user-tool row, and edits to history or the audit log', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-reviews-rules-'))
    directories.push(root)
    const url = `file:${path.join(root, 'reviews.db')}`
    await applyMigrations(url)
    const client = createClient({ url })
    try {
      await seedTool(client)
      await seedReview(client)

      await expectConstraint(() =>
        client.execute(
          `INSERT INTO review_versions (review_id, version_no, stars, connection, attestation_version, vendor_domain_check, content_hash, created_at) VALUES (1, 2, 0, 'none', '2026-10-v1', 'pass', 'h', 1)`,
        ),
      )
      await expectConstraint(() =>
        client.execute(
          `INSERT INTO review_versions (review_id, version_no, stars, connection, attestation_version, vendor_domain_check, content_hash, created_at) VALUES (1, 2, 6, 'none', '2026-10-v1', 'pass', 'h', 1)`,
        ),
      )
      await expectConstraint(() => client.execute('UPDATE reviews SET weight = 2.0 WHERE id = 1'))
      await expectConstraint(() => client.execute(`UPDATE reviews SET status = 'loved' WHERE id = 1`))
      await expectConstraint(() =>
        client.executeMultiple(`
          BEGIN;
          INSERT INTO reviews (id, tool_id, clerk_user_id, status, latest_version_id, display_name, created_at, updated_at)
          VALUES (2, 1, 'user_1', 'pending', 2, 'Ada L.', 1, 1);
          INSERT INTO review_versions (id, review_id, version_no, stars, connection, attestation_version, vendor_domain_check, content_hash, created_at)
          VALUES (2, 2, 1, 4, 'none', '2026-10-v1', 'pass', 'h2', 1);
          COMMIT;
        `),
      )
      await rollback(client)
      await expectConstraint(() => client.execute('UPDATE review_versions SET stars = 1 WHERE id = 1'))
      await client.execute(`UPDATE review_versions SET decision = 'approved', decided_at = 2 WHERE id = 1`)
      const decision = await client.execute('SELECT decision FROM review_versions WHERE id = 1')
      expect(String(decision.rows[0]?.decision)).toBe('approved')

      await client.execute(
        `INSERT INTO moderation_events (actor_type, actor_ref, action, created_at) VALUES ('system', 'system', 'submit', 1)`,
      )
      await expectConstraint(() => client.execute(`UPDATE moderation_events SET note = 'changed' WHERE id = 1`))
      await expectConstraint(() => client.execute('DELETE FROM moderation_events WHERE id = 1'))
      const kept = await client.execute('SELECT COUNT(*) AS n FROM moderation_events')
      expect(Number(kept.rows[0]?.n)).toBe(1)

      await client.execute(
        `INSERT INTO tool_sponsor_links (tool_id, sponsorship_id, starts_at, created_by, created_at) VALUES (1, NULL, 1, 'admin', 1)`,
      )
      const links = await client.execute('SELECT sponsorship_id FROM tool_sponsor_links')
      expect(links.rows[0]?.sponsorship_id).toBeNull()
    } finally {
      client.close()
    }
  })

  it('records whether this libsql connection enforces foreign keys', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-reviews-fk-'))
    directories.push(root)
    const client = createClient({ url: `file:${path.join(root, 'reviews.db')}` })
    try {
      await applyPriorThenReviews(client)
      const pragma = await client.execute('PRAGMA foreign_keys')
      const enforced = Number(pragma.rows[0]?.foreign_keys)
      // Observed on @libsql/client for a file: database. Writers still validate
      // every reference themselves (spec 5.1) and must not branch on this value.
      expect(enforced, 'PRAGMA foreign_keys').toBe(1)
      await expect(
        client.execute(
          `INSERT INTO tool_vendor_domains (tool_id, domain, source, created_at) VALUES (999999, 'example.test', 'manual', 1)`,
        ),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i)
    } finally {
      client.close()
    }
  })
})
