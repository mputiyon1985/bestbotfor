import type { Client } from '@libsql/client'

/**
 * Backs the ratings policy line "Text and versions deleted within 24 hours".
 * deleteReview only marks a review 'withdrawn'. The daily data-retention cron
 * (vercel.json, once every 24 hours) calls this and purges every withdrawn
 * review, so its text is gone by the next run, under 24 hours after the delete.
 *
 * review_versions content is append-only (trigger in 0011), and
 * reviews.latest_version_id must point at a version. So for each withdrawn
 * review this appends one empty tombstone version (no text, no optional
 * answers, attestation_version 'purged'), points the review at it, clears
 * published_version_id and the IP hashes, and deletes every other version.
 * moderation_events rows stay, as the policy allows. Text is never selected.
 */
export const PURGED_ATTESTATION = 'purged'

const PENDING_REVIEWS = `SELECT DISTINCT r.id AS id FROM reviews r
  JOIN review_versions v ON v.review_id = r.id
  WHERE r.status = 'withdrawn' AND v.attestation_version <> '${PURGED_ATTESTATION}'`

function countOf(value: unknown): number {
  const count = Number(value ?? 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

export async function reviewTablesReady(client: Client): Promise<boolean> {
  for (const [table, columns] of [
    ['reviews', ['id', 'status', 'latest_version_id', 'published_version_id', 'ip_hmac', 'net_hmac']],
    ['review_versions', ['id', 'review_id', 'version_no', 'stars', 'attestation_version']],
  ] as const) {
    const result = await client.execute(`PRAGMA table_info(${table})`)
    const present = new Set(result.rows.map((row) => String(row.name)))
    if (!columns.every((column) => present.has(column))) return false
  }
  return true
}

/** Withdrawn reviews that still hold a non-tombstone version. */
export async function countWithdrawnReviewText(client: Client): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS n FROM (${PENDING_REVIEWS})`)
  return countOf(result.rows[0]?.n)
}

/** Returns the number of withdrawn reviews purged. */
export async function purgeWithdrawnReviewText(
  client: Client,
  batchSize: number,
  maxBatches: number,
  now: number,
): Promise<number> {
  let purged = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const ids = (await client.execute({ sql: `${PENDING_REVIEWS} LIMIT ?`, args: [batchSize] })).rows.map((row) => Number(row.id))
    for (const id of ids) {
      const tx = await client.transaction('write')
      try {
        const next = await tx.execute({
          sql: `SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM review_versions WHERE review_id = ?`,
          args: [id],
        })
        const inserted = await tx.execute({
          sql: `INSERT INTO review_versions
            (review_id, version_no, stars, pros, cons, use_case_text, role, usage_duration, plan_type,
             connection, connection_text, attestation_version, vendor_domain_check, decision, content_hash, created_at)
            SELECT v.review_id, ?, v.stars, '', '', '', NULL, NULL, NULL, 'none', '', ?, v.vendor_domain_check,
             'superseded', ?, ?
            FROM review_versions v JOIN reviews r ON r.latest_version_id = v.id WHERE r.id = ?`,
          args: [Number(next.rows[0]?.n ?? 1), PURGED_ATTESTATION, PURGED_ATTESTATION, now, id],
        })
        const tombstone = inserted.lastInsertRowid
        if (tombstone === undefined || countOf(inserted.rowsAffected) !== 1) throw new Error('tombstone insert failed')
        const repointed = await tx.execute({
          sql: `UPDATE reviews SET latest_version_id = ?, published_version_id = NULL, ip_hmac = NULL, net_hmac = NULL
            WHERE id = ? AND status = 'withdrawn'`,
          args: [tombstone, id],
        })
        // Reopened between the select and this transaction: keep every version.
        if (countOf(repointed.rowsAffected) !== 1) {
          await tx.rollback()
          continue
        }
        await tx.execute({ sql: 'DELETE FROM review_versions WHERE review_id = ? AND id <> ?', args: [id, tombstone] })
        await tx.commit()
        purged += 1
      } catch (error) {
        await tx.rollback()
        console.error('review purge failed', error instanceof Error ? error.name : 'error')
      } finally {
        tx.close()
      }
    }
    if (ids.length < batchSize) break
  }
  return purged
}
