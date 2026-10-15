import { NextResponse } from 'next/server'
import { handleStripeWebhook } from '@/lib/stripe-webhook'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const rawBody = await request.text()
  try {
    const result = await handleStripeWebhook({ rawBody, signature })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('stripe webhook failed', error instanceof Error ? error.name : 'error')
    return NextResponse.json({ error: 'webhook-failed' }, { status: 500 })
  }
}
