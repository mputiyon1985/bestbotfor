import { z } from 'zod'

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const budgetSchema = z.enum(['free', 'low', 'any'])
/** All-matches accepts the quiz budgets and nothing else. */
export const matchBudgetSchema = budgetSchema
export const skillSchema = z.enum(['beginner', 'intermediate', 'pro'])

export const quizSchema = z.object({
  task: slugSchema,
  budget: budgetSchema,
  skill: skillSchema,
})

export const emailSchema = z.string().trim().min(3).max(254).email()

export const newsletterFieldsSchema = z.object({
  email: z.string().max(320).optional().default(''),
  company_website: z.string().max(200).optional().default(''),
})

export const searchQuerySchema = z.string().trim().min(1).max(80)

export const gaIdSchema = z.string().regex(/^G-[A-Z0-9]+$/)

export type Budget = z.infer<typeof budgetSchema>
export type MatchBudget = z.infer<typeof matchBudgetSchema>
export type Skill = z.infer<typeof skillSchema>
export type QuizAnswers = z.infer<typeof quizSchema>

export function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export function parseComparePair(pair: string): { a: string; b: string } | null {
  const parts = pair.split('-vs-')
  if (parts.length !== 2) return null
  const a = slugSchema.safeParse(parts[0])
  const b = slugSchema.safeParse(parts[1])
  if (!a.success || !b.success) return null
  if (a.data === b.data) return null
  return { a: a.data, b: b.data }
}
