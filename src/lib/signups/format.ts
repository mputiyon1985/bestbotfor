export function toIso(value: unknown): string | null {
  if (typeof value === 'bigint') return toIso(Number(value))
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.abs(value) < 1e12 ? value * 1000 : value
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+$/.test(trimmed)) return toIso(Number(trimmed))
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed) ? `${trimmed.replace(' ', 'T').replace(/Z$/i, '')}Z` : trimmed
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

export function formatUtc(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim()
  if (!email || email.length > 320) return null
  if (/[\r\n\0]/.test(email)) return null
  if (!email.includes('@')) return null
  return email
}
