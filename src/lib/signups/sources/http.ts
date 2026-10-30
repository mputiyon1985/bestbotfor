/** GET only. Redirects are errors so a secret is not forwarded. */
export async function getJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error('http_error')
  return response.json() as Promise<unknown>
}
