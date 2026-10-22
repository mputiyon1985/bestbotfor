import { skeleton } from './confusables'
import { normalizeDisplayName } from './normalize'

const RESERVED = [
  'bestbotfor',
  'best bot for',
  'bbf',
  'admin',
  'administrator',
  'moderator',
  'mod',
  'staff',
  'team',
  'support',
  'official',
  'editor',
  'verified',
  'system',
] as const

const SCRIPT_PATTERNS: { name: string; pattern: RegExp }[] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Armenian', /\p{Script=Armenian}/u],
  ['Georgian', /\p{Script=Georgian}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Hiragana', /\p{Script=Hiragana}/u],
  ['Katakana', /\p{Script=Katakana}/u],
  ['Han', /\p{Script=Han}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
].map(([name, pattern]) => ({ name: name as string, pattern: pattern as RegExp }))

const LETTER = /\p{L}/u
const MARKS = /\p{M}/gu

/**
 * Raw length, counted in Unicode code points before NFKC.
 * The message says "characters" because that count matches code points,
 * not UTF-16 code units. The normalized form uses the same cap: NFKC can
 * expand one character about 18 times.
 * reviews.display_name still allows only 60 code points. The write service
 * refuses a longer raw name so that limit does not need a migration.
 */
export const DISPLAY_NAME_MAX_LENGTH = 64

export const DISPLAY_NAME_TOO_LONG_MESSAGE = 'Display name must be 64 characters or fewer.'

export type DisplayNameContext = {
  toolNames?: readonly string[]
  vendorNames?: readonly string[]
}

export type DisplayNameDecision =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'mixed_script' | 'reserved' }
  | { ok: false; reason: 'too_long'; message: string }

export function codePointLength(value: string): number {
  let count = 0
  for (const _char of value) count += 1
  return count
}

/** The name shown on a review is the raw snapshot, not the NFKC form used for checks. */
export function reviewDisplayName(name: string): string {
  return name
}

function scriptOf(char: string): string | null {
  if (!LETTER.test(char)) return null
  for (const script of SCRIPT_PATTERNS) {
    if (script.pattern.test(char)) return script.name
  }
  return 'Other'
}

function mixesScripts(word: string): boolean {
  const seen = new Set<string>()
  for (const char of word) {
    const script = scriptOf(char)
    if (script) seen.add(script)
  }
  return seen.size > 1
}

/** NFD, then drop combining marks, so a + dot-above compares as the base letter. */
function stripCombiningMarks(value: string): string {
  return value.normalize('NFD').replace(MARKS, '')
}

function wordTokens(normalized: string): string[] {
  return stripCombiningMarks(normalized)
    .split(' ')
    .map((word) => skeleton(word.replace(/[^\p{L}\p{N}]+/gu, '')))
    .filter((word) => word.length > 0)
}

function compactSkeleton(value: string): string {
  return skeleton(stripCombiningMarks(value).replace(/[^\p{L}\p{N}]+/gu, ''))
}

function reservedTerms(extra: readonly string[]): { phrases: string[][]; compact: Set<string>; longest: number } {
  const phrases: string[][] = []
  const compact = new Set<string>()
  let longest = 0
  for (const term of [...RESERVED, ...extra]) {
    const normalized = normalizeDisplayName(term)
    const tokens = wordTokens(normalized)
    if (tokens.length > 0) phrases.push(tokens)
    const folded = compactSkeleton(normalized)
    if (folded.length === 0) continue
    compact.add(folded)
    if (folded.length > longest) longest = folded.length
  }
  return { phrases, compact, longest }
}

/**
 * True when two or more neighboring tokens join to a reserved term.
 * A join stops as soon as it is longer than the longest reserved term.
 */
function joinsReserved(tokens: string[], compact: Set<string>, longest: number): boolean {
  for (let start = 0; start < tokens.length; start += 1) {
    let acc = tokens[start] ?? ''
    if (acc.length >= longest) continue
    for (let end = start + 1; end < tokens.length; end += 1) {
      acc += tokens[end] ?? ''
      if (acc.length > longest) break
      if (compact.has(acc)) return true
    }
  }
  return false
}

function hasReservedPhrase(tokens: string[], phrases: string[][]): boolean {
  return phrases.some((phrase) => {
    if (phrase.length > tokens.length) return false
    for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
      if (phrase.every((part, offset) => tokens[start + offset] === part)) return true
    }
    return false
  })
}

/** Refuse a public name that impersonates staff, BestBotFor, or the tool's brand. Does not rewrite it. */
export function checkDisplayName(name: string, context: DisplayNameContext = {}): DisplayNameDecision {
  if (codePointLength(name) > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'too_long', message: DISPLAY_NAME_TOO_LONG_MESSAGE }
  }
  const normalized = normalizeDisplayName(name)
  if (codePointLength(normalized) > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, reason: 'too_long', message: DISPLAY_NAME_TOO_LONG_MESSAGE }
  }
  if (normalized.length === 0) return { ok: false, reason: 'empty' }
  const words = normalized.split(' ').map((word) => word.replace(/[^\p{L}\p{N}]+/gu, '')).filter((word) => word.length > 0)
  if (words.some(mixesScripts)) return { ok: false, reason: 'mixed_script' }
  const tokens = wordTokens(normalized)
  if (tokens.length === 0) return { ok: false, reason: 'empty' }
  const banned = reservedTerms([...(context.toolNames ?? []), ...(context.vendorNames ?? [])])
  const compact = compactSkeleton(normalized)
  const split = joinsReserved(tokens, banned.compact, banned.longest)
  if (hasReservedPhrase(tokens, banned.phrases) || banned.compact.has(compact) || split) {
    return { ok: false, reason: 'reserved' }
  }
  return { ok: true }
}
