import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { BRAND, LOGO_DARK_RASTER_PATH } from './brand'
import type { OgCopy } from './og'

export const OG_SIZE = { width: 1200, height: 630 }

/** Night stop from the kit OG radial gradient. Ink is the other stop. */
const OG_NIGHT = '#2A2370'

/** Native pixels of bestbotfor-lockup-dark@2x.png. Shown 1:1 so the lockup is not cropped or stretched. */
const LOGO_WIDTH = 853
const LOGO_HEIGHT = 200

type Assets = {
  bold: Buffer
  medium: Buffer
  semibold: Buffer
  logo: string
}

let assets: Promise<Assets> | null = null

function loadAssets(): Promise<Assets> {
  if (!assets) {
    const root = process.cwd()
    assets = Promise.all([
      readFile(path.join(root, 'src/fonts/Poppins-Bold.ttf')),
      readFile(path.join(root, 'src/fonts/Poppins-Medium.ttf')),
      readFile(path.join(root, 'src/fonts/Poppins-SemiBold.ttf')),
      readFile(path.join(root, 'public', LOGO_DARK_RASTER_PATH)),
    ]).then(([bold, medium, semibold, logo]) => ({
      bold,
      medium,
      semibold,
      logo: `data:image/png;base64,${logo.toString('base64')}`,
    }))
  }
  return assets
}

/** Per-page link preview. Static pages use the kit PNG instead. */
export async function brandedOgImage(copy: OgCopy): Promise<ImageResponse> {
  const { bold, medium, semibold, logo } = await loadAssets()
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundImage: `radial-gradient(circle at 50% 40%, ${OG_NIGHT} 0%, ${BRAND.ink} 75%)`,
          color: BRAND.white,
          padding: '48px 72px 40px',
        }}
      >
        <img src={logo} width={LOGO_WIDTH} height={LOGO_HEIGHT} alt="" />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            width: 1040,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: 1040,
              fontFamily: 'Poppins',
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.12,
              color: BRAND.white,
              textAlign: 'center',
            }}
          >
            {copy.title}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: 980,
              fontFamily: 'Poppins',
              fontWeight: 500,
              fontSize: 28,
              lineHeight: 1.3,
              color: BRAND.softIndigo,
              textAlign: 'center',
            }}
          >
            {copy.subtitle}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'Poppins',
            fontWeight: 600,
            fontSize: 26,
            color: BRAND.white,
          }}
        >
          bestbotfor.com
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Poppins', data: bold, weight: 700, style: 'normal' },
        { name: 'Poppins', data: medium, weight: 500, style: 'normal' },
        { name: 'Poppins', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  )
}
