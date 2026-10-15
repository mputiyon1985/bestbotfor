import { ImageResponse } from 'next/og'
import { TAGLINE } from '@/lib/site'

export const alt = TAGLINE
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
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
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 600, lineHeight: 1.05 }}>{TAGLINE}</div>
        <div style={{ display: 'flex', fontSize: 24, color: '#1b4332' }}>bestbotfor.com</div>
      </div>
    ),
    { ...size },
  )
}
