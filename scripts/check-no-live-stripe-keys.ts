import { findLiveStripeKeys } from '../src/lib/live-keys'

async function main(): Promise<void> {
  const hits = await findLiveStripeKeys(process.cwd())
  if (hits.length > 0) {
    console.error('Refusing to continue. A live-mode Stripe key prefix was found in:')
    for (const hit of hits) console.error(hit)
    process.exit(1)
  }
  console.log('No live-mode Stripe key prefixes found.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Key check failed')
  process.exit(1)
})
