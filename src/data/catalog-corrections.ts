/**
 * Catalog facts checked Oct 17, 2026.
 * The price label for n8n cannot be stored as a USD `priceFromUsd` (cloud plans are in euros).
 * Deepgram's stale pro is replaced in the editorial CSVs. Production rows are not written
 * from this module. `scripts/a2-catalog-corrections.ts` is the reviewed production update.
 */

/** Shown everywhere `priceLabel` runs. Self-hosted Community Edition is free. Cloud is not. */
export const N8N_PRICE_LABEL = 'Free (self-hosted); cloud from €20/mo'

/** Replaces "Pay as you go from about $0.006 a minute" on the Deepgram pro. */
export const DEEPGRAM_PRICE_PRO = 'Nova-3 is $0.0043/min pre-recorded and $0.0048/min streaming (promo)'

export const DEEPGRAM_PRICE_PRO_STALE = 'Pay as you go from about $0.006 a minute'
