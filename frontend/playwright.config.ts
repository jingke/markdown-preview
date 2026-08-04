import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const __dirname: string = path.dirname(fileURLToPath(import.meta.url))
const repoRoot: string = path.resolve(__dirname, '..')
const e2eVitePort: string = process.env.E2E_VITE_PORT ?? '5174'
const e2eBackendPort: string = process.env.E2E_BACKEND_PORT ?? '8001'
const e2eOrigin: string = `http://127.0.0.1:${e2eVitePort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: e2eOrigin,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bash ./scripts/playwright-e2e-serve.sh',
    cwd: repoRoot,
    url: e2eOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      E2E_VITE_PORT: e2eVitePort,
      E2E_BACKEND_PORT: e2eBackendPort,
    },
  },
})
