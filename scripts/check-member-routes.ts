import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const failures: string[] = []

function fail(message: string): void {
  failures.push(message)
}

async function read(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), relative), 'utf8')
}

async function walk(directory: string): Promise<string[]> {
  const found: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await walk(full)))
    else found.push(full)
  }
  return found
}

async function main(): Promise<void> {
  const proxy = await read('src/proxy.ts')
  if (!proxy.includes('auth.protect()')) fail('src/proxy.ts must call auth.protect()')
  if (!proxy.includes('/members')) fail('src/proxy.ts must match the /members routes')

  const layout = await read('src/app/members/layout.tsx')
  if (!layout.includes('auth.protect()')) fail('src/app/members/layout.tsx must call auth.protect()')

  const membersDir = path.join(process.cwd(), 'src/app/members')
  for (const full of await walk(membersDir)) {
    const relative = path.relative(process.cwd(), full)
    if (!relative.endsWith('route.ts')) continue
    const text = await readFile(full, 'utf8')
    if (!text.includes('auth.protect()') && !text.includes('memberAccess(')) {
      fail(`${relative} is a route handler and is not covered by the members layout. Call auth.protect().`)
    }
  }

  const actions = ['src/app/members/actions.ts', 'src/app/pricing/actions.ts', 'src/app/result/actions.ts']
  for (const relative of actions) {
    const text = await read(relative)
    if (!text.includes("'use server'") && !text.includes('"use server"')) {
      fail(`${relative} must be a server action`)
    }
    if (!text.includes('auth.protect()') && !text.includes('memberAccess(')) {
      fail(`${relative} must call auth.protect() or memberAccess()`)
    }
  }

  if (failures.length > 0) {
    console.error('Member routes are not protected:')
    for (const failure of failures) console.error(failure)
    process.exit(1)
  }
  console.log('Member routes call auth.protect() or memberAccess().')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Member route check failed')
  process.exit(1)
})
