import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { readdir, readFile, rename, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { homeLcpError, homeTbtError, median, performanceErrors } from '../src/lib/lighthouse-gate'

const ROOT = process.cwd()
const MAIN_DIR = '/tmp/lh-main'

type Report = {
  finalDisplayedUrl?: string
  audits?: Record<string, { numericValue?: number }>
  categories?: Record<string, { score?: number | null }>
}

type Sample = {
  performance: number
  accessibility: number
  bestPractices: number
  seo: number
  lcp: number
  tbt: number
}

const PAGE_CONFIG = 'lighthouserc.cjs'
const QUIZ_CONFIG = 'lighthouserc.quiz.cjs'
const HOME_CONFIG = 'lighthouserc.home.cjs'

function serverEnv(origin: string, databaseUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TURSO_DATABASE_URL: databaseUrl,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || 'local',
    NEXT_PUBLIC_SITE_URL: origin,
    VERCEL_ENV: 'production',
    RATE_LIMIT_HMAC_SECRET: 'lighthouse-rate-limit-hmac-secret-40b-ok',
    REVIEW_IP_HMAC_SECRET: 'lighthouse-review-ip-hmac-secret-40b-ok!',
    REVIEW_IP_HMAC_KEY_ID: 'k1',
    REVIEW_IP_HMAC_SECRET_PREVIOUS: '',
    REVIEW_IP_HMAC_KEY_ID_PREVIOUS: '',
    BBF_E2E_HOOKS: '',
  }
}

function startServer(cwd: string, port: string, databaseUrl: string): ChildProcess {
  const origin = `http://127.0.0.1:${port}`
  return spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', port], {
    cwd,
    stdio: 'inherit',
    env: serverEnv(origin, databaseUrl),
  })
}

async function waitForServer(child: ChildProcess, origin: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 90_000) {
    if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`)
    try {
      const response = await fetch(origin)
      if (response.ok) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`)
        return
      }
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error('next start did not become ready')
}

function stopServer(child: ChildProcess): void {
  child.kill('SIGTERM')
}

const WARM_PATHS = [
  '/',
  '/best/coding',
  '/best/seo',
  '/tools',
  '/tools/chatgpt',
  '/result?task=chat&budget=any&skill=beginner',
  '/result?task=seo&budget=free&skill=beginner',
  '/result?task=chat&view=all',
  '/result?task=seo&view=all&budget=free',
]

async function warm(origin: string): Promise<void> {
  for (const urlPath of WARM_PATHS) {
    const response = await fetch(`${origin}${urlPath}`)
    if (!response.ok) throw new Error(`warmup ${urlPath} returned ${response.status}`)
    await response.arrayBuffer()
  }
}

function robotsContent(html: string): string {
  const tag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0]
  const content = tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1]
  if (!content) throw new Error('missing robots meta')
  return content
}

async function assertProductionRobots(origin: string): Promise<void> {
  const cases: Array<{ path: string; content: string }> = [
    { path: '/best/chat', content: 'index, follow' },
    { path: '/best/seo', content: 'index, follow' },
    { path: '/result?task=chat&view=all', content: 'noindex, follow' },
    { path: '/result?task=seo&view=all', content: 'noindex, follow' },
    { path: '/result?task=chat&budget=any&skill=beginner', content: 'noindex, follow' },
    { path: '/result?task=seo&budget=free&skill=beginner', content: 'noindex, follow' },
    { path: '/result?task=seo&view=all&budget=free', content: 'noindex, follow' },
  ]
  for (const item of cases) {
    const response = await fetch(`${origin}${item.path}`)
    if (!response.ok) throw new Error(`${item.path} returned ${response.status}`)
    const content = robotsContent(await response.text())
    if (content !== item.content) throw new Error(`${item.path} robots meta was "${content}", expected "${item.content}"`)
  }
}

/** LHCI always writes `cwd/.lighthouseci`. Move that aside so the next config does not wipe it. */
async function runLhci(command: 'autorun' | 'collect', config: string, outDir: string, port: string): Promise<number> {
  const scratch = path.join(ROOT, '.lighthouseci')
  await rm(scratch, { recursive: true, force: true })
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn('npx', ['--yes', '@lhci/cli@0.15.1', command, '--config', config], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, LHCI_PORT: port, CHROME_PATH: process.env.CHROME_PATH },
    })
    child.on('error', reject)
    child.on('exit', (status) => resolve(status ?? 1))
  })
  await rm(outDir, { recursive: true, force: true })
  try {
    await rename(scratch, outDir)
  } catch (error) {
    if (code !== 0) return code
    throw error
  }
  return code
}

