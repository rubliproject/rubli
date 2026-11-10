/**
 * registry-bridge.mjs — load the app's TypeScript registries from a node script.
 *
 * toc.ts, story-content.ts and constants.ts use the `@/` alias and import the
 * API client, so plain `node --experimental-strip-types` cannot load them.
 * Vite's SSR loader resolves the alias and transpiles on the fly; no plugins,
 * no config file, nothing written to disk. Used by gen-sitemap.mjs and
 * gen-head-shells.mjs so neither keeps a hand-copied route list or constant.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `await loadModules(['/src/lib/nav/toc.ts', …])` → the modules, in order. */
export async function loadModules(ids) {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    resolve: { alias: { '@': path.join(root, 'src') } },
    // toc.ts imports the API client only for a queryFn; the client drags in
    // i18n, which touches `document`. The registries never call it — stub it.
    plugins: [{
      name: 'stub-api-client',
      enforce: 'pre',
      load: (id) => (/[\\/]src[\\/]api[\\/]client\.ts$/.test(id) ? 'export const analysisApi = {}' : null),
    }],
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const out = []
    for (const id of ids) out.push(await server.ssrLoadModule(id))
    return out
  } finally {
    await server.close()
  }
}

