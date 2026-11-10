// Stills of the Remotion «El Relevo» at given frames, one bundle for all of them.
//   node scripts/relevo_stills.mjs <RelevoEN|RelevoES|Peak|…> <outDir> <frame,frame,...> [scale] [en|es]
// Posters: the Peak beat alone (no captions), e.g. `Peak public/gallery-posters 335 0.6667 en`.
// (`remotion render --frames=a,b,c` trips its inline audio mixer on Windows; renderStill does not.)
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'
import path from 'node:path'

const [id, outDir, list, scale = '1', lang] = process.argv.slice(2)
const inputProps = lang ? { lang } : {}
const serveUrl = await bundle({ entryPoint: path.resolve('src/remotion/index.ts') })
const composition = await selectComposition({ serveUrl, id, inputProps })
for (const frame of list.split(',').map(Number)) {
  const output = path.join(outDir, `${id}-${String(frame).padStart(4, '0')}.jpeg`)
  await renderStill({ serveUrl, composition, frame, output, inputProps, imageFormat: 'jpeg', jpegQuality: 88, scale: Number(scale) })
  console.log(output)
}
