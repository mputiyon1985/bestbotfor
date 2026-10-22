import { createClient, type Client } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { Database } from './db/client'
import { createTestDatabase } from '@/test/db'
import {
  FREE_ACCOUNT_PROMPT,
  FREE_PICK_CAP,
  PICK_CAP_LEAD,
  PICK_CAP_LINK,
  evaluatePickSave,
  pickSaverFromAccess,
  saveCappedPick,
  type PickSaveOutcome,
} from './pick-save'
import type { QuizAnswers } from './validation'

const open: { close: () => Promise<void> }[] = []

afterEach(async () => {
  while (open.length > 0) {
    const current = open.pop()
    if (current) await current.close()
  }
})

function answers(index: number): QuizAnswers {
  return { task: `job-${index}`, budget: 'any', skill: 'beginner' }
}

async function pickCount(db: Database, userId: string): Promise<number> {
  const rows = await db.$client.execute({
    sql: 'SELECT COUNT(*) AS n FROM saved_picks WHERE clerk_user_id = ?',
    args: [userId],
  })
  return Number(rows.rows[0]?.n)
}

async function useDatabase() {
  const test = await createTestDatabase()
  open.push(test)
  return test.db
}

describe('pick save authorization', () => {
  it('refuses a signed-out visitor', () => {
    expect(evaluatePickSave({ userId: null, stripeConfigured: true, subscriptionStatus: 'active' })).toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
    expect(pickSaverFromAccess({ allowed: false, reason: 'unauthenticated' }, null)).toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
  })

  it('limits a signed-in account when billing is off, even if a leftover row is active', () => {
    expect(evaluatePickSave({ userId: 'user_1', stripeConfigured: false, subscriptionStatus: 'active' })).toEqual({
      ok: true,
      userId: 'user_1',
      unlimited: false,
    })
    expect(pickSaverFromAccess({ allowed: false, reason: 'billing-disabled' }, 'user_1')).toEqual({
      ok: true,
      userId: 'user_1',
      unlimited: false,
    })
  })

  it('limits a signed-in account until the subscription is active or trialing', () => {
    expect(evaluatePickSave({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: null })).toEqual({
      ok: true,
      userId: 'user_1',
      unlimited: false,
    })
    expect(evaluatePickSave({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: 'canceled' })).toEqual({
      ok: true,
      userId: 'user_1',
      unlimited: false,
    })
    expect(evaluatePickSave({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: 'active' })).toEqual({
      ok: true,
      userId: 'user_1',
      unlimited: true,
    })
    expect(evaluatePickSave({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: 'trialing' })).toEqual({
      ok: true,
      userId: 'user_1',
      unlimited: true,
    })
    expect(pickSaverFromAccess({ allowed: false, reason: 'subscription-required' }, 'user_free')).toEqual({
      ok: true,
      userId: 'user_free',
      unlimited: false,
    })
  })

  it('uses the paid membership id and ignores a different clerk id', () => {
    expect(pickSaverFromAccess({ allowed: true, userId: 'user_paid' }, 'user_other')).toEqual({
      ok: true,
      userId: 'user_paid',
      unlimited: true,
    })
  })
})

describe('free pick cap', () => {
  it('stops a free account at 10 distinct picks and does not count a duplicate', async () => {
    const db = await useDatabase()
    for (let index = 0; index < FREE_PICK_CAP; index += 1) {
      expect(await saveCappedPick({ db, userId: 'user_free', answers: answers(index), unlimited: false })).toBe('saved')
    }
    expect(await pickCount(db, 'user_free')).toBe(FREE_PICK_CAP)
    expect(await saveCappedPick({ db, userId: 'user_free', answers: answers(0), unlimited: false })).toBe('duplicate')
    expect(await pickCount(db, 'user_free')).toBe(FREE_PICK_CAP)
    expect(await saveCappedPick({ db, userId: 'user_free', answers: answers(FREE_PICK_CAP), unlimited: false })).toBe('limit')
    expect(await pickCount(db, 'user_free')).toBe(FREE_PICK_CAP)
  })

  it('does not let one full account block another', async () => {
    const db = await useDatabase()
    for (let index = 0; index < FREE_PICK_CAP; index += 1) {
      await saveCappedPick({ db, userId: 'user_a', answers: answers(index), unlimited: false })
    }
    expect(await saveCappedPick({ db, userId: 'user_b', answers: answers(0), unlimited: false })).toBe('saved')
    expect(await pickCount(db, 'user_a')).toBe(FREE_PICK_CAP)
    expect(await pickCount(db, 'user_b')).toBe(1)
  })

  it('lets a paid membership save past the free cap', async () => {
    const db = await useDatabase()
    for (let index = 0; index < FREE_PICK_CAP + 1; index += 1) {
      expect(await saveCappedPick({ db, userId: 'user_paid', answers: answers(index), unlimited: true })).toBe('saved')
    }
    expect(await pickCount(db, 'user_paid')).toBe(FREE_PICK_CAP + 1)
  })

  it('does not insert when the user id is empty', async () => {
    const db = await useDatabase()
    expect(await saveCappedPick({ db, userId: '', answers: answers(0), unlimited: true })).toBe('busy')
    expect(await pickCount(db, '')).toBe(0)
  })
})

