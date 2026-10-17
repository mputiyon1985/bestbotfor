export const REASON_CODES = [
  'confidential_info',
  'abusive_content',
  'others_personal_info',
  'discriminatory',
  'clearly_false',
  'suspected_fake',
  'unrelated',
  'vendor_or_insider_undisclosed',
  'spam_or_promotional',
  'duplicate',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

const LABELS: Record<ReasonCode, string> = {
  confidential_info: 'Contained trade secrets or confidential business information',
  abusive_content: 'Defamatory, harassing, abusive, obscene, vulgar or sexually explicit',
  others_personal_info: "Contained someone else's personal information or likeness",
  discriminatory: 'Discriminatory about race, gender, sexuality, ethnicity or another intrinsic characteristic',
  clearly_false: 'Clearly false or misleading (for example, about the wrong product)',
  suspected_fake: 'We reasonably believe it is fake (with evidence noted)',
  unrelated: 'Not about this tool',
  vendor_or_insider_undisclosed: 'Written by the vendor or an undisclosed insider',
  spam_or_promotional: 'Ads, links or promotion',
  duplicate: 'Duplicate of another review',
}

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value)
}

export function reasonLabel(code: ReasonCode): string {
  return LABELS[code]
}
