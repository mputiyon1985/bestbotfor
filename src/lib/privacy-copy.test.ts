import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLICK_HASH_RETENTION_MS, RATE_LIMIT_RETENTION_MS } from './data-retention'
import { OG_RATE_WINDOW_MS } from './og'
import { CLICK_LOG_PARAGRAPH, clickLogParagraph, GPC_PRIVACY_PARAGRAPH, rateLimitPrivacyParagraphs, rateLimitRetentionKept, RETENTION_JOB_PARAGRAPH, retentionCopyOn, retentionJobParagraph, SHARING_PARAGRAPH, TURSO_BACKUP_PARAGRAPH, windowPhrase } from './privacy-copy'
import {
  CHECKOUT_RATE_WINDOW_MS,
  GO_RATE_WINDOW_MS,
  NEWSLETTER_RATE_WINDOW_MS,
  PORTAL_RATE_WINDOW_MS,
  RESULT_RATE_WINDOW_MS,
  RESULT_WINDOW_PURGE_INTERVAL_MS,
} from './rate-windows'
import { PRIVACY_UPDATED, PRIVACY_UPDATED_WITH_RATINGS, RETENTION_ROWS } from './ratings-policy-copy'
import { DATA_RETENTION_PRODUCTION_LAUNCH } from './retention-flags'

