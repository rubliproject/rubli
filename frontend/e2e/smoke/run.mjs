// `npm run e2e:smoke -- --base=https://rubli.xyz [playwright args…]`
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
const baseArg = args.find((a) => a.startsWith('--base='))
const rest = args.filter((a) => a !== baseArg)
const env = { ...process.env, SMOKE_BASE: baseArg ? baseArg.slice(7).replace(/\/+$/, '') : process.env.SMOKE_BASE || 'http://localhost:3009' }
// C: is full on the owner's machine — browsers live on D: (`npx playwright install --only-shell chromium` with this set)
if (!env.PLAYWRIGHT_BROWSERS_PATH && existsSync('D:/Python/_pw')) env.PLAYWRIGHT_BROWSERS_PATH = 'D:\\Python\\_pw'

const config = fileURLToPath(new URL('./playwright.config.ts', import.meta.url))
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const r = spawnSync(process.execPath, [cli, 'test', '--config', config, ...rest], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
