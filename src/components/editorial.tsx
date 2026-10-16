import { HOW_WE_SCORE, ratingAriaLabel, starFills, type EditorialScore, type ProCon } from '@/lib/editorial'
import { formatUsDate } from '@/lib/format'

const STAR_PATH =
  'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

export function StarRating({ score }: { score: number }) {
  const fills = starFills(score)
  return (
    <span role="img" aria-label={ratingAriaLabel(score)} className="inline-flex max-w-full flex-wrap items-center gap-0.5">
      {fills.map((fill, index) => (
        <span key={index} data-star-fill={fill} className="relative inline-block h-5 w-5">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-soft">
            <path d={STAR_PATH} />
          </svg>
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-indigo">
              <path d={STAR_PATH} />
            </svg>
          </span>
        </span>
      ))}
    </span>
  )
}

export function EditorialCompact({
  editorial,
  pros = [],
  cons = [],
}: {
  editorial?: EditorialScore | null
  pros?: ProCon[]
  cons?: ProCon[]
}) {
  if (!editorial && pros.length === 0 && cons.length === 0) return null
  return (
    <div data-pros-cons="compact" className="mt-3 min-w-0 space-y-2 break-words">
      {editorial ? <StarRating score={editorial.overall} /> : null}
      <ProsConsCompact pros={pros} cons={cons} />
    </div>
  )
}

export function ProsConsCompact({ pros, cons }: { pros: ProCon[]; cons: ProCon[] }) {
  if (pros.length === 0 && cons.length === 0) return null
  return (
    <div className="min-w-0 break-words text-sm">
      {pros.length > 0 ? (
        <p>
          <span className="font-semibold">Pros: </span>
          {pros.map((item) => item.text).join(' ')}
        </p>
      ) : null}
      {cons.length > 0 ? (
        <p>
          <span className="font-semibold">Cons: </span>
          {cons.map((item) => item.text).join(' ')}
        </p>
      ) : null}
    </div>
  )
}

export function ScoreSection({ editorial }: { editorial: EditorialScore | null }) {
  if (!editorial) return null
  const parts = [
    ['Features', editorial.features],
    ['Value', editorial.value],
    ['Ease', editorial.ease],
    ['Quality', editorial.quality],
  ] as const
  return (
    <section aria-labelledby="score-heading" className="min-w-0 space-y-4">
      <h2 id="score-heading" className="font-semibold text-3xl">
        BestBotFor score
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <StarRating score={editorial.overall} />
        <p className="font-semibold">{formatScore(editorial.overall)} out of 5</p>
      </div>
      <dl className="max-w-xl min-w-0 space-y-3">
        {parts.map(([label, value]) => (
          <CriterionBar key={label} label={label} value={value} />
        ))}
      </dl>
      <p className="max-w-2xl text-muted">{editorial.rationale}</p>
      <div>
        <h3 className="font-semibold text-xl">How we score</h3>
        <p className="mt-2 max-w-2xl text-sm text-muted">{HOW_WE_SCORE}</p>
        <p className="mt-2 text-sm text-muted">Reviewed {formatUsDate(editorial.reviewedAt)}.</p>
      </div>
    </section>
  )
}

export function ProsConsSection({ pros, cons }: { pros: ProCon[]; cons: ProCon[] }) {
  if (pros.length === 0 && cons.length === 0) return null
  return (
    <section aria-labelledby="pros-cons-heading" data-pros-cons="full" className="min-w-0 space-y-4 break-words">
      <h2 id="pros-cons-heading" className="font-semibold text-3xl">
        Pros and cons
      </h2>
      {pros.length > 0 ? <PointList title="Pros" points={pros} /> : null}
      {cons.length > 0 ? <PointList title="Cons" points={cons} /> : null}
    </section>
  )
}

function PointList({ title, points }: { title: string; points: ProCon[] }) {
  return (
    <div>
      <h3 className="font-semibold text-xl">{title}</h3>
      <ul className="mt-2 space-y-3">
        {points.map((point) => (
          <li key={`${point.kind}-${point.text}`}>
            <p className="break-words">{point.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CriterionBar({ label, value }: { label: string; value: number }) {
  const width = Math.min(100, Math.max(0, (value / 5) * 100))
  const text = formatScore(value)
  return (
    <div data-criterion-row className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-sm font-semibold">{label}</dt>
        <dd className="text-sm font-semibold">{text}</dd>
      </div>
      <div
        className="mt-1 h-2 w-full min-w-0 overflow-hidden rounded-full bg-mist"
        role="meter"
        aria-label={`${label} ${text} out of 5`}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        data-criterion={label.toLowerCase()}
      >
        <div className="h-full rounded-full bg-indigo" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function formatScore(value: number): string {
  const tenths = Math.round(value * 10)
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1)
}
