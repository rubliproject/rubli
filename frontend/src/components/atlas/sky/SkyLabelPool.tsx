import { FONT_SERIF, LABEL_POOL, WRAP } from './SkyLabels'

export function SkyLabelPool({ refs }: { refs: React.MutableRefObject<(HTMLButtonElement | null)[]> }) {
  return (
    <>
      {Array.from({ length: LABEL_POOL }, (_, k) => (
        <button
          key={k}
          type="button"
          ref={(el) => { refs.current[k] = el }}
          hidden
          className="absolute left-0 top-0 sky-label"
          style={{ willChange: 'transform', maxWidth: WRAP }}
        />
      ))}
      <style>{`
        .sky-label { background: transparent; border: none; padding: 0; text-align: left; cursor: default; z-index: 1;
          /* sky-dive: a paper knockout around every glyph (the canvas-text stroke trick, in CSS) — labels sit above all marks */
          -webkit-text-stroke: 3px var(--color-background); paint-order: stroke fill;
          text-shadow: 1px 0 0 var(--color-background), -1px 0 0 var(--color-background), 0 1px 0 var(--color-background), 0 -1px 0 var(--color-background),
            1px 1px 1px var(--color-background), -1px -1px 1px var(--color-background), 1px -1px 1px var(--color-background), -1px 1px 1px var(--color-background); }
        .sky-label:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 2px; }
        .sky-label[data-kind="sector"] { font-family: var(--font-sc); font-weight: 600; font-size: 12px; letter-spacing: 0.04em; white-space: nowrap; }
        .sky-label[data-kind="star"] { font-family: ${FONT_SERIF}; font-size: 13px; line-height: 1.15; color: var(--color-text-primary); font-style: normal; }
        .sky-label[data-kind="body"] { font-family: ${FONT_SERIF}; font-size: 12px; line-height: 1.15; color: var(--color-text-secondary); font-style: normal; }
      `}</style>
    </>
  )
}
