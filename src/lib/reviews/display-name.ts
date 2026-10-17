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

export type DisplayNameContext = {
  toolNames?: readonly string[]
  vendorNames?: readonly string[]
}

export type DisplayNameDecision = { ok: true } | { ok: false; reason: 'empty' | 'mixed_script' | 'reserved' }

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

function reservedTerms(extra: readonly string[]): { phrases: string[][]; compact: Set<string> } {
  const phrases: string[][] = []
  const compact = new Set<string>()
  for (const term of [...RESERVED, ...extra]) {
    const normalized = normalizeDisplayName(term)
    const tokens = wordTokens(normalized)
    if (tokens.length > 0) phrases.push(tokens)
    const folded = compactSkeleton(normalized)
    if (folded.length > 0) compact.add(folded)
  }
  return { phrases, compact }
}

/** Every join of two or more neighboring tokens, so "ad" + "min" is "admin". */
function joinedAdjacentTokens(tokens: string[]): string[] {
  const joined: string[] = []
  for (let start = 0; start < tokens.length; start += 1) {
    let acc = ''
    for (let end = start; end < tokens.length; end += 1) {
      acc += tokens[end] ?? ''
      if (end > start) joined.push(acc)
    }
  }
  return joined
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
  const normalized = normalizeDisplayName(name)
  if (normalized.length === 0) return { ok: false, reason: 'empty' }
  const words = normalized.split(' ').map((word) => word.replace(/[^\p{L}\p{N}]+/gu, '')).filter((word) => word.length > 0)
  if (words.some(mixesScripts)) return { ok: false, reason: 'mixed_script' }
  const tokens = wordTokens(normalized)
  if (tokens.length === 0) return { ok: false, reason: 'empty' }
  const banned = reservedTerms([...(context.toolNames ?? []), ...(context.vendorNames ?? [])])
  const compact = compactSkeleton(normalized)
  const split = joinedAdjacentTokens(tokens).some((joined) => banned.compact.has(joined))
  if (hasReservedPhrase(tokens, banned.phrases) || banned.compact.has(compact) || split) {
    return { ok: false, reason: 'reserved' }
  }
  return { ok: true }
}
