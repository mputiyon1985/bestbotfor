import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const VERSION = '8.30.1'

const CHECKSUMS: Record<string, string> = {
  x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  arm64: 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
}

async function main(): Promise<void> {
  if (process.platform !== 'linux') {
    console.error(`gitleaks check supports linux, got ${process.platform}`)
    process.exit(1)
  }
  const arch = process.arch === 'arm64' || process.arch === 'x64' ? process.arch : null
  if (!arch) {
    console.error(`gitleaks check supports x64 and arm64, got ${process.arch}`)
    process.exit(1)
  }
  const checksum = CHECKSUMS[arch]
  if (!checksum) {
    console.error(`No gitleaks checksum for ${arch}`)
    process.exit(1)
  }

  const directory = path.join(process.cwd(), 'node_modules', '.cache', 'gitleaks', VERSION)
  const binary = path.join(directory, 'gitleaks')
  const archiveName = `gitleaks_${VERSION}_linux_${arch}.tar.gz`
  if (!existsSync(binary)) {
    await mkdir(directory, { recursive: true })
    const archive = path.join(directory, archiveName)
    const response = await fetch(
      `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${archiveName}`,
    )
    if (!response.ok || !response.body) {
      console.error(`Could not download gitleaks ${VERSION}`)
      process.exit(1)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== checksum) {
      console.error('gitleaks checksum did not match the published release')
      process.exit(1)
    }
    await writeFile(archive, bytes)
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', directory, 'gitleaks'], { encoding: 'utf8' })
    if (extracted.status !== 0) {
      console.error(extracted.stderr || 'Could not extract gitleaks')
      process.exit(1)
    }
    await chmod(binary, 0o755)
  }

  const result = spawnSync(
    binary,
    ['detect', '--source', process.cwd(), '--redact', '--no-banner', '--exit-code', '1'],
    { encoding: 'utf8' },
  )
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`gitleaks ${VERSION} found no secrets.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'gitleaks failed')
  process.exit(1)
})
