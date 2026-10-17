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

export type DisplayNameContext = {
  toolNames?: readonly string[]
  vendorNames?: readonly string[]
}

export type DisplayNameDecision = { ok: true } | { ok: false; reason: 'empty' | 'mixed_script' | 'reserved' }

function compact(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, '')
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

function reservedSkeletons(extra: readonly string[]): string[] {
  const terms = [...RESERVED, ...extra]
  const out: string[] = []
  for (const term of terms) {
    const folded = skeleton(compact(normalizeDisplayName(term)))
    if (folded.length > 0) out.push(folded)
  }
  return out
}

/** Refuse a public name that impersonates staff, BestBotFor, or the tool's brand. Does not rewrite it. */
export function checkDisplayName(name: string, context: DisplayNameContext = {}): DisplayNameDecision {
  const normalized = normalizeDisplayName(name)
  if (normalized.length === 0) return { ok: false, reason: 'empty' }
  const words = normalized.split(' ').map((word) => word.replace(/[^\p{L}\p{N}]+/gu, '')).filter((word) => word.length > 0)
  if (words.some(mixesScripts)) return { ok: false, reason: 'mixed_script' }
  const folded = skeleton(compact(normalized))
  const banned = reservedSkeletons([...(context.toolNames ?? []), ...(context.vendorNames ?? [])])
  if (banned.some((term) => folded.includes(term))) return { ok: false, reason: 'reserved' }
  return { ok: true }
}
