import { jsonLdScript } from '@/lib/jsonld'
import { jsonLdForPage } from '@/lib/score-visibility'

export function JsonLd({ data, nonce }: { data: unknown; nonce: string | null }) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce ?? undefined}
      dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLdForPage(data)) }}
    />
  )
}
