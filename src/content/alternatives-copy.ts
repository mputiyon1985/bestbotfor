/**
 * Editorial copy slots for /alternatives/<tool> pages (Nova supplies copy).
 * Every slot is optional and empty until reviewed copy lands. Pages render
 * only from catalog data (fits, prices, pros, cons) when a slot is empty.
 * Rules for filled slots: factual, sourced, no ratings, no invented claims.
 */
export type AlternativesCopy = {
  /** One or two sentences under the heading. */
  intro?: string
  /** Closing note shown above the profile links. */
  note?: string
}

export const ALTERNATIVES_COPY: Readonly<Record<string, AlternativesCopy>> = {}

export function alternativesCopy(toolSlug: string): AlternativesCopy {
  const copy = Object.hasOwn(ALTERNATIVES_COPY, toolSlug) ? ALTERNATIVES_COPY[toolSlug] : undefined
  return {
    intro: copy?.intro?.trim() || undefined,
    note: copy?.note?.trim() || undefined,
  }
}
