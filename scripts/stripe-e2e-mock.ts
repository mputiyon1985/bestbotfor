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
  const sessions = new Map<string, { body: string; payload: string }>()
  const requests: Array<Record<string, string>> = []
  // Checkout creates for an email armed with POST /__lose_response: Stripe makes
  // and stores the session, but the response is lost (a 500 the client must not
  // retry on its own). A retry with the same key and body gets the stored session.
  const loseResponse = new Map<string, number>()
  // Every create for an armed email, with its idempotency key and session id.
  // /__reset does not clear this, so a parallel spec's reset cannot drop it.
  const history: Array<Record<string, string>> = []

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/__requests') {
      sendJson(response, 200, requests)
      return
    }
    if (request.method === 'POST' && url.pathname === '/__lose_response') {
      const email = url.searchParams.get('email') ?? ''
      loseResponse.set(email, Number(url.searchParams.get('times') ?? '1'))
      sendJson(response, 200, { ok: true })
      return
    }
    if (request.method === 'GET' && url.pathname === '/__history') {
      const email = url.searchParams.get('email') ?? ''
      sendJson(response, 200, history.filter((item) => item['metadata[email]'] === email))
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
      const email = params['metadata[email]'] ?? ''
      const armed = loseResponse.has(email)
      const cached = key ? sessions.get(key) : undefined
      const record = (outcome: string, sessionId: string) => {
        if (armed) history.push({ ...params, __idempotency_key: key, __outcome: outcome, __session_id: sessionId })
      }
      if (cached) {
        if (cached.body !== body) {
          record('idempotency_error', '')
          sendJson(response, 400, {
            error: {
              type: 'idempotency_error',
              message: 'Keys for idempotent requests can only be used with the same parameters they were first used with.',
            },
          })
          return
        }
        record('replayed', String((JSON.parse(cached.payload) as { id: string }).id))
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(cached.payload)
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
      if (key) sessions.set(key, { body, payload })
      const lose = loseResponse.get(email) ?? 0
      if (lose > 0) {
        loseResponse.set(email, lose - 1)
        record('created_response_lost', id)
        response.writeHead(500, { 'content-type': 'application/json', 'stripe-should-retry': 'false' })
        response.end(JSON.stringify({ error: { type: 'api_error', message: 'mock: session created, response lost' } }))
        return
      }
      record('created', id)
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
