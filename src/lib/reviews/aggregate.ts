export type AggregateInput = {
  stars: number
  weight: number
  countsTowardScore: number
}

export type ReviewAggregate = {
  publishedCount: number
  weightTotal: number
  weightedSum: number
  star1: number
  star2: number
  star3: number
  star4: number
  star5: number
}

/** Full rebuild of the published, counting ratings. Sponsor status is not an input. */
export function aggregateFromReviews(rows: readonly AggregateInput[]): ReviewAggregate {
  const totals: ReviewAggregate = {
    publishedCount: 0,
    weightTotal: 0,
    weightedSum: 0,
    star1: 0,
    star2: 0,
    star3: 0,
    star4: 0,
    star5: 0,
  }
  for (const row of rows) {
    if (row.countsTowardScore !== 1) continue
    if (!Number.isInteger(row.stars) || row.stars < 1 || row.stars > 5) continue
    if (row.weight !== 1 && row.weight !== 1.5) continue
    totals.publishedCount += 1
    totals.weightTotal += row.weight
    totals.weightedSum += row.stars * row.weight
    if (row.stars === 1) totals.star1 += 1
    if (row.stars === 2) totals.star2 += 1
    if (row.stars === 3) totals.star3 += 1
    if (row.stars === 4) totals.star4 += 1
    if (row.stars === 5) totals.star5 += 1
  }
  return totals
}