describe('pick cap copy', () => {
  it('keeps the cap sentence and the free-account prompt', () => {
    expect(`${PICK_CAP_LEAD} ${PICK_CAP_LINK}`).toBe("You've saved 10 picks. Go unlimited with membership.")
    expect(FREE_ACCOUNT_PROMPT).toBe('Save this pick: free account')
  })
})

async function racingClients(url: string, count: number): Promise<{ dbs: Database[]; close: () => void }> {
  const clients: Client[] = []
  for (let index = 0; index < count; index += 1) {
    const client = createClient({ url })
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA busy_timeout = 5000')
    clients.push(client)
  }
  return {
    dbs: clients.map((client) => ({ $client: client }) as Database),
    close() {
      for (const client of clients) client.close()
    },
  }
}

describe('pick cap races', () => {
  it('keeps a free account at 10 when 12 distinct saves run together', async () => {
    const test = await createTestDatabase()
    open.push(test)
    await test.db.$client.execute('PRAGMA journal_mode = WAL')
    const racers = await racingClients(test.url, 12)
    try {
      const outcomes = await Promise.all(
        racers.dbs.map((db, index) =>
          saveCappedPick({ db, userId: 'user_race', answers: answers(index), unlimited: false }),
        ),
      )
      expect(outcomes.filter((outcome) => outcome === 'saved')).toHaveLength(FREE_PICK_CAP)
      expect(outcomes.filter((outcome) => outcome === 'limit')).toHaveLength(2)
      expect(outcomes.filter((outcome) => outcome === 'busy')).toHaveLength(0)
      expect(await pickCount(test.db, 'user_race')).toBe(FREE_PICK_CAP)
    } finally {
      racers.close()
    }
  })

  it('fills only the remaining free slots when saves start at 9', async () => {
    const test = await createTestDatabase()
    open.push(test)
    for (let index = 0; index < 9; index += 1) {
      expect(await saveCappedPick({ db: test.db, userId: 'user_race', answers: answers(index), unlimited: false })).toBe('saved')
    }
    await test.db.$client.execute('PRAGMA journal_mode = WAL')
    const racers = await racingClients(test.url, 5)
    try {
      const outcomes = await Promise.all(
        racers.dbs.map((db, index) =>
          saveCappedPick({ db, userId: 'user_race', answers: answers(9 + index), unlimited: false }),
        ),
      )
      expect(outcomes.filter((outcome) => outcome === 'saved')).toHaveLength(1)
      expect(outcomes.filter((outcome) => outcome === 'limit')).toHaveLength(4)
      expect(await pickCount(test.db, 'user_race')).toBe(FREE_PICK_CAP)
    } finally {
      racers.close()
    }
  })

  it('lets a paid membership save every parallel pick', async () => {
    const test = await createTestDatabase()
    open.push(test)
    await test.db.$client.execute('PRAGMA journal_mode = WAL')
    const racers = await racingClients(test.url, 15)
    try {
      const outcomes: PickSaveOutcome[] = await Promise.all(
        racers.dbs.map((db, index) =>
          saveCappedPick({ db, userId: 'user_paid', answers: answers(index), unlimited: true }),
        ),
      )
      expect(outcomes.every((outcome) => outcome === 'saved')).toBe(true)
      expect(await pickCount(test.db, 'user_paid')).toBe(15)
    } finally {
      racers.close()
    }
  })
})