describe('privacy policy facts', () => {
  it('names the rate-limit windows and keeps the retention job off until it is switched on', () => {
    expect(NEWSLETTER_RATE_WINDOW_MS).toBe(60 * 60_000)
    expect(GO_RATE_WINDOW_MS).toBe(60_000)
    expect(OG_RATE_WINDOW_MS).toBe(60_000)
    expect(RESULT_RATE_WINDOW_MS).toBe(60_000)
    expect(CHECKOUT_RATE_WINDOW_MS).toBe(60 * 60_000)
    expect(PORTAL_RATE_WINDOW_MS).toBe(60 * 60_000)
    expect(RESULT_WINDOW_PURGE_INTERVAL_MS).toBe(60_000)
    expect(windowPhrase(NEWSLETTER_RATE_WINDOW_MS)).toBe('one hour')
    expect(windowPhrase(GO_RATE_WINDOW_MS)).toBe('one minute')

    const paragraphs = rateLimitPrivacyParagraphs()
    const text = [CLICK_LOG_PARAGRAPH, ...paragraphs, RETENTION_JOB_PARAGRAPH, GPC_PRIVACY_PARAGRAPH, SHARING_PARAGRAPH].join('\n')
    expect(text).toContain('secret key')
    expect(text).toContain('pseudonymous personal data')
    expect(text).toContain('one hour')
    expect(text).toContain('one minute')
    expect(text).toContain('word unknown')
    expect(text).toContain('do not delete those rows when the window ends')
    expect(text).toContain('After the window ends, the next request for the same code resets the count')
    expect(text).toContain('stays in the database while the retention job is off')
    expect(text).toContain('If cleanup does not run, the expired row remains')
    expect(text).toContain('no fixed deletion date')
    expect(text).toContain('about 24 to 48 hours after the window ends')
    expect(text).toContain('about 90 days')
    expect(text).toContain('leaves the rest of the click row')
    expect(text).toContain('off in production now')
    expect(text).toContain('only when the retention job is switched on')
    expect(text).toContain('Until the job is switched on, those deletions do not run')
    expect(text).toContain('while the retention job is off')
    expect(text).toContain('longer than 48 hours')
    expect(text).toContain('when the window ends while the retention job is off')
    expect(RATE_LIMIT_RETENTION_MS).toBe(24 * 60 * 60 * 1000)
    expect(CLICK_HASH_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000)
    expect(DATA_RETENTION_PRODUCTION_LAUNCH).toBe(false)
    expect(text).not.toMatch(/HMAC|Sec-GPC|SHA-256/i)
    expect(text).not.toMatch(/do not store your IP|never store the raw IP|do not store your IP address/i)

    const limiter = readFileSync(path.join(process.cwd(), 'src/lib/rate-limit.ts'), 'utf8')
    expect(limiter).not.toContain('DELETE FROM rate_limits')
    expect(limiter).toContain('DELETE FROM result_rate_windows WHERE expires_at <= ?')
    const keys = readFileSync(path.join(process.cwd(), 'src/lib/ip.ts'), 'utf8')
    expect(keys).toContain('bestbotfor-rate|${action}|${ip ?? \'unknown\'}')
    expect(keys).toContain("createHmac('sha256'")
    const page = readFileSync(path.join(process.cwd(), 'src/app/privacy/page.tsx'), 'utf8')
    expect(page).toContain('rateLimitPrivacyParagraphs()')
    expect(page).toContain('GPC_PRIVACY_PARAGRAPH')
  })

  it('describes Global Privacy Control as an analytics opt-out', () => {
    expect(GPC_PRIVACY_PARAGRAPH).toContain('Global Privacy Control header when its value is 1')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('browser says Global Privacy Control is on')
    expect(GPC_PRIVACY_PARAGRAPH).not.toContain('Sec-GPC')
    expect(GPC_PRIVACY_PARAGRAPH).not.toContain('navigator.globalPrivacyControl')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('opt-out of analytics')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('do not load Google Analytics')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('store the bbf_consent cookie as denied')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('does not override the signal')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('do not load Vercel Analytics')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('do not send Vercel Analytics events')
  })

  it('names the processors the site code actually calls, including Turso', () => {
    for (const name of ['Clerk', 'Stripe', 'Beehiiv', 'Google Analytics', 'Vercel', 'Turso']) {
      expect(SHARING_PARAGRAPH).toContain(name)
    }
    expect(SHARING_PARAGRAPH).toContain('when it is connected')
    expect(SHARING_PARAGRAPH).toContain('when it is configured and analytics is allowed')
    const page = readFileSync(path.join(process.cwd(), 'src/app/privacy/page.tsx'), 'utf8')
    expect(page).toContain('CLICK_LOG_PARAGRAPH')
    expect(page).toContain('RETENTION_JOB_PARAGRAPH')
    expect(page).toContain('TURSO_BACKUP_PARAGRAPH')
    expect(page).toContain('SHARING_PARAGRAPH')
    expect(TURSO_BACKUP_PARAGRAPH).toBe(
      "Deleted data may remain in our database provider's backups for up to 30 days before they expire.",
    )
    expect(TURSO_BACKUP_PARAGRAPH).not.toContain('overwritten')
    expect(TURSO_BACKUP_PARAGRAPH).not.toMatch(/Lawyer note|Developer|Scaler|\[/)
    expect(page).not.toContain('Lawyer note')
    expect(page).toContain('PRIVACY_UPDATED')
    const dates = readFileSync(path.join(process.cwd(), 'src/lib/ratings-policy-copy.ts'), 'utf8')
    expect(dates).toContain("export const PRIVACY_UPDATED = 'October 17, 2026'")
    expect(dates.match(/export const PRIVACY_UPDATED =/g)).toEqual(['export const PRIVACY_UPDATED ='])
    expect(PRIVACY_UPDATED_WITH_RATINGS.startsWith(`${PRIVACY_UPDATED}.`)).toBe(true)
    expect(PRIVACY_UPDATED_WITH_RATINGS).toContain('recorded on October 17, 2026')
    expect(PRIVACY_UPDATED_WITH_RATINGS).not.toContain('that day')
    expect(dates).toContain('recorded on October 17, 2026')
    const clicks = readFileSync(path.join(process.cwd(), 'src/app/go/[slug]/route.ts'), 'utf8')
    expect(clicks).toContain('db.insert(clicks)')
    expect(clicks).not.toContain('delete(clicks)')
    const schema = readFileSync(path.join(process.cwd(), 'src/lib/db/schema.ts'), 'utf8')
    expect(schema).toContain("ipHash: text('ip_hash')")
  })

  it('flips every job-is-off sentence when the production launch constant is true', () => {
    const offPhrases = ['job is off', 'off in production', 'while the retention job is off', 'Until the job is switched on']
    const off = [
      clickLogParagraph(false),
      retentionJobParagraph(false),
      rateLimitRetentionKept(false),
      ...rateLimitPrivacyParagraphs(false),
    ].join('\n')
    const on = [
      clickLogParagraph(true),
      retentionJobParagraph(true),
      rateLimitRetentionKept(true),
      ...rateLimitPrivacyParagraphs(true),
    ].join('\n')
    for (const phrase of offPhrases) expect(off).toContain(phrase)
    for (const phrase of offPhrases) expect(on).not.toContain(phrase)
    expect(on).toContain('The retention job is on in production.')
    expect(on).toContain('The retention job deletes the row about 24 to 48 hours after the window ends.')
    expect(on).not.toContain('never requested again')
    expect(on).toContain('longer than 48 hours')
    const armed = { launch: true, purge: 'on', dryRun: 'off' }
    expect(retentionCopyOn(armed)).toBe(true)
    expect(clickLogParagraph(armed)).toBe(clickLogParagraph(true))
    expect(retentionCopyOn({ launch: true, purge: 'on', dryRun: 'on' })).toBe(false)
    expect(retentionCopyOn({ launch: true, purge: 'off', dryRun: 'off' })).toBe(false)
    expect(retentionCopyOn({ launch: false, purge: 'on', dryRun: 'off' })).toBe(false)
    expect(clickLogParagraph({ launch: true, purge: 'on', dryRun: '' })).toContain('job is off')
    expect(CLICK_LOG_PARAGRAPH).toBe(clickLogParagraph())
    expect(RETENTION_JOB_PARAGRAPH).toBe(retentionJobParagraph())
    expect(RETENTION_ROWS.find((row) => row.data === 'Rate-limit rows')?.kept).toBe(rateLimitRetentionKept())
    expect(PRIVACY_UPDATED).toBe('October 17, 2026')

    const outside = ['src/app/privacy/page.tsx', 'src/lib/ratings-policy-copy.ts']
    for (const file of outside) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      for (const phrase of offPhrases) expect(source, file).not.toContain(phrase)
    }
  })
})
