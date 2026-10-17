/** True for /admin and everything under it. Safe for the proxy and client code. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}
