// Remotion CLI config (npx remotion studio|render src/remotion/index.ts).
// The light-leak overlays use WebGL2 (@remotion/effects) — effects.md / light-leaks.md.
import { Config } from '@remotion/cli/config'

Config.setChromiumOpenGlRenderer('angle')
