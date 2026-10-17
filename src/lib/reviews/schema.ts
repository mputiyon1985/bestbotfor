import { z } from 'zod'

export const REVIEW_ROLES = [
  'Student',
  'Individual or freelancer',
  'Developer',
  'Designer or creative',
  'Marketer',
  'Founder or manager',
  'Educator',
  'Researcher',
  'Other',
] as const

export const USAGE_DURATIONS = [
  'Less than a month',
  '1 to 6 months',
  '6 to 12 months',
  '1 to 2 years',
  'More than 2 years',
] as const

export const PLAN_TYPES = ['Free plan', 'Paid plan', 'Free trial'] as const

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const reviewFormSchema = z
  .object({
    stars: z.number().int().min(1).max(5),
    pros: z.string().max(1000).default(''),
    cons: z.string().max(1000).default(''),
    useCaseText: z.string().max(280).default(''),
    role: z.preprocess(blankToUndefined, z.enum(REVIEW_ROLES).optional()),
    usageDuration: z.preprocess(blankToUndefined, z.enum(USAGE_DURATIONS).optional()),
    planType: z.preprocess(blankToUndefined, z.enum(PLAN_TYPES).optional()),
    connection: z.enum(['none', 'disclosed']),
    connectionText: z.string().max(140).default(''),
    attestation: z.literal(true),
  })
  .superRefine((value, context) => {
    if (value.connection === 'none' && value.connectionText !== '') {
      context.addIssue({
        code: 'custom',
        path: ['connectionText'],
        message: 'Leave the connection description empty when you have no connection',
      })
    }
    if (value.connection === 'disclosed' && (value.connectionText.length < 1 || value.connectionText.length > 140)) {
      context.addIssue({
        code: 'custom',
        path: ['connectionText'],
        message: 'Describe the connection in 1 to 140 characters',
      })
    }
  })

export type ReviewFormInput = z.infer<typeof reviewFormSchema>
