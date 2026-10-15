/** Safe to import from proxy. Does not touch Clerk at runtime. */
export function isClerkConfigured(): boolean {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? ''
  return publishable.startsWith('pk_') && secret.startsWith('sk_')
}
