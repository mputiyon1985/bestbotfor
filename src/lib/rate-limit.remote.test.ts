import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { configureFileDatabase, createLibsqlClient } from './db/client'

const SQLD_VERSION = 'libsql-server-v0.24.32'

function sqldTriple(): string | undefined {
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : ''
  if (process.platform !== 'linux' || !arch) return undefined
  return `libsql-server-${arch}-unknown-linux-gnu`
}

// Tests never download sqld: the outbound network guard blocks it. Set SQLD_BINARY
// or extract the release into the cache path below to run this test.
function cachedSqldBinary(): string | undefined {
  const fromEnv = process.env.SQLD_BINARY
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const triple = sqldTriple()
  if (!triple) return undefined
  const binary = path.join(tmpdir(), 'bestbotfor-sqld', SQLD_VERSION, triple, 'sqld')
  return existsSync(binary) ? binary : undefined
}

const SQLD = cachedSqldBinary()
const SKIP_REASON = `sqld ${SQLD_VERSION} is not cached locally (set SQLD_BINARY or place it under ${path.join(tmpdir(), 'bestbotfor-sqld', SQLD_VERSION)}); tests do not download it`

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('no port'))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

async function startSqld(binary: string, dbPath: string, port: number): Promise<{ child: ChildProcess; output: () => string }> {
  const child = spawn(binary, ['--db-path', dbPath, '--http-listen-addr', `127.0.0.1:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const chunks: Buffer[] = []
  const keep = (chunk: Buffer) => {
    chunks.push(chunk)
    if (chunks.length > 40) chunks.shift()
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  const output = () => Buffer.concat(chunks).toString('utf8')
  const deadline = Date.now() + 15_000
  let lastError = 'not started'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`sqld exited ${child.exitCode}: ${output()}`)
    const client = createClient({ url: `http://127.0.0.1:${port}` })
    try {
      await client.execute('SELECT 1')
      return { child, output }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'sqld not ready'
    } finally {
      client.close()
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  child.kill('SIGTERM')
  throw new Error(`sqld did not answer (${lastError}): ${output()}`)
}

function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 2_000)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

function runWorker(args: string[]): Promise<{ allowed: number; denied: number }> {
  const worker = path.join(process.cwd(), 'src/lib/result-window-remote.worker.ts')
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.cwd(), 'node_modules/.bin/tsx'), [worker, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk))
    child.once('error', reject)
    child.once('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8').trim()
      const stderr = Buffer.concat(err).toString('utf8').trim()
      if (code !== 0) {
        reject(new Error(`worker exited ${code}: ${stderr || stdout}`))
        return
      }
      const line = stdout.split('\n').findLast((entry) => entry.startsWith('{')) ?? ''
      try {
        resolve(JSON.parse(line) as { allowed: number; denied: number })
      } catch {
        reject(new Error(`worker output was not json: ${stdout}\n${stderr}`))
      }
    })
  })
}

describe('remote result rate window', () => {
  if (!SQLD) console.warn(`Skipping remote result rate window: ${SKIP_REASON}`)
  it.skipIf(!SQLD)('skips file pragmas on sqld and two processes produce denials', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-sqld-db-'))
    const dbPath = path.join(root, 'remote.db')
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    const sqld = await startSqld(SQLD as string, dbPath, port)
    const pageDirectory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-page-'))
    const page = createLibsqlClient(`file:${path.join(pageDirectory, 'page.db')}`)
    const remote = createClient({ url })
    try {
      const sql = await readFile(path.join(process.cwd(), 'drizzle/0012_result_rate_windows.sql'), 'utf8')
      await remote.executeMultiple(sql)
      // The page client is created first and records a file URL. The remote
      // client is not in that map. sqld rejects PRAGMA, so this must not throw.
      await configureFileDatabase(remote)
      await remote.execute('SELECT 1')

      const limit = 30
      const perProcess = 20
      const now = Date.now()
      const key = `remote-${now}`
      const results = await Promise.all(
        [0, 1].map(() => runWorker([url, key, String(perProcess), String(limit), String(now)])),
      )
      const allowed = results.reduce((sum, result) => sum + result.allowed, 0)
      const denied = results.reduce((sum, result) => sum + result.denied, 0)
      expect(allowed + denied).toBe(perProcess * 2)
      expect(denied).toBeGreaterThanOrEqual(8)
      expect(allowed).toBeLessThanOrEqual(limit + 2)
    } finally {
      remote.close()
      page.close()
      await stopProcess(sqld.child)
      await rm(pageDirectory, { recursive: true, force: true })
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
