import { spawn, type ChildProcess } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const port = process.env.LHCI_PORT || String(4400 + Math.floor(Math.random() * 400))
process.env.LHCI_PORT = port
const origin = `http://127.0.0.1:${port}`

function startServer(): ChildProcess {
  return spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', port], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || 'file:./data/ci.db',
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
      NEXT_PUBLIC_SITE_URL: origin,
    },
  })
}

async function waitForServer(child: ChildProcess): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 60_000) {
    if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`)
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error('next start did not become ready')
}

async function printMetrics(): Promise<void> {
  const directory = path.join(process.cwd(), '.lighthouseci')
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json') && name.includes('lhr'))
  for (const name of names) {
    const report = JSON.parse(await readFile(path.join(directory, name), 'utf8')) as {
      finalDisplayedUrl?: string
      audits?: Record<string, { numericValue?: number }>
      categories?: Record<string, { score?: number }>
    }
    const lcp = report.audits?.['largest-contentful-paint']?.numericValue
    const tbt = report.audits?.['total-blocking-time']?.numericValue
    const performance = report.categories?.performance?.score
    console.log(
      `lighthouse ${report.finalDisplayedUrl ?? name}: LCP ${lcp?.toFixed(0) ?? '?'}ms, TBT ${tbt?.toFixed(0) ?? '?'}ms, performance ${performance ?? '?'}`,
    )
  }
}

async function main(): Promise<number> {
  process.env.CHROME_PATH = process.env.CHROME_PATH || chromium.executablePath()
  const server = startServer()
  try {
    await waitForServer(server)
    await fetch(origin)
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn('npx', ['--yes', '@lhci/cli@0.15.1', 'autorun'], {
        stdio: 'inherit',
        env: process.env,
      })
      child.on('error', reject)
      child.on('exit', (code) => resolve(code ?? 1))
    })
    await printMetrics()
    return exitCode
  } finally {
    server.kill('SIGTERM')
  }
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
