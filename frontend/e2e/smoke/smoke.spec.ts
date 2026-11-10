/**
 * Pre-deploy smoke suite (e2e/README.md). Read-only: never submits a form.
 * Every test runs under `guard`: no console errors, no page errors, no response ≥400
 * (except the one 404 a test declares), and at 390 px no horizontal scroll on any visited page.
 */
import { test as base, expect, type Page, type Response } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3009'
const IS_PROD = !/localhost|127\.0\.0\.1/.test(BASE)

// The nav registry is the source of truth: read hrefs out of toc.ts (skipping flag-gated rows,
// which are off) instead of importing it — it pulls in the API client.
const tocSrc = readFileSync(fileURLToPath(new URL('../../src/lib/nav/toc.ts', import.meta.url)), 'utf8')
const TOC_ROUTES = [...new Set(tocSrc.split('\n')
  .filter((l) => !l.includes('_LIVE ?'))
  .flatMap((l) => [...l.matchAll(/\{\s*href:\s*'([^']+)'/g)].map((m) => m[1])))]

const ERROR_TEXT = /Algo salió mal|Something went wrong/
const NOT_FOUND_TEXT = /Este registro fue archivado|This record has been archived/
const COMPANY_RFC = 'GFE061004F65' // GRUPO FARMACOS ESPECIALIZADOS (vendor 29277), a company RFC — public by policy

type Guard = { allow404: (urlPart: string) => void; visit: (path: string) => Promise<Response | null> }

let lastNav = 0
const test = base.extend<{ guard: Guard }>({
  guard: [async ({ page }, use, info) => {
    const lang = info.project.metadata.lang as string
    await page.addInitScript((l) => { try { localStorage.setItem('i18nextLng', l) } catch { /* private mode */ } }, lang)
    const problems: string[] = []
    const allowed: string[] = []
    page.on('console', (m) => {
      // the declared 404 also logs «Failed to load resource … 404» (no URL in the text); the response check still guards the rest
      if (m.type() === 'error' && !(allowed.length && /status of 404/.test(m.text()))) problems.push(`console: ${m.text().slice(0, 300)}`)
    })
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`))
    page.on('response', (r) => {
      if (r.status() >= 400 && !(r.status() === 404 && allowed.some((a) => r.url().includes(a)))) problems.push(`HTTP ${r.status()} ${r.url()}`)
    })
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText ?? ''
      if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(err)) problems.push(`failed: ${err} ${r.url()}`)
    })
    const phone = (page.viewportSize()?.width ?? 1440) <= 400
    await use({
      allow404: (u) => { allowed.push(u) },
      visit: async (path) => {
        if (IS_PROD) { const wait = 500 - (Date.now() - lastNav); if (wait > 0) await page.waitForTimeout(wait) }
        lastNav = Date.now()
        const resp = await page.goto(path, { waitUntil: 'domcontentloaded' })
        await expect.poll(async () => (await mainText(page)).length, { message: `${path} renders content`, timeout: IS_PROD ? 40_000 : 20_000 }).toBeGreaterThan(80)
        await expect(page.getByText(ERROR_TEXT)).toHaveCount(0)
        if (phone) {
          const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
          expect(sw, `${path}: horizontal scroll at 390`).toBeLessThanOrEqual(cw + 1)
        }
        return resp
      },
    })
    await page.waitForTimeout(300) // let late requests/console land inside the test
    expect(problems, 'console errors / failed requests').toEqual([])
  }, { auto: true }],
})

const mainText = (page: Page) => page.locator('#main-content, main').first().innerText().catch(() => '')
const proj = () => test.info().project.name
const desktopEsOnly = () => test.skip(proj() !== 'es-1440', 'flow runs once, at es-1440')
const esOnly = () => test.skip(proj().startsWith('en'), 'flow runs in ES')

test.describe('pages', () => {
  test('home / Portada renders', async ({ guard }) => { await guard.visit('/') })
  test('/mapa Cifras renders', async ({ guard }) => { await guard.visit('/mapa') })
  test('/mapa Vínculos renders', async ({ page, guard }) => {
    await guard.visit('/mapa?vista=vinculos')
    await expect(page.locator('canvas').first()).toBeVisible()
  })
  for (const route of TOC_ROUTES.filter((r) => r !== '/' && r !== '/mapa')) { // those two have their own tests above
    test(`TOC ${route}`, async ({ page, guard }) => {
      await guard.visit(route)
      await expect(page.getByText(NOT_FOUND_TEXT)).toHaveCount(0)
    })
  }
})

test.describe('flows', () => {
  test('/aria: cards load, sort in URL, card opens and Back closes it', async ({ page, guard }) => {
    esOnly()
    await guard.visit('/aria')
    const cards = page.locator('button.fw-card[data-vid]')
    await expect(cards.first()).toBeVisible()
    await page.getByRole('group', { name: 'Orden' }).getByRole('button', { name: 'Monto' }).click()
    await expect(page).toHaveURL(/orden=value/)
    await cards.first().click()
    await expect(page).toHaveURL(/foco=\d+/)
    await page.goBack()
    await expect(page).not.toHaveURL(/foco=/)
    await expect(page).toHaveURL(/orden=value/)
  })

  test('/vendors/29277 dossier loads', async ({ page, guard }) => {
    esOnly()
    await guard.visit('/vendors/29277')
    await expect(page.getByText(/Grupo Farmacos Especializados/i).first()).toBeVisible()
  })

  test('/aria/caso/105407 shows the persona física note', async ({ page, guard }) => {
    esOnly()
    await guard.visit('/aria/caso/105407')
    await expect(page.getByText('Persona física.', { exact: true }).first()).toBeVisible()
    await expect(page).toHaveURL(/\/aria\/caso\/105407/) // AriaCase bounces to /vendors/:id when the ARIA call fails
  })

  test('/contracts?is_single_bid=true shows the tag', async ({ page, guard }) => {
    esOnly()
    await guard.visit('/contracts?is_single_bid=true')
    await expect(page.getByText('Un solo postor').first()).toBeVisible()
  })

  test('contract CSV export downloads a non-empty file', async ({ page, guard }) => {
    desktopEsOnly()
    await guard.visit('/contracts?is_single_bid=true&vendor_id=29277') // small slice: a light export
    const btn = page.getByRole('button', { name: 'Exportar a CSV' })
    await expect(btn).toBeEnabled()
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 45_000 }), btn.click()])
    const body = readFileSync((await dl.path())!, 'utf8')
    expect(body.split('\n').filter(Boolean).length, 'header + ≥1 row').toBeGreaterThan(1)
  })

  test('command palette: company RFC → vendor page', async ({ page, guard }) => {
    desktopEsOnly()
    await guard.visit('/aria')
    await page.locator('button.ct-search').click()
    const input = page.getByPlaceholder(/Buscar proveedores, RFC/)
    await input.fill(COMPANY_RFC)
    await page.getByRole('option').filter({ hasText: COMPANY_RFC }).first().click()
    await expect(page).toHaveURL(/\/vendors\/29277/)
  })

  test('/mapa salud → IMSS → vendor drill lists only IMSS contracts', async ({ page, guard }) => {
    desktopEsOnly()
    const contracts = page.waitForResponse((r) => /\/vendors\/29277\/contracts\?.*institution_id=251/.test(r.url()), { timeout: 45_000 })
    await guard.visit('/mapa?s=salud&i=251&v=29277')
    const json = await (await contracts).json() as { data: { institution_id: number }[] }
    expect(json.data.length).toBeGreaterThan(0)
    expect(new Set(json.data.map((c) => c.institution_id))).toEqual(new Set([251]))
    await expect(page.getByText('IMSS').first()).toBeVisible()
  })

  test('/privacy has § 7', async ({ page, guard }) => {
    esOnly()
    await guard.visit('/privacy')
    await expect(page.locator('#oposicion')).toContainText('7. Política de oposición')
  })

  test('unknown URL shows NotFound (HTTP 404 on prod)', async ({ page, guard }) => {
    esOnly()
    guard.allow404('/nope')
    const resp = await guard.visit('/nope')
    await expect(page.getByText(NOT_FOUND_TEXT).first()).toBeVisible()
    if (IS_PROD) expect(resp?.status()).toBe(404)
  })

  test('theme switch Noche keeps the route', async ({ page, guard }) => {
    esOnly()
    await guard.visit('/contracts')
    const url = page.url()
    await page.locator('button.ct-edition').first().click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
    expect(page.url()).toBe(url)
    await expect.poll(async () => (await mainText(page)).length).toBeGreaterThan(80)
  })
})
