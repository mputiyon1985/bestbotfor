import http from 'node:http'
import https from 'node:https'
import net, { isIP } from 'node:net'
import tls from 'node:tls'

const realFetch = globalThis.fetch.bind(globalThis)

/** The one escape for a test that must download a local tool. Ordinary tests stay blocked. */
export function unsafeRealFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return realFetch(input, init)
}

function hostnameOf(input: string | URL): string | null {
  try {
    return new URL(input).hostname
  } catch {
    return null
  }
}

/**
 * Loopback is `localhost`, `127.0.0.0/8`, and `::1` (including `[::1]`).
 * `net.isIP` rejects names that only look like those addresses.
 */
function isLoopbackHost(hostname: string): boolean {
  let host = hostname.trim().toLowerCase()
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host === 'localhost') return true
  const family = isIP(host)
  if (family === 4) return Number(host.split('.')[0]) === 127
  if (family === 6) {
    try {
      const normalized = new URL(`http://[${host}]`).hostname
      const bare = normalized.startsWith('[') && normalized.endsWith(']') ? normalized.slice(1, -1) : normalized
      return bare === '::1'
    } catch {
      return false
    }
  }
  return false
}

function blocked(kind: 'fetch' | 'connection', hostname: string): Error {
  const label = kind === 'fetch' ? 'fetch' : 'connection'
  return new Error(`Blocked outbound test ${label} to ${hostname}. Pass a mock fetch instead.`)
}

function isPlainOptions(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !(value instanceof URL)
}

function hostWithoutPort(host: string): string {
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    return end === -1 ? host : host.slice(1, end)
  }
  const colon = host.lastIndexOf(':')
  if (colon > -1 && host.indexOf(':') === colon) return host.slice(0, colon)
  return host
}

function hostFromOptions(options: Record<string, unknown>): string | null {
  if (typeof options.hostname === 'string' && options.hostname.length > 0) return options.hostname
  if (typeof options.host === 'string' && options.host.length > 0) return hostWithoutPort(options.host)
  return null
}

function effectiveHttpHost(first: unknown, second: unknown): string | null {
  if (typeof first === 'string' || first instanceof URL) {
    const fromUrl = hostnameOf(first)
    if (isPlainOptions(second)) {
      const override = hostFromOptions(second)
      if (override) return override
    }
    return fromUrl
  }
  if (isPlainOptions(first)) return hostFromOptions(first)
  return null
}

function effectiveNetHost(args: readonly unknown[]): string | null {
  const first = args[0]
  if (typeof first === 'number') return typeof args[1] === 'string' ? args[1] : null
  if (typeof first === 'string') {
    if (first.includes('/') || !/^\d+$/.test(first)) return null
    return typeof args[1] === 'string' ? args[1] : null
  }
  if (!isPlainOptions(first)) return null
  return hostFromOptions(first)
}

function effectiveTlsHost(args: readonly unknown[]): string | null {
  const first = args[0]
  if (typeof first === 'number') {
    if (typeof args[1] === 'string') return args[1]
    if (isPlainOptions(args[1])) return hostFromOptions(args[1])
    return null
  }
  if (isPlainOptions(first)) return hostFromOptions(first)
  return null
}

function refuseUnlessLoopback(kind: 'fetch' | 'connection', hostname: string | null): void {
  if (hostname !== null && !isLoopbackHost(hostname)) throw blocked(kind, hostname)
}

function guardRequest<T extends (...args: never[]) => unknown>(original: T): T {
  return function request(this: unknown, ...args: never[]): ReturnType<T> {
    refuseUnlessLoopback('connection', effectiveHttpHost(args[0], args[1]))
    return Reflect.apply(original, this, args) as ReturnType<T>
  } as T
}

function guardConnect<T extends (...args: never[]) => unknown>(original: T, hostOf: (args: readonly unknown[]) => string | null): T {
  return function connect(this: unknown, ...args: never[]): ReturnType<T> {
    refuseUnlessLoopback('connection', hostOf(args))
    return Reflect.apply(original, this, args) as ReturnType<T>
  } as T
}

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const hostname = hostnameOf(raw)
  if (hostname && isLoopbackHost(hostname)) return realFetch(input, init)
  throw blocked('fetch', hostname || 'unparsed')
}) as typeof fetch

// `http.get` calls the module-local `request`, so replacing the export does not cover it.
http.request = guardRequest(http.request)
http.get = guardRequest(http.get)
https.request = guardRequest(https.request)
https.get = guardRequest(https.get)

const guardedNetConnect = guardConnect(net.connect, effectiveNetHost)
net.connect = guardedNetConnect
net.createConnection = guardedNetConnect
tls.connect = guardConnect(tls.connect, effectiveTlsHost)
