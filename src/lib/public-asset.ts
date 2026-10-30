import { readdirSync } from 'node:fs'
import path from 'node:path'

const STATIC_EXTENSION = /\.(?:svg|png|jpe?g|gif|webp|ico)$/i

/** Image and icon URLs. These used to skip the proxy and fall through to the app layout. */
export function isStaticAssetPath(pathname: string): boolean {
  return STATIC_EXTENSION.test(pathname)
}

/** Decode one layer so `%40` matches a file named with `@`. A bad escape stays as written. */
export function decodePublicPath(pathname: string): string | null {
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) return null
  if (!pathname.includes('%')) return pathname
  try {
    const decoded = decodeURIComponent(pathname)
    if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return null
    return decoded
  } catch {
    return null
  }
}

let manifest: Set<string> | undefined

/** Relative public paths, including a leading slash. Built once per process. */
export function publicAssetManifest(): Set<string> {
  if (manifest) return manifest
  const root = path.resolve(process.cwd(), 'public')
  const files = new Set<string>()
  const walk = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(path.join(directory, entry.name), rel)
      else if (entry.isFile()) files.add(rel)
    }
  }
  walk(root, '')
  manifest = files
  return files
}

/**
 * A real file under public/, or null. `..` and other escapes stay null so the
 * proxy can 404 them instead of rendering the site header.
 */
export function publicAssetFile(pathname: string): string | null {
  const decoded = decodePublicPath(pathname)
  if (!decoded) return null
  const root = path.resolve(process.cwd(), 'public')
  const target = path.resolve(root, `.${decoded}`)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null
  const relative = target.slice(root.length).split(path.sep).join('/')
  if (!publicAssetManifest().has(relative)) return null
  return target
}
