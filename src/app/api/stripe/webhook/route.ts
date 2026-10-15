import { NextResponse } from 'next/server'
import { handleStripeWebhook } from '@/lib/stripe-webhook'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const rawBody = await request.text()
  const result = await handleStripeWebhook({ rawBody, signature })
  return NextResponse.json(result.body, { status: result.status })
}
