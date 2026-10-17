import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { skeleton } from './confusables'

describe('confusables', () => {
  it('loads the vendored table as a module, with no filesystem read', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/reviews/confusables.ts'), 'utf8')
    expect(source).not.toMatch(/node:fs|readFileSync|confusables\.txt/)
    expect(source).toContain("import 'server-only'")
    expect(source).toContain('./data/confusables.json')
    expect(skeleton('\u0435')).toBe('e')
  })
})