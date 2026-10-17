import { COMPARE_DIGEST_FINE_PRINT } from '@/data/compare-copy'
import { inlineParts } from '@/lib/compare-copy'
import { NewsletterForm } from './newsletter-form'

export function CompareNewsletter({
  idSuffix,
  cta,
  label,
}: {
  idSuffix: string
  cta: string
  label: string
}) {
  return (
    <section aria-label={label} className="rounded-3xl border border-line p-6">
      <p>
        <Inline text={cta} />
      </p>
      <div className="mt-4">
        <NewsletterForm idSuffix={idSuffix} />
      </div>
      <p className="text-sm text-muted">{COMPARE_DIGEST_FINE_PRINT}</p>
    </section>
  )
}

export function Inline({ text }: { text: string }) {
  return inlineParts(text).map((part, index) =>
    part.strong ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>,
  )
}
