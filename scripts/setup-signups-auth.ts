import { randomBytes } from 'node:crypto'
import { chmodSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import QRCode from 'qrcode'
import { hashPassword } from '../src/lib/signups/auth/password'
import { base32Encode } from '../src/lib/signups/auth/totp'

const OUTPUT_NAME = '.auth-setup.local'

function writePrivate(path: string, data: string | Buffer): void {
  try {
    if (lstatSync(path).isSymbolicLink()) unlinkSync(path)
  } catch {
    // The file is not there yet.
  }
  writeFileSync(path, data, { mode: 0o600 })
  chmodSync(path, 0o600)
}

export async function runSetup(outPath: string): Promise<void> {
  if (basename(outPath) !== OUTPUT_NAME) throw new Error('invalid output name')
  const sessionSecret = randomBytes(32).toString('base64url')
  const password = randomBytes(18).toString('base64url')
  const passwordHash = hashPassword(password)
  const totpSecret = base32Encode(randomBytes(20))
  const uri = `otpauth://totp/Signups:mark?secret=${totpSecret}&issuer=Signups&algorithm=SHA1&digits=6&period=30`
  const pngPath = `${outPath}.png`

  let png: Buffer
  try {
    png = await QRCode.toBuffer(uri, { type: 'png', width: 280, margin: 1, errorCorrectionLevel: 'M' })
  } catch {
    throw new Error('qr failed')
  }

  const contents = [
    '# Local only. Do not commit, log, or paste this file.',
    '# Copy SIGNUPS_SESSION_SECRET, SIGNUPS_ADMIN_PASSWORD_HASH, and SIGNUPS_TOTP_SECRET into the host environment.',
    '# Use PASSWORD to sign in. Scan the QR PNG with an authenticator app.',
    `SIGNUPS_SESSION_SECRET=${sessionSecret}`,
    `SIGNUPS_ADMIN_PASSWORD_HASH=${passwordHash}`,
    `SIGNUPS_TOTP_SECRET=${totpSecret}`,
    `PASSWORD=${password}`,
    `OTPAUTH_URI=${uri}`,
    `QR_PNG=${pngPath}`,
    '',
  ].join('\n')

  writePrivate(outPath, contents)
  writePrivate(pngPath, png)
}

async function main(): Promise<void> {
  const outPath = process.env.AUTH_SETUP_FILE ? resolve(process.env.AUTH_SETUP_FILE) : resolve(process.cwd(), OUTPUT_NAME)
  await runSetup(outPath)
  process.stdout.write(`${outPath}\n`)
}

const invokedDirectly = process.argv.some((arg) => arg.replace(/\\/g, '/').endsWith('scripts/setup-signups-auth.ts'))

if (invokedDirectly) {
  main().catch(() => {
    process.stderr.write('setup-signups-auth failed\n')
    process.exitCode = 1
  })
}
