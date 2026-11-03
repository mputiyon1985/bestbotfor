import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { lstatSync, readlinkSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import {
  ABSOLUTE_RETRY_SAMPLES,
  ABSOLUTE_SAMPLES,
  absolutePerformanceError,
  absoluteRetryTargets,
  HOME_LCP_CAP_MS,
  HOME_TBT_CAP_MS,
  HOME_TBT_HARD_CEILING_MS,
  LIGHTHOUSE_GATE_COPY,
  homeLcpError,
  homeTbtError,
  median,
  performanceErrors,
  PERFORMANCE_MEDIAN_MIN,
  pullRequestFirst,
} from '../src/lib/lighthouse-gate'

const ROOT = process.env.LH_APP_ROOT || process.cwd()
const MAIN_DIR = '/tmp/lh-main'
const PAGE_URLS = ['/', '/best/coding', '/best/seo', '/tools', '/tools/chatgpt']
const QUIZ_URLS = [
  '/result?task=chat&budget=any&skill=beginner',
  '/result?task=seo&budget=free&skill=beginner',
  '/result?task=chat&view=all',
  '/result?task=seo&view=all&budget=free',
]
const HOME_URLS = ['/']
const COMPARE_SAMPLES = 3

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

function absoluteGate(): boolean {
  const event = process.env.GITHUB_EVENT_NAME ?? ''
  const ref = process.env.GITHUB_REF ?? ''
  if (process.env.LH_ABSOLUTE === '1') return true
  if (event === 'schedule') return true
  return event === 'push' && ref === 'refs/heads/main'
}

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
  // Turbopack will not follow a node_modules symlink that points outside the worktree.
  execFileSync('npm', ['ci'], { cwd: MAIN_DIR, stdio: 'inherit', env: process.env })
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

function emptyGroups(): Map<string, Sample[]> {
  return new Map()
}

function pushSample(groups: Map<string, Sample[]>, url: string, sample: Sample, label: string): void {
  const list = groups.get(url) ?? []
  list.push(sample)
  groups.set(url, list)
  console.log(
    `lighthouse ${label} ${url}: LCP ${sample.lcp.toFixed(0)}ms, TBT ${sample.tbt.toFixed(0)}ms, performance ${sample.performance.toFixed(2)}`,
  )
}

async function oneRun(port: string, urlPath: string): Promise<Sample> {
  const outDir = path.join('/tmp', `lhci-out-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const configPath = path.join('/tmp', 'lhci-one.cjs')
  const chromePath = process.env.CHROME_PATH
  const settings = {
    chromeFlags: '--no-sandbox --disable-dev-shm-usage',
    ...(chromePath ? { chromePath } : {}),
  }
  await mkdir('/tmp', { recursive: true })
  await writeFile(
    configPath,
    `module.exports = { ci: { collect: { url: [${JSON.stringify(`http://127.0.0.1:${port}${urlPath}`)}], numberOfRuns: 1, settings: ${JSON.stringify(settings)} }, upload: { target: 'filesystem', outputDir: '.lighthouseci' } } }\n`,
  )
  const code = await runLhci('collect', configPath, outDir, port)
  if (code !== 0) throw new Error(`lighthouse ${urlPath} exited ${code}`)
  const groups = await readSamples(outDir)
  const samples = groups.get(urlPath)
  const sample = samples?.[0]
  if (!sample) throw new Error(`no Lighthouse run for ${urlPath}`)
  return sample
}

type RunGroups = { pages: Map<string, Sample[]>; quiz: Map<string, Sample[]>; home: Map<string, Sample[]> }

type PlannedUrl = { bucket: keyof RunGroups; url: string; index: number }

function measurementPlan(filter?: { pages: string[]; quiz: string[]; home: boolean }): PlannedUrl[] {
  const items = [
    ...PAGE_URLS.map((url) => ({ bucket: 'pages' as const, url })),
    ...QUIZ_URLS.map((url) => ({ bucket: 'quiz' as const, url })),
    ...HOME_URLS.map((url) => ({ bucket: 'home' as const, url })),
  ]
  const planned = items.map((item, index) => ({ ...item, index }))
  if (!filter) return planned
  return planned.filter((item) => {
    if (item.bucket === 'home') return filter.home
    if (item.bucket === 'pages') return filter.pages.includes(item.url)
    return filter.quiz.includes(item.url)
  })
}

async function collectSample(port: string, url: string, label: string, keep: { groups: RunGroups; bucket: keyof RunGroups } | null): Promise<void> {
  const sample = await oneRun(port, url)
  if (!keep) {
    console.log(
      `lighthouse warmup discarded ${label} ${url}: LCP ${sample.lcp.toFixed(0)}ms, TBT ${sample.tbt.toFixed(0)}ms, performance ${sample.performance.toFixed(2)}`,
    )
    return
  }
  pushSample(keep.groups[keep.bucket], url, sample, label)
}

/** Even pairs run the pull request first. Odd pairs run main first. The warmup sample is not counted. */
async function runCompared(ports: { pr: string; main: string }, groups: { pr: RunGroups; main: RunGroups }): Promise<void> {
  const plan = measurementPlan()
  console.log('lighthouse pairs alternate; even pairs run the pull request first')
  for (const item of plan) {
    const order = pullRequestFirst(item.index) ? (['pr', 'main'] as const) : (['main', 'pr'] as const)
    for (const side of order) {
      await collectSample(side === 'pr' ? ports.pr : ports.main, item.url, side, null)
    }
  }
  for (let run = 0; run < COMPARE_SAMPLES; run += 1) {
    for (const item of plan) {
      const order = pullRequestFirst(run + item.index) ? (['pr', 'main'] as const) : (['main', 'pr'] as const)
      for (const side of order) {
        const target = side === 'pr' ? groups.pr : groups.main
        await collectSample(side === 'pr' ? ports.pr : ports.main, item.url, side, { groups: target, bucket: item.bucket })
      }
    }
  }
}

async function runAbsolute(port: string, groups: RunGroups, runs: number, filter?: { pages: string[]; quiz: string[]; home: boolean }): Promise<void> {
  const plan = measurementPlan(filter)
  if (!filter) {
    for (const item of plan) await collectSample(port, item.url, 'absolute', null)
  }
  for (let run = 0; run < runs; run += 1) {
    for (const item of plan) {
      await collectSample(port, item.url, 'absolute', { groups, bucket: item.bucket })
    }
  }
}

function categoryErrors(groups: Map<string, Sample[]>, names: Array<[string, (sample: Sample) => number]>): string[] {
  const errors: string[] = []
  for (const [url, samples] of groups) {
    for (const [name, pick] of names) {
      const value = median(samples.map(pick))
      if (value < 0.95) errors.push(`${url} ${name} median ${value.toFixed(2)} is under 0.95`)
    }
  }
  return errors
}

function compare(pr: RunGroups, baseline: RunGroups): string[] {
  const errors: string[] = []
  const urls = new Set([...pr.pages.keys(), ...pr.quiz.keys()])
  for (const url of urls) {
    const prSamples = (pr.pages.get(url) ?? pr.quiz.get(url) ?? []).map((sample) => sample.performance)
    const mainSamples = (baseline.pages.get(url) ?? baseline.quiz.get(url) ?? []).map((sample) => sample.performance)
    if (prSamples.length === 0 || mainSamples.length === 0) {
      errors.push(`${url} is missing a performance median`)
      continue
    }
    console.log(`lighthouse compare ${url}: performance pr ${median(prSamples).toFixed(2)} main ${median(mainSamples).toFixed(2)}`)
    errors.push(...performanceErrors(url, prSamples, mainSamples))
  }
  const prHome = requireUrl(pr.home, '/')
  const mainHome = requireUrl(baseline.home, '/')
  const prTbt = median(prHome.map((sample) => sample.tbt))
  const mainTbt = median(mainHome.map((sample) => sample.tbt))
  const prLcp = Math.min(...prHome.map((sample) => sample.lcp))
  console.log(`lighthouse compare /: TBT pr median ${prTbt.toFixed(1)}ms main median ${mainTbt.toFixed(1)}ms, LCP best ${prLcp.toFixed(0)}ms`)
  const tbt = homeTbtError(prHome.map((sample) => sample.tbt), mainHome.map((sample) => sample.tbt))
  if (tbt) errors.push(tbt)
  const lcp = homeLcpError(prHome.map((sample) => sample.lcp))
  if (lcp) errors.push(lcp)
  errors.push(...categoryErrors(pr.pages, [
    ['accessibility', (sample) => sample.accessibility],
    ['best-practices', (sample) => sample.bestPractices],
    ['seo', (sample) => sample.seo],
  ]))
  errors.push(...categoryErrors(pr.quiz, [
    ['accessibility', (sample) => sample.accessibility],
    ['best-practices', (sample) => sample.bestPractices],
  ]))
  return errors
}

function absoluteErrors(groups: RunGroups): string[] {
  const errors: string[] = []
  for (const url of [...PAGE_URLS, ...QUIZ_URLS]) {
    const samples = (groups.pages.get(url) ?? groups.quiz.get(url) ?? []).map((sample) => sample.performance)
    if (samples.length === 0) {
      errors.push(`${url} is missing a performance median`)
      continue
    }
    console.log(`lighthouse absolute ${url}: performance median ${median(samples).toFixed(2)} from ${samples.length} runs`)
    const performance = absolutePerformanceError(url, samples)
    if (performance) errors.push(performance)
  }
  const home = groups.home.get('/')
  if (!home || home.length === 0) {
    errors.push('home TBT median missing')
    errors.push('home LCP best missing')
  } else {
    const tbtValues = home.map((sample) => sample.tbt)
    const lcpValues = home.map((sample) => sample.lcp)
    const tbt = median(tbtValues)
    const lcp = Math.min(...lcpValues)
    console.log(`lighthouse absolute /: TBT median ${tbt.toFixed(1)}ms from ${home.length} runs, LCP best ${lcp.toFixed(0)}ms`)
    const tbtError = homeTbtError(tbtValues, null)
    if (tbtError) errors.push(tbtError)
    const lcpError = homeLcpError(lcpValues)
    if (lcpError) errors.push(lcpError)
  }
  errors.push(...categoryErrors(groups.pages, [
    ['accessibility', (sample) => sample.accessibility],
    ['best-practices', (sample) => sample.bestPractices],
    ['seo', (sample) => sample.seo],
  ]))
  errors.push(...categoryErrors(groups.quiz, [
    ['accessibility', (sample) => sample.accessibility],
    ['best-practices', (sample) => sample.bestPractices],
  ]))
  return errors
}

function freshGroups(): RunGroups {
  return { pages: emptyGroups(), quiz: emptyGroups(), home: emptyGroups() }
}

function recordGateCopy(): void {
  const scriptPath = fileURLToPath(import.meta.url)
  const gateDir = process.env.LH_GATE_DIR
  writeFileSync('/tmp/lh-gate-ran', scriptPath)
  console.log(`lighthouse gate copy ran its own logic from ${scriptPath}`)
  console.log(`lighthouse gate copy: ${LIGHTHOUSE_GATE_COPY}`)
  console.log(
    `lighthouse gate rules: performance ${PERFORMANCE_MEDIAN_MIN}, TBT ${HOME_TBT_CAP_MS}ms, LCP ${HOME_LCP_CAP_MS}ms, ceiling ${HOME_TBT_HARD_CEILING_MS}ms, absolute samples ${ABSOLUTE_SAMPLES} plus ${ABSOLUTE_RETRY_SAMPLES}`,
  )
  const nodeModules = path.resolve(path.dirname(scriptPath), '../node_modules')
  const stat = lstatSync(nodeModules)
  console.log(
    stat.isSymbolicLink()
      ? `lighthouse gate node_modules: symlink -> ${readlinkSync(nodeModules)}`
      : `lighthouse gate node_modules: directory ${nodeModules}`,
  )
  const playwright = createRequire(scriptPath).resolve('@playwright/test')
  console.log(`lighthouse gate playwright: ${playwright}`)
  if (gateDir && scriptPath !== path.join(gateDir, 'scripts/check-lighthouse.ts')) {
    throw new Error(`lighthouse gate ran from ${scriptPath}, expected ${gateDir}`)
  }
}

function reportFailures(errors: string[]): number {
  for (const error of errors) {
    console.error(error)
    console.error(`::error::${error}`)
  }
  if (process.env.GITHUB_EVENT_NAME === 'schedule' && errors.length > 0) {
    console.error('::error::Nightly Lighthouse gate failed.')
  }
  return errors.length === 0 ? 0 : 1
}

async function main(): Promise<number> {
  recordGateCopy()
  process.env.CHROME_PATH = process.env.CHROME_PATH || chromium.executablePath()
  const port = Number(process.env.LHCI_PORT || 4400 + Math.floor(Math.random() * 400))
  const prPort = String(port)
  const mainPort = String(port + 1)
  const absolute = absoluteGate()
  console.log(absolute ? 'lighthouse gate: absolute (main push or nightly)' : 'lighthouse gate: pull request compared with origin/main')
  const prServer = startServer(ROOT, prPort, process.env.TURSO_DATABASE_URL || 'file:./data/ci.db')
  try {
    await waitForServer(prServer, `http://127.0.0.1:${prPort}`)
    await assertProductionRobots(`http://127.0.0.1:${prPort}`)
    await warm(`http://127.0.0.1:${prPort}`)
    if (absolute) {
      const groups = freshGroups()
      await runAbsolute(prPort, groups, ABSOLUTE_SAMPLES)
      let errors = absoluteErrors(groups)
      if (errors.length > 0) {
        const targets = absoluteRetryTargets(errors, PAGE_URLS, QUIZ_URLS)
        console.log(`lighthouse absolute: remeasuring failing URLs ${JSON.stringify(targets)}`)
        if (targets.pages.length === 0 && targets.quiz.length === 0 && !targets.home) {
          return reportFailures(errors)
        }
        await runAbsolute(prPort, groups, ABSOLUTE_RETRY_SAMPLES, targets)
        errors = absoluteErrors(groups)
      }
      return reportFailures(errors)
    }
    await prepareMain()
    const mainServer = startServer(MAIN_DIR, mainPort, 'file:./data/ci.db')
    try {
      await waitForServer(mainServer, `http://127.0.0.1:${mainPort}`)
      await warm(`http://127.0.0.1:${mainPort}`)
      const pr = freshGroups()
      const baseline = freshGroups()
      await runCompared({ pr: prPort, main: mainPort }, { pr, main: baseline })
      return reportFailures(compare(pr, baseline))
    } finally {
      stopServer(mainServer)
      await removeMain()
    }
  } finally {
    stopServer(prServer)
  }
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    if (process.env.GITHUB_EVENT_NAME === 'schedule') console.error('::error::Nightly Lighthouse gate failed.')
    process.exit(1)
  })
