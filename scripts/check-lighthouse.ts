import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

function findChrome(directory: string): string | null {
  const stack = [directory]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || !existsSync(current)) continue
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.name === 'chrome' || entry.name === 'chromium') return full
    }
  }
  return null
}

function chromePath(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH
  const roots = [
    path.join(process.env.HOME ?? '', '.cache', 'ms-playwright'),
    path.join(process.cwd(), 'node_modules', 'playwright-core', '.local-browsers'),
  ]
  for (const root of roots) {
    const found = findChrome(root)
    if (found) return found
  }
  return null
}

const chrome = chromePath()
if (!chrome) {
  console.error('Install Playwright Chromium before Lighthouse: npx playwright install chromium')
  process.exit(1)
}

// Pinned outside package.json so Lighthouse's transitive advisories do not fail npm audit.
const result = spawnSync('npx', ['--yes', '@lhci/cli@0.15.1', 'autorun'], {
  stdio: 'inherit',
  env: { ...process.env, CHROME_PATH: chrome },
})

process.exit(result.status ?? 1)
