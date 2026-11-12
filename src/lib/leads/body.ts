/** Read at most maxBytes from the body. Content-Length is not trusted. */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false }> {
  const stream = request.body
  if (!stream) return { ok: false }
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false }
      }
      chunks.push(Buffer.from(value))
    }
  } catch {
    return { ok: false }
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') }
}
