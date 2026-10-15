import 'server-only'

import { eq } from 'drizzle-orm'
import { isClerkConfigured } from './clerk'
import { getDb } from './db'
import { savedPicks, subscriptions } from './db/schema'
import { bestSubscriptionStatus, evaluateMemberAccess, type MemberAccess } from './gate'
import { isStripeConfigured } from './stripe'
import { quizSchema, type QuizAnswers } from './validation'

export async function currentClerkUserId(): Promise<string | null> {
  if (!isClerkConfigured()) return null
  const { auth } = await import('@clerk/nextjs/server')
  const session = await auth()
  return session.userId
}

export async function memberAccess(): Promise<MemberAccess> {
  const userId = await currentClerkUserId()
  if (!userId) return evaluateMemberAccess({ userId: null, stripeConfigured: isStripeConfigured(), subscriptionStatus: null })
  const rows = await getDb().select().from(subscriptions).where(eq(subscriptions.clerkUserId, userId))
  const status = bestSubscriptionStatus(rows.map((row) => row.status))
  return evaluateMemberAccess({
    userId,
    stripeConfigured: isStripeConfigured(),
    subscriptionStatus: status,
  })
}

export async function listSavedPicks(userId: string) {
  return getDb().select().from(savedPicks).where(eq(savedPicks.clerkUserId, userId))
}

export async function savePickForUser(userId: string, answers: QuizAnswers): Promise<void> {
  const parsed = quizSchema.parse(answers)
  const db = getDb()
  const existing = await db.select().from(savedPicks).where(eq(savedPicks.clerkUserId, userId))
  const duplicate = existing.find(
    (row) => row.taskSlug === parsed.task && row.budget === parsed.budget && row.skill === parsed.skill,
  )
  if (duplicate) return
  await db.insert(savedPicks).values({
    clerkUserId: userId,
    taskSlug: parsed.task,
    budget: parsed.budget,
    skill: parsed.skill,
    createdAt: Date.now(),
  })
}

export async function stripeCustomerIdForUser(userId: string): Promise<string | null> {
  const rows = await getDb().select().from(subscriptions).where(eq(subscriptions.clerkUserId, userId))
  return rows.find((row) => row.stripeCustomerId)?.stripeCustomerId ?? null
}
