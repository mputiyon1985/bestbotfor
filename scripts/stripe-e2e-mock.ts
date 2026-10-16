import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

export type StripeMock = {
  port: number
  close: () => Promise<void>
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function isLiveKey(value: string): boolean {
  return value.startsWith('sk_' + 'live_') || value.startsWith('rk_' + 'live_')
}

export function startStripeMock(port: number): Promise<StripeMock> {
  const sessions = new Map<string, string>()
  const requests: Array<Record<string, string>> = []

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/__requests') {
      sendJson(response, 200, requests)
      return
    }
    if (request.method === 'POST' && url.pathname === '/__reset') {
      requests.length = 0
      sendJson(response, 200, { ok: true })
      return
    }

    const authorization = request.headers.authorization ?? ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
    if (!token || isLiveKey(token) || !token.startsWith('sk_' + 'test_')) {
      sendJson(response, 401, { error: { message: 'test mode required' } })
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      const body = await readBody(request)
      const params = Object.fromEntries(new URLSearchParams(body))
      requests.push(params)
      const idempotency = request.headers['idempotency-key']
      const key = typeof idempotency === 'string' ? idempotency : ''
      const cached = key ? sessions.get(key) : undefined
      if (cached) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(cached)
        return
      }
      const id = `cs_test_mock_${requests.length}`
      const payload = JSON.stringify({
        id,
        object: 'checkout.session',
        url: `https://checkout.stripe.com/c/pay/${id}`,
        livemode: false,
        mode: 'payment',
        status: 'open',
      })
      if (key) sessions.set(key, payload)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(payload)
      return
    }

    sendJson(response, 404, { error: { message: 'not found' } })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()))
          }),
      })
    })
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

if (process.argv[1]?.endsWith('stripe-e2e-mock.ts')) {
  const port = Number(process.env.STRIPE_API_PORT ?? '12111')
  startStripeMock(port)
    .then(() => {
      console.log(`stripe mock listening on 127.0.0.1:${port}`)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : 'stripe mock failed')
      process.exit(1)
    })
}
