/**
 * Standard BestBotFor email signature/footer for all outbound mail
 * (sponsor outreach, affiliate and deal asks, campaigns, future transactional mail).
 * The repo has no mail transport yet; any template that adds one should append
 * EMAIL_SIGNATURE_HTML / EMAIL_SIGNATURE_TEXT. Copies for Gmail live outside the repo.
 *
 * Email-safe: tables, inline styles only, explicit image size, alt text.
 * The logo is served from /public/email, so it resolves only once deployed.
 */
export const EMAIL_LOGO_URL = 'https://bestbotfor.com/email/bestbotfor-logo.png'
export const EMAIL_LOGO_WIDTH = 180
export const EMAIL_LOGO_HEIGHT = 42

export const EMAIL_SIGNATURE_NAME = 'Mark Putiyon'
export const EMAIL_SIGNATURE_TITLE = 'Owner & Editor-in-Chief, BestBotFor'
export const EMAIL_SIGNATURE_PHONE = '(571) 279-8182'
export const EMAIL_SIGNATURE_PHONE_TEL = '+15712798182'
export const EMAIL_SIGNATURE_SITE = 'https://bestbotfor.com'

export const EMAIL_SIGNATURE_TEXT = [
  '--',
  EMAIL_SIGNATURE_NAME,
  EMAIL_SIGNATURE_TITLE,
  EMAIL_SIGNATURE_PHONE,
  EMAIL_SIGNATURE_SITE,
].join('\n')

const font = "font-family:Arial,Helvetica,sans-serif;"

export const EMAIL_SIGNATURE_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${font}color:#1f2937;">
  <tr>
    <td style="padding:0 0 10px 0;">
      <a href="${EMAIL_SIGNATURE_SITE}" style="text-decoration:none;"><img src="${EMAIL_LOGO_URL}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}" alt="BestBotFor" style="display:block;border:0;outline:none;width:${EMAIL_LOGO_WIDTH}px;height:${EMAIL_LOGO_HEIGHT}px;"></a>
    </td>
  </tr>
  <tr>
    <td style="${font}font-size:14px;line-height:20px;color:#111827;font-weight:bold;">${EMAIL_SIGNATURE_NAME}</td>
  </tr>
  <tr>
    <td style="${font}font-size:13px;line-height:19px;color:#4b5563;">Owner &amp; Editor-in-Chief, BestBotFor</td>
  </tr>
  <tr>
    <td style="${font}font-size:13px;line-height:19px;color:#4b5563;padding-top:4px;"><a href="tel:${EMAIL_SIGNATURE_PHONE_TEL}" style="color:#4b5563;text-decoration:none;">${EMAIL_SIGNATURE_PHONE}</a> &nbsp;|&nbsp; <a href="${EMAIL_SIGNATURE_SITE}" style="color:#5b4bdb;text-decoration:none;">bestbotfor.com</a></td>
  </tr>
</table>`
