import { ImageResponse } from 'next/og'
import { getCatalog } from '@/lib/catalog'
import { TAGLINE } from '@/lib/site'
import { z } from 'zod'

export const runtime = 'nodejs'

const querySchema = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(180).optional(),
  task: z.string().max(80).optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    title: url.searchParams.get('title') ?? undefined,
    subtitle: url.searchParams.get('subtitle') ?? undefined,
    task: url.searchParams.get('task') ?? undefined,
  })
  let title = parsed.success ? parsed.data.title : undefined
  let subtitle = parsed.success ? parsed.data.subtitle : undefined
  if (parsed.success && parsed.data.task) {
    const catalog = await getCatalog()
    const task = catalog.tasks.find((item) => item.slug === parsed.data.task)
    if (task) {
      title = `Best AI tool for ${task.name}`
      subtitle = task.description
    }
  }
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
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 600, lineHeight: 1.05, maxWidth: 980 }}>
            {title ?? TAGLINE}
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: '#5c564c', maxWidth: 900 }}>{subtitle ?? 'Three questions. One best bot.'}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#1b4332' }}>bestbotfor.com</div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
