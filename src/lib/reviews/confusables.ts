import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let prototypes: Map<string, string> | null = null

function loadPrototypes(): Map<string, string> {
  if (prototypes) return prototypes
  const file = join(dirname(fileURLToPath(import.meta.url)), 'data', 'confusables.txt')
  const map = new Map<string, string>()
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const body = raw.split('#')[0]?.trim() ?? ''
    if (body.length === 0) continue
    const [sourceHex, targetHex] = body.split(';')
    if (!sourceHex || !targetHex) continue
    const source = decodeHex(sourceHex)
    const target = decodeHex(targetHex)
    if (source.length === 1 && target.length > 0) map.set(source, target)
  }
  prototypes = map
  return map
}

function decodeHex(value: string): string {
  const codes = value.trim().split(/\s+/).filter((part) => part.length > 0)
  return String.fromCodePoint(...codes.map((part) => Number.parseInt(part, 16)))
}

/** TR39 skeleton: each character is replaced by its confusable prototype. */
export function skeleton(value: string): string {
  const map = loadPrototypes()
  let out = ''
  for (const char of value) out += map.get(char) ?? char
  return out.normalize('NFC')
}
