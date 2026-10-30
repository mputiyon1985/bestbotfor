export function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  const length = Math.max(left.length, right.length)
  let diff = left.length === right.length ? 0 : 1
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}
