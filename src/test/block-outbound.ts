const realFetch = globalThis.fetch.bind(globalThis)

/** The one escape for a test that must download a local tool. Ordinary tests stay blocked. */
export function unsafeRealFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  return realFetch(input, init)
}

function hostnameOf(input: Parameters<typeof fetch>[0]): string | null {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host === '::1') return true
  return host.startsWith('127.')
}

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const hostname = hostnameOf(input)
  if (hostname && isLocalHost(hostname)) return realFetch(input, init)
  throw new Error(`Blocked outbound test fetch to ${hostname || 'unparsed'}. Pass a mock fetch instead.`)
}) as typeof fetch
