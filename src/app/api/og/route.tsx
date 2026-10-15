import { getCatalog } from '@/lib/catalog'
import { brandedOgImage } from '@/lib/og-card'
import { ogCopy } from '@/lib/og'
import { z } from 'zod'

export const runtime = 'nodejs'

const querySchema = z.object({
  kind: z.enum(['compare', 'result', 'task']).optional(),
  pair: z.string().max(180).optional(),
  task: z.string().max(80).optional(),
  budget: z.string().max(20).optional(),
  skill: z.string().max(20).optional(),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(180).optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get('kind') ?? undefined,
    pair: url.searchParams.get('pair') ?? undefined,
    task: url.searchParams.get('task') ?? undefined,
    budget: url.searchParams.get('budget') ?? undefined,
    skill: url.searchParams.get('skill') ?? undefined,
    title: url.searchParams.get('title') ?? undefined,
    subtitle: url.searchParams.get('subtitle') ?? undefined,
  })
  const input = parsed.success ? parsed.data : {}
  const catalog = await getCatalog()
  const copy = ogCopy(input, catalog)
  return brandedOgImage(copy)
}
