/** /categories ?vista= views. «Hallazgos» became «Tendencias» (owner, 2026-10-29); the old value still opens it. */
export const VIEWS = ['bodega', 'anaquel', 'hoja', 'tendencias'] as const
export type View = (typeof VIEWS)[number]
const ALIASES: Record<string, View> = { hallazgos: 'tendencias' }

export function parseView(raw: string | null): View {
  if (raw && (VIEWS as readonly string[]).includes(raw)) return raw as View
  return (raw && ALIASES[raw]) || 'bodega'
}
