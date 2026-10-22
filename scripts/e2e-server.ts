import { spawn } from 'node:child_process'
import { startStripeMock } from './stripe-e2e-mock'

const port = Number(process.env.STRIPE_API_PORT ?? '12111')

async function main(): Promise<void> {
  const mock = await startStripeMock(port)
  const prep = spawn('tsx', ['scripts/prepare-db.ts'], { stdio: 'inherit', env: process.env })
  const prepCode = await new Promise<number>((resolve) => {
    prep.on('exit', (code) => resolve(code ?? 1))
  })
  if (prepCode !== 0) {
    await mock.close()
    process.exit(prepCode)
  }

  const app = spawn('npm', ['run', 'start'], { stdio: 'inherit', env: process.env })
  const stop = () => {
    app.kill('SIGTERM')
    void mock.close()
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  app.on('exit', (code) => {
    void mock.close().finally(() => process.exit(code ?? 0))
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'e2e server failed')
  process.exit(1)
})
