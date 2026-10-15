'use server'

import { redirect } from 'next/navigation'
import { memberAccess, savePickForUser } from '@/lib/members'
import { quizSchema } from '@/lib/validation'

export async function savePickAction(formData: FormData): Promise<void> {
  const access = await memberAccess()
  if (!access.allowed) {
    redirect(access.reason === 'unauthenticated' ? '/sign-in' : '/pricing')
  }
  const parsed = quizSchema.safeParse({
    task: String(formData.get('task') ?? ''),
    budget: String(formData.get('budget') ?? ''),
    skill: String(formData.get('skill') ?? ''),
  })
  if (!parsed.success) redirect('/result')
  await savePickForUser(access.userId, parsed.data)
  redirect('/members')
}