async function readSamples(outDir: string): Promise<Map<string, Sample[]>> {
  const names = (await readdir(outDir)).filter((name) => name.startsWith('lhr-') && name.endsWith('.json'))
  const grouped = new Map<string, Sample[]>()
  for (const name of names) {
    const report = JSON.parse(await readFile(path.join(outDir, name), 'utf8')) as Report
    const url = report.finalDisplayedUrl ? new URL(report.finalDisplayedUrl).pathname + new URL(report.finalDisplayedUrl).search : name
    const sample: Sample = {
      performance: report.categories?.performance?.score ?? Number.NaN,
      accessibility: report.categories?.accessibility?.score ?? Number.NaN,
      bestPractices: report.categories?.['best-practices']?.score ?? Number.NaN,
      seo: report.categories?.seo?.score ?? Number.NaN,
      lcp: report.audits?.['largest-contentful-paint']?.numericValue ?? Number.NaN,
      tbt: report.audits?.['total-blocking-time']?.numericValue ?? Number.NaN,
    }
    const list = grouped.get(url) ?? []
    list.push(sample)
    grouped.set(url, list)
    console.log(
      `lighthouse ${url}: LCP ${sample.lcp.toFixed(0)}ms, TBT ${sample.tbt.toFixed(0)}ms, performance ${sample.performance.toFixed(2)}`,
    )
  }
  return grouped
}

function requireUrl(groups: Map<string, Sample[]>, url: string): Sample[] {
  const samples = groups.get(url)
  if (!samples || samples.length === 0) throw new Error(`no Lighthouse runs for ${url}`)
  return samples
}

async function prepareMain(): Promise<void> {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', MAIN_DIR], { cwd: ROOT, stdio: 'ignore' })
  } catch {
    // no previous worktree
  }
  await rm(MAIN_DIR, { recursive: true, force: true })
  execFileSync('git', ['fetch', 'origin', 'main'], { cwd: ROOT, stdio: 'inherit' })
  execFileSync('git', ['worktree', 'add', '--detach', MAIN_DIR, 'origin/main'], { cwd: ROOT, stdio: 'inherit' })
  await symlink(path.join(ROOT, 'node_modules'), path.join(MAIN_DIR, 'node_modules'))
  execFileSync('npm', ['run', 'build'], {
    cwd: MAIN_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      TURSO_DATABASE_URL: 'file:./data/ci.db',
      NEXT_PUBLIC_SITE_URL: 'https://bestbotfor.com',
      NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID || 'G-TESTCONSENT',
      RATE_LIMIT_HMAC_SECRET: process.env.RATE_LIMIT_HMAC_SECRET || 'ci-rate-limit-hmac-secret-value-40-bytes',
      REVIEW_IP_HMAC_SECRET: process.env.REVIEW_IP_HMAC_SECRET || 'ci-review-ip-hmac-secret-value-42-bytes-ok',
      REVIEW_IP_HMAC_KEY_ID: process.env.REVIEW_IP_HMAC_KEY_ID || 'k1',
    },
  })
}

async function removeMain(): Promise<void> {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', MAIN_DIR], { cwd: ROOT, stdio: 'ignore' })
  } catch {
    await rm(MAIN_DIR, { recursive: true, force: true })
  }
}

