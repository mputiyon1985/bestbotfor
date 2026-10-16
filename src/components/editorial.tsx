import Link from 'next/link'
import { UNMAINTAINED_NOTICE, ratingAriaLabel, starFills, type EditorialScore, type ProCon } from '@/lib/editorial'
import { formatUsDate } from '@/lib/format'
import { publicScore, scoresPublished } from '@/lib/score-visibility'

const STAR_PATH =
  'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

export function StarRating({ score, showScores = scoresPublished() }: { score: number; showScores?: boolean }) {
  if (!showScores) return null
  const fills = starFills(score)
  return (
    <span
      role="img"
      aria-label={ratingAriaLabel(score)}
      data-star-rating=""
      className="inline-flex max-w-full flex-wrap items-center gap-0.5"
    >
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
  showScores = scoresPublished(),
}: {
  editorial?: EditorialScore | null
  pros?: ProCon[]
  cons?: ProCon[]
  /** Pages leave this unset so SHOW_SCORES decides. */
  showScores?: boolean
}) {
  const score = publicScore(editorial, showScores)
  if (!score && pros.length === 0 && cons.length === 0) return null
  return (
    <div data-pros-cons="compact" className="mt-3 min-w-0 space-y-2 break-words">
      {score && editorial ? <RankLine editorial={editorial} compact /> : null}
      {score ? (
        <Link href="/how-we-rate" className="inline-flex max-w-full flex-wrap items-center gap-2 underline-offset-4 hover:underline">
          <StarRating score={score.overall} showScores={showScores} />
          <span className="text-sm text-muted">{score.overallText}</span>
        </Link>
      ) : null}
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

export function ScoreSection({
  editorial,
  showScores = scoresPublished(),
}: {
  editorial: EditorialScore | null
  /** Pages leave this unset so SHOW_SCORES decides. */
  showScores?: boolean
}) {
  const score = publicScore(editorial, showScores)
  if (!score || !editorial) return null
  return (
    <section aria-labelledby="score-heading" data-score-section="" className="min-w-0 space-y-4 break-words">
      <h2 id="score-heading" className="font-semibold text-3xl">
        {score.heading}
      </h2>
      {editorial.ratingStatus === UNMAINTAINED_NOTICE ? (
        <p role="status" data-maintenance-notice className="max-w-2xl rounded-2xl border border-line px-4 py-3 text-sm font-semibold">
          {UNMAINTAINED_NOTICE}
        </p>
      ) : null}
      <RankLine editorial={editorial} />
      <dl className="max-w-xl min-w-0 space-y-3">
        {score.criteria.map((part) => (
          <CriterionBar key={part.label} label={part.label} value={part.value} text={part.text} />
        ))}
      </dl>
      <p>
        <Link href="/how-we-rate" className="inline-flex max-w-full flex-wrap items-center gap-3 underline-offset-4 hover:underline">
          <StarRating score={score.overall} showScores={showScores} />
          <span className="text-sm text-muted">{score.overallText}</span>
        </Link>
      </p>
      {editorial.note ? <p data-score-note className="max-w-2xl text-sm text-muted">{editorial.note}</p> : null}
      {score.rationale.trim() ? <p className="max-w-2xl text-muted">{score.rationale}</p> : null}
      <p className="text-sm text-muted">Reviewed {formatUsDate(score.reviewedAt)}.</p>
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

function RankLine({ editorial, compact = false }: { editorial: EditorialScore; compact?: boolean }) {
  if (editorial.hideRank) return null
  return (
    <p data-category-rank={editorial.categoryRankDisplay} className={compact ? 'text-sm font-semibold' : 'font-semibold text-2xl'}>
      {editorial.tied ? <span data-tie="true">Tied · </span> : null}
      {editorial.categoryRankDisplay}
    </p>
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

function CriterionBar({ label, value, text }: { label: string; value: number; text: string }) {
  const width = Math.min(100, Math.max(0, (value / 5) * 100))
  return (
    <div data-criterion-row className="relative min-w-0">
      <dt className="pr-10 text-sm font-semibold">{label}</dt>
      <dd className="min-w-0">
        <span className="absolute top-0 right-0 text-sm font-semibold">{text}</span>
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
      </dd>
    </div>
  )
}
