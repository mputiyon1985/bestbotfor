/**
 * Buyer company names are published next to a Sponsored label.
 * Strip bidi overrides and control characters before the name is stored or shown.
 * Letters, marks, and punctuation stay.
 */
const BIDI = new Set<number>([
  0x061c, // Arabic letter mark
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x202a, // left-to-right embedding
  0x202b, // right-to-left embedding
  0x202c, // pop directional formatting
  0x202d, // left-to-right override
  0x202e, // right-to-left override
  0x2066, // left-to-right isolate
  0x2067, // right-to-left isolate
  0x2068, // first strong isolate
  0x2069, // pop directional isolate
  0xfeff, // byte order mark
])

function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
}

export function sanitizeSponsorCompany(value: string): string {
  let cleaned = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (isControl(code) || BIDI.has(code)) continue
    cleaned += char
  }
  return cleaned.trim()
}
