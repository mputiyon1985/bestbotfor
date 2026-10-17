import 'server-only'
import prototypesJson from './data/confusables.json'

/**
 * Unicode confusables 16.0.0 (2024-08-14), © 2024 Unicode, Inc.
 * Terms: https://www.unicode.org/terms_of_use.html
 * UTS #39: https://www.unicode.org/reports/tr39
 * Imported as a module so the production bundle contains the table.
 */
const prototypes = new Map<string, string>(Object.entries(prototypesJson as Record<string, string>))

/** TR39 skeleton: each character is replaced by its confusable prototype. */
export function skeleton(value: string): string {
  let out = ''
  for (const char of value) out += prototypes.get(char) ?? char
  return out.normalize('NFC')
}
