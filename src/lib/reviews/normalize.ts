const BIDI = /[\u202A-\u202E\u2066-\u2069]/g
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060\u180E]/g

function stripControls(value: string, keepBreaks: boolean): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code === 0x2028 || code === 0x2029) {
      out += keepBreaks ? '\n' : ' '
      continue
    }
    if (code <= 0x1f) {
      if (keepBreaks && (code === 0x09 || code === 0x0a || code === 0x0d)) out += char
      continue
    }
    if (code >= 0x7f && code <= 0x9f) continue
    out += char
  }
  return out
}

/** NFC text for review fields. Strips controls, bidi overrides, and zero-width characters. Keeps line breaks. */
export function normalizeReviewText(value: string): string {
  const stripped = stripControls(value, true).replace(BIDI, '').replace(ZERO_WIDTH, '')
  return stripped.normalize('NFC')
}

/** NFKC, case-fold, and the same character strip, for display-name checks. */
export function normalizeDisplayName(value: string): string {
  const stripped = stripControls(value.normalize('NFKC'), false)
    .replace(BIDI, '')
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.normalize('NFC')
}
