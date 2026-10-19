/** BestBotFor's own social profiles, linked from the site footer with rel="me". */
export const SOCIAL_LINKS = [
  { name: 'Facebook', label: 'BestBotFor on Facebook', href: 'https://www.facebook.com/profile.php?id=61595073856208' },
  { name: 'X', label: 'BestBotFor on X', href: 'https://x.com/bestbotfor' },
  { name: 'LinkedIn', label: 'BestBotFor on LinkedIn', href: 'https://www.linkedin.com/company/bestbotfor' },
] as const

/** Same-tab like every other link on the site; rel="me" claims the profiles as ours. */
export const SOCIAL_LINK_REL = 'noopener me'
