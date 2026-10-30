export const SOURCE_IDS = ['turso', 'beehiiv', 'clerk'] as const

export type SourceId = (typeof SOURCE_IDS)[number]

export const SOURCE_LABELS: Record<SourceId, string> = {
  turso: 'Turso',
  beehiiv: 'Beehiiv',
  clerk: 'Clerk',
}

export type Signup = {
  source: SourceId
  email: string
  createdAt: string
}

export type SourceResult = {
  source: SourceId
  ok: boolean
  signups: Signup[]
  total: number | null
  capped: boolean
}

export const MAX_SIGNUPS = 5000

export function unavailable(source: SourceId): SourceResult {
  return { source, ok: false, signups: [], total: null, capped: false }
}
