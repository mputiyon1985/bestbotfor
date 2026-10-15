import { ImageResponse } from 'next/og'
import { getCatalog } from '@/lib/catalog'
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
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f6f1e7',
          color: '#1c1915',
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', color: '#1b4332' }}>
          BestBotFor
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 600, lineHeight: 1.05, maxWidth: 980 }}>{copy.title}</div>
          <div style={{ display: 'flex', fontSize: 28, color: '#5c564c', maxWidth: 900 }}>{copy.subtitle}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#1b4332' }}>bestbotfor.com</div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
