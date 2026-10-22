'use server'

import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { currentClerkUserId, memberAccess } from '@/lib/members'
import { pickSaverFromAccess, saveCappedPick } from '@/lib/pick-save'
import { quizSchema } from '@/lib/validation'

export async function savePickAction(formData: FormData): Promise<void> {
  const access = await memberAccess()
  const decision = pickSaverFromAccess(access, access.allowed ? null : await currentClerkUserId())
  if (!decision.ok) redirect('/sign-in')
  const parsed = quizSchema.safeParse({
    task: String(formData.get('task') ?? ''),
    budget: String(formData.get('budget') ?? ''),
    skill: String(formData.get('skill') ?? ''),
  })
  if (!parsed.success) redirect('/result')
  const outcome = await saveCappedPick({
    db: getDb(),
    userId: decision.userId,
    answers: parsed.data,
    unlimited: decision.unlimited,
  })
  if (outcome === 'limit') {
    const back = new URLSearchParams(parsed.data)
    back.set('save', 'limit')
    redirect(`/result?${back.toString()}`)
  }
  if (outcome === 'busy') {
    const back = new URLSearchParams(parsed.data)
    redirect(`/result?${back.toString()}`)
  }
  redirect('/members')
}
