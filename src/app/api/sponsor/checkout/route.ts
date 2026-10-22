import { NextResponse } from 'next/server'
import { SPONSOR_OPENING_SOON, sponsorCheckoutClosed } from '@/lib/sponsor-checkout-gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

/**
 * Production checkout is refused until live billing is on. This route does not
 * create a Stripe session. The sponsor form's server action is the checkout,
 * and it uses the same gate.
 */
export function POST() {
  if (sponsorCheckoutClosed()) {
    return NextResponse.json({ error: SPONSOR_OPENING_SOON }, { status: 503, headers: NO_STORE })
  }
  return NextResponse.json({ error: 'Checkout is not available on this endpoint.' }, { status: 404, headers: NO_STORE })
}