async function collect(label: string, cwd: string, port: string, databaseUrl: string, command: 'autorun' | 'collect'): Promise<{
  pages: Map<string, Sample[]>
  quiz: Map<string, Sample[]>
  home: Map<string, Sample[]>
  exitCode: number
}> {
  const origin = `http://127.0.0.1:${port}`
  const server = startServer(cwd, port, databaseUrl)
  try {
    await waitForServer(server, origin)
    if (label === 'pr') await assertProductionRobots(origin)
    await warm(origin)
    let exitCode = 0
    const dirs = {
      pages: path.join(ROOT, `.lighthouseci-${label}-pages`),
      quiz: path.join(ROOT, `.lighthouseci-${label}-quiz`),
      home: path.join(ROOT, `.lighthouseci-${label}-home`),
    }
    await rm(dirs.pages, { recursive: true, force: true })
    await rm(dirs.quiz, { recursive: true, force: true })
    await rm(dirs.home, { recursive: true, force: true })
    for (const [config, dir] of [
      [PAGE_CONFIG, dirs.pages],
      [QUIZ_CONFIG, dirs.quiz],
      [HOME_CONFIG, dirs.home],
    ] as const) {
      const code = await runLhci(command, config, dir, port)
      if (code !== 0) exitCode = code
    }
    return {
      pages: await readSamples(dirs.pages),
      quiz: await readSamples(dirs.quiz),
      home: await readSamples(dirs.home),
      exitCode,
    }
  } finally {
    stopServer(server)
  }
}

function compare(pr: Awaited<ReturnType<typeof collect>>, main: Awaited<ReturnType<typeof collect>>): string[] {
  const errors: string[] = []
  const urls = new Set([...pr.pages.keys(), ...pr.quiz.keys()])
  for (const url of urls) {
    const prSamples = (pr.pages.get(url) ?? pr.quiz.get(url) ?? []).map((sample) => sample.performance)
    const mainSamples = (main.pages.get(url) ?? main.quiz.get(url) ?? []).map((sample) => sample.performance)
    if (prSamples.length === 0 || mainSamples.length === 0) {
      errors.push(`${url} is missing a performance median`)
      continue
    }
    const prMedian = median(prSamples)
    const mainMedian = median(mainSamples)
    console.log(`lighthouse compare ${url}: performance pr ${prMedian.toFixed(2)} main ${mainMedian.toFixed(2)}`)
    errors.push(...performanceErrors(url, prSamples, mainSamples))
  }
  const prHome = requireUrl(pr.home, '/')
  const mainHome = requireUrl(main.home, '/')
  const prTbt = median(prHome.map((sample) => sample.tbt))
  const mainTbt = median(mainHome.map((sample) => sample.tbt))
  const prLcp = Math.min(...prHome.map((sample) => sample.lcp))
  console.log(`lighthouse compare /: TBT pr median ${prTbt.toFixed(1)}ms main median ${mainTbt.toFixed(1)}ms, LCP best ${prLcp.toFixed(0)}ms`)
  const tbt = homeTbtError(prHome.map((sample) => sample.tbt), mainHome.map((sample) => sample.tbt))
  if (tbt) errors.push(tbt)
  const lcp = homeLcpError(prHome.map((sample) => sample.lcp))
  if (lcp) errors.push(lcp)
  for (const [name, pick] of [
    ['accessibility', (sample: Sample) => sample.accessibility],
    ['best-practices', (sample: Sample) => sample.bestPractices],
    ['seo', (sample: Sample) => sample.seo],
  ] as const) {
    for (const [url, samples] of pr.pages) {
      const value = median(samples.map(pick))
      if (value < 0.95) errors.push(`${url} ${name} median ${value.toFixed(2)} is under 0.95`)
    }
  }
  for (const [name, pick] of [
    ['accessibility', (sample: Sample) => sample.accessibility],
    ['best-practices', (sample: Sample) => sample.bestPractices],
  ] as const) {
    for (const [url, samples] of pr.quiz) {
      const value = median(samples.map(pick))
      if (value < 0.95) errors.push(`${url} ${name} median ${value.toFixed(2)} is under 0.95`)
    }
  }
  return errors
}

async function main(): Promise<number> {
  process.env.CHROME_PATH = process.env.CHROME_PATH || chromium.executablePath()
  const port = process.env.LHCI_PORT || String(4400 + Math.floor(Math.random() * 400))
  const pr = await collect('pr', ROOT, port, process.env.TURSO_DATABASE_URL || 'file:./data/ci.db', 'autorun')
  if (pr.exitCode !== 0) return pr.exitCode
  await prepareMain()
  try {
    const baseline = await collect('main', MAIN_DIR, port, 'file:./data/ci.db', 'collect')
    const errors = compare(pr, baseline)
    for (const error of errors) console.error(error)
    return errors.length === 0 ? 0 : 1
  } finally {
    await removeMain()
  }
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
