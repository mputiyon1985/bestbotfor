import { statSync } from 'node:fs'
import path from 'node:path'

const STATIC_EXTENSION = /\.(?:svg|png|jpe?g|gif|webp|ico)$/i

/** Image and icon URLs. These used to skip the proxy and fall through to the app layout. */
export function isStaticAssetPath(pathname: string): boolean {
  return STATIC_EXTENSION.test(pathname)
}

/**
 * A real file under public/, or null. `..` and other escapes stay null so the
 * proxy can 404 them instead of rendering the site header.
 */
export function publicAssetFile(pathname: string): string | null {
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) return null
  const root = path.resolve(process.cwd(), 'public')
  const target = path.resolve(root, `.${pathname}`)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null
  try {
    if (!statSync(target).isFile()) return null
  } catch {
    return null
  }
  return target
}
