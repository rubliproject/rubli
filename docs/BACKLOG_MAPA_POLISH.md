# Backlog: El Mapa polish with Fable (owner, 2026-10-29). For LATER, not now.

The owner loves the concept: «we were able to do everything as we wish». What needs work:
1. **Too much slicing.** Clicking a vendor (the provider at each corner) breaks it down by administration and then by every contract in that administration: the data is cut into too many pieces. Refine how the drill shows this: fewer, deeper layers, one clear story per click.
2. **Clean up the indicators.** Too many indicators and panels are shown. Where are the other sectors of government? Make the sector context legible and remove the clutter.
3. **More animation and volume.** It should feel like it has volume on screen: depth, motion, camera, particles. Use the 10-29 research and the new `rubli-motion-viz` skill and kit (ParticleFlow, TimeTerrain, Constellation, Unfold); references in `_explore/viz_references_2026-10-29/REFERENCES.md` (cosmos.gl for the network, flowmap-style flows).

Process when capacity frees: a Fable concept round (rubli-ui, then rubli-motion-viz) → independent review → owner pick → build. The template freeze applies (shell, nav, type, tokens); the visuals are open.

## Owner, 2026-11-04 (after seeing it): the «Riesgo» transition is «good… we just have to work on it». Built on `ui/mapa-riesgo-view` 6cc0c945. Still to do:
- a phone version (390 shows the sector list, not the sky);
- Salud red vs risk red;
- the outliers cluster top-right because the overall share is 62 %, so consider ranking by risky pesos;
- tie it to the explainroo-style narration over this same chart.

## Owner, 2026-11-04: NEXT (queued, not later)
«the pre-built visualizations in El Mapa never showed anything… reuse one but actually make it work.» These are the «Acomodo» arrangements (Monto · Riesgo · Tiempo · Captura · Señales · ComprasMX · Calificación) and the «Capa» layers. Rebuild ONE so it truly shows a pattern: «Riesgo» (share of risky spending against spending, the walkthrough's best candidate). Use clear axes, a one-line reading sentence, a visible change from the default arrangement, and the reader can find the outliers in 5 s. Cut the rest to «más» or drop them. Base it on `ui/mapa-clarity`.

## Owner, 2026-11-03: remake El Mapa's graphics (LATER, Fable stage)
"Remake the graphics of mapas with Rubli UI skills and Fable, later stage. Analyze it as a user and enhance as a designer."
- Step 1: a user walkthrough. Audit every view (Cifras, Vínculos, the drills, the year bar, the «Acomodo» panel) through the five reader questions and record where a reader gets lost.
- Step 2: a Fable design round on El Mapa's own system, enhanced in place, because this is a loved and gold page. The owner sees screenshots and video before anything is built.
- Fold in the queued items: the year bar (start at 2002, a plain one-line purpose, drop the technical note) and the «Acomodo» panel (3 modes, one sentence each).
