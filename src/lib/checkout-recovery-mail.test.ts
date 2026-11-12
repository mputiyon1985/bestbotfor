import { describe, expect, it, vi } from 'vitest'
import {
  checkoutRecoveryHref,
  checkoutRecoveryMessage,
  postRecoveryEmail,
  recoveryMailConfig,
} from './checkout-recovery-mail'
import { EMAIL_SIGNATURE_TEXT } from './email-signature'

const config = { apiKey: 're_test_key_123', from: 'BestBotFor <mark@bestbotfor.com>' }

describe('checkout recovery email', () => {
  it('sends a scarce offer back to /sponsor and never includes a recovery URL', () => {
    const link = checkoutRecoveryHref({
      offering: 'founding_sponsor',
      recoveryUrl: 'https://buy.stripe.com/r/test_secret',
      siteUrl: 'https://bestbotfor.com',
    })
    expect(link).toEqual({ href: 'https://bestbotfor.com/sponsor', reopensCheckout: false })
    const message = checkoutRecoveryMessage({
      sessionId: 'cs_test_founding',
      email: 'buyer@example.com',
      offerLabel: 'Founding sponsor',
      offering: 'founding_sponsor',
      recoveryUrl: 'https://buy.stripe.com/r/test_secret',
      siteUrl: 'https://bestbotfor.com',
    })
    expect(message?.text).toContain('https://bestbotfor.com/sponsor')
    expect(message?.text).not.toContain('buy.stripe.com/r/')
    expect(message?.text).toContain('unsubscribe')
    expect(message?.text).toContain(EMAIL_SIGNATURE_TEXT)
    expect(message?.html).toContain('privacy@bestbotfor.com')
    expect(message?.html).not.toMatch(/<script/i)
    expect(message?.listUnsubscribe).toBe('<mailto:privacy@bestbotfor.com?subject=Unsubscribe>')
  })

  it('uses the Stripe recovery URL for the newsletter and the public Payment Link otherwise', () => {
    expect(
      checkoutRecoveryHref({
        offering: 'newsletter_slot',
        recoveryUrl: 'https://buy.stripe.com/r/test_news',
        siteUrl: 'https://bestbotfor.com',
      }),
    ).toEqual({ href: 'https://buy.stripe.com/r/test_news', reopensCheckout: true })
    expect(
      checkoutRecoveryHref({
        offering: 'sponsor_monthly',
        recoveryUrl: null,
        siteUrl: 'https://bestbotfor.com',
      }).href,
    ).toBe('https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02')
    expect(
      checkoutRecoveryHref({
        offering: 'membership_monthly',
        recoveryUrl: null,
        siteUrl: 'https://bestbotfor.com',
      }),
    ).toEqual({ href: 'https://bestbotfor.com/pricing', reopensCheckout: false })
    expect(
      checkoutRecoveryHref({
        offering: 'placement_subscription',
        recoveryUrl: 'https://buy.stripe.com/r/test_slot',
        siteUrl: 'https://bestbotfor.com',
      }).reopensCheckout,
    ).toBe(false)
  })

  it('refuses a bad address or session id', () => {
    expect(
      checkoutRecoveryMessage({
        sessionId: 'cs_test_ok',
        email: 'not an email',
        offerLabel: 'Founding sponsor',
        offering: 'founding_sponsor',
        recoveryUrl: null,
      }),
    ).toBeNull()
    expect(
      checkoutRecoveryMessage({
        sessionId: 'pi_test',
        email: 'buyer@example.com',
        offerLabel: 'Founding sponsor',
        offering: 'founding_sponsor',
        recoveryUrl: null,
      }),
    ).toBeNull()
  })

  it('stays off for live events unless the live flag is exactly true, and requires a Resend key', () => {
    const env = {
      CHECKOUT_RECOVERY_RESEND_API_KEY: 're_test_key_123',
      CHECKOUT_RECOVERY_FROM: 'BestBotFor <mark@bestbotfor.com>',
    }
    expect(recoveryMailConfig(env, false)).toEqual({ ok: true, config })
    expect(recoveryMailConfig(env, true)).toEqual({ ok: false, reason: 'live-email-off' })
    expect(recoveryMailConfig({ ...env, CHECKOUT_RECOVERY_EMAIL_LIVE: 'true' }, true)).toEqual({ ok: true, config })
    expect(recoveryMailConfig({ ...env, CHECKOUT_RECOVERY_EMAIL_LIVE: ' true' }, true).ok).toBe(false)
    expect(recoveryMailConfig({ ...env, CHECKOUT_RECOVERY_RESEND_API_KEY: 'sk_test_no' }, false)).toEqual({
      ok: false,
      reason: 'mail-not-configured',
    })
    expect(recoveryMailConfig({ ...env, CHECKOUT_RECOVERY_FROM: 'bad\nfrom@example.com' }, false).ok).toBe(false)
  })

  it('posts one idempotent message and classifies Resend status codes', async () => {
    const message = checkoutRecoveryMessage({
      sessionId: 'cs_test_send',
      email: 'buyer@example.com',
      offerLabel: 'Newsletter sponsor slot',
      offering: 'newsletter_slot',
      recoveryUrl: 'https://buy.stripe.com/r/test_send',
      siteUrl: 'https://bestbotfor.com',
    })
    if (!message) throw new Error('message')
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { to: string[]; headers: { 'List-Unsubscribe': string } }
      expect(body.to).toEqual(['buyer@example.com'])
      expect(body.headers['List-Unsubscribe']).toContain('mailto:privacy@bestbotfor.com')
      const headers = new Headers(init?.headers)
      expect(headers.get('Idempotency-Key')).toBe('checkout-recovery-cs_test_send')
      expect(headers.get('Authorization')).toBe('Bearer re_test_key_123')
      return new Response('{}', { status: 200 })
    })
    expect(await postRecoveryEmail(message, config, fetchImpl as unknown as typeof fetch)).toBe('sent')
    fetchImpl.mockResolvedValueOnce(new Response('no', { status: 500 }))
    expect(await postRecoveryEmail(message, config, fetchImpl as unknown as typeof fetch)).toBe('retry')
    fetchImpl.mockResolvedValueOnce(new Response('no', { status: 422 }))
    expect(await postRecoveryEmail(message, config, fetchImpl as unknown as typeof fetch)).toBe('rejected')
    fetchImpl.mockRejectedValueOnce(new Error('network'))
    expect(await postRecoveryEmail(message, config, fetchImpl as unknown as typeof fetch)).toBe('retry')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })
})
