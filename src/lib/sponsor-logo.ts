import { SPONSOR_LOGO_MAX_BYTES } from './sponsor-offerings'

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'])

/** Drop text, EXIF, and XMP. The pixels and the transparency chunk stay. */
export function stripSponsorLogoMetadata(mime: string, bytes: Buffer): Buffer | null {
  if (bytes.length < 4 || bytes.length > SPONSOR_LOGO_MAX_BYTES) return null
  if (mime === 'image/png') return stripPng(bytes)
  if (mime === 'image/jpeg') return stripJpeg(bytes)
  if (mime === 'image/webp') return stripWebp(bytes)
  return null
}

function stripPng(bytes: Buffer): Buffer | null {
  if (!bytes.subarray(0, 8).equals(PNG_SIG)) return null
  const parts: Buffer[] = [PNG_SIG]
  let offset = 8
  let sawEnd = false
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const end = offset + 12 + length
    if (!Number.isInteger(length) || end > bytes.length) return null
    if (PNG_KEEP.has(type)) parts.push(bytes.subarray(offset, end))
    offset = end
    if (type === 'IEND') {
      sawEnd = true
      break
    }
  }
  if (!sawEnd) return null
  const cleaned = Buffer.concat(parts)
  return cleaned.length <= SPONSOR_LOGO_MAX_BYTES ? cleaned : null
}

function stripJpeg(bytes: Buffer): Buffer | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null
  const parts: Buffer[] = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === undefined) return null
    if (marker === 0x00 || marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(offset, offset + 2))
      break
    }
    const standalone = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
    if (standalone) {
      parts.push(bytes.subarray(offset, offset + 2))
      offset += 2
      continue
    }
    if (offset + 4 > bytes.length) return null
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2 || offset + 2 + length > bytes.length) return null
    const drop = marker === 0xfe || (marker >= 0xe0 && marker <= 0xef)
    if (!drop) parts.push(bytes.subarray(offset, offset + 2 + length))
    offset += 2 + length
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset))
      break
    }
  }
  const cleaned = Buffer.concat(parts)
  if (cleaned.length < 4 || cleaned[0] !== 0xff || cleaned[1] !== 0xd8 || cleaned[2] !== 0xff) return null
  return cleaned.length <= SPONSOR_LOGO_MAX_BYTES ? cleaned : null
}

function stripWebp(bytes: Buffer): Buffer | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunks: Buffer[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + size
    const padded = dataEnd + (size % 2)
    if (size < 0 || padded > bytes.length) return null
    if (type !== 'EXIF' && type !== 'XMP ') {
      let data = bytes.subarray(dataStart, dataEnd)
      if (type === 'VP8X' && data.length >= 1) {
        const copy = Buffer.from(data)
        const flag = copy[0]
        if (flag === undefined) return null
        copy[0] = flag & ~0x18
        data = copy
      }
      const header = Buffer.alloc(8)
      header.write(type, 0, 4, 'ascii')
      header.writeUInt32LE(data.length, 4)
      chunks.push(header, data)
      if (data.length % 2 === 1) chunks.push(Buffer.from([0]))
    }
    offset = padded
  }
  const body = Buffer.concat(chunks)
  const fileSize = Buffer.alloc(4)
  fileSize.writeUInt32LE(4 + body.length, 0)
  const cleaned = Buffer.concat([Buffer.from('RIFF'), fileSize, Buffer.from('WEBP'), body])
  return cleaned.length <= SPONSOR_LOGO_MAX_BYTES ? cleaned : null
}
