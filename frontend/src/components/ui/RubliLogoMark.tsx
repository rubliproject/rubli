/**
 * RUBLI brand mark — «El Expediente Abierto» (2026-10-07).
 *
 * 🔒 LOCKED BY THE OWNER (2026-10-07: "i love it. lock it down"). Do not
 * redesign, recolour, retime or replace this mark, the favicon, or the app
 * icon without the owner's explicit request. Every surface that shows the
 * logo imports this component — never inline a new SVG mark.
 *
 * Three ledger records stacked into a file; the middle one is pulled out
 * of line in risk red, leaving its slot empty. Out of 3.1M rows, the one
 * that does not sit flush. Ink follows `currentColor`; the pulled record
 * uses --color-risk-critical.
 *
 * Motion (~2.5s on mount): rows are entered like ledger lines, a scan line
 * reads down the file, the middle record flags red and is pulled out (a
 * dashed ghost marks the vacated slot). Idle: every 8s the scan re-reads
 * and the record nudges. Hovering the mark or its link re-pulls.
 * prefers-reduced-motion renders the final state.
 */

interface RubliLogoMarkProps {
  size?: number
  className?: string
}

const MARK_CSS = `
.rb-file .b{fill:currentColor;transform-box:fill-box;transform-origin:0 50%;animation:rbf-draw .55s cubic-bezier(.2,.7,.2,1) both}
.rb-file .b3{animation-delay:.24s}
.rb-file .pull{fill:var(--color-risk-critical,#ef4444);transform-box:fill-box;transform-origin:0 50%;
  animation:rbf-pull 2.4s cubic-bezier(.3,.7,.2,1) both,rbf-nudge 8s ease-in-out 3.6s infinite}
.rb-file:hover .pull,a:hover .rb-file .pull{
  animation:rbf-pull 2.4s cubic-bezier(.3,.7,.2,1) both,rbf-nudge 8s ease-in-out 3.6s infinite,rbf-pull-h .9s cubic-bezier(.3,.7,.2,1)}
.rb-file .scan{fill:var(--color-risk-critical,#ef4444);opacity:0;
  animation:rbf-scan .6s cubic-bezier(.45,0,.55,1) .85s both,rbf-scan-idle 8s cubic-bezier(.45,0,.55,1) 3.6s infinite}
.rb-file .ghost{fill:none;stroke:currentColor;stroke-width:.7;stroke-dasharray:1.6 1.4;opacity:0;animation:rbf-ghost 3.4s ease both}
@keyframes rbf-draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes rbf-pull{
  0%,5%{transform:translateX(-6px) scaleX(0);fill:currentColor}
  28%{transform:translateX(-6px) scaleX(1);fill:currentColor}
  49%{transform:translateX(-6px);fill:currentColor}
  53%{transform:translateX(-6px) scaleY(1.18)}
  60%{transform:translateX(-6px) scaleY(1)}
  84%{transform:translateX(1px)}
  100%{transform:translateX(0)}}
@keyframes rbf-nudge{0%,8%,100%{transform:translateX(0)}4%{transform:translateX(1.4px)}}
@keyframes rbf-pull-h{0%{transform:translateX(0)}35%{transform:translateX(-6px)}75%{transform:translateX(1px)}100%{transform:translateX(0)}}
@keyframes rbf-scan{0%{opacity:0;transform:translateY(0)}15%{opacity:.85}85%{opacity:.85}100%{opacity:0;transform:translateY(33px)}}
@keyframes rbf-scan-idle{0%{opacity:0;transform:translateY(0)}1%{opacity:.5}7%{opacity:.5}8%,100%{opacity:0;transform:translateY(33px)}}
@keyframes rbf-ghost{0%,62%{opacity:0}72%{opacity:.55}88%{opacity:.55}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.rb-file *{animation:none!important}}
`

export function RubliLogoMark({ size = 20, className }: RubliLogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `rb-file ${className}` : 'rb-file'}
      aria-hidden="true"
    >
      <style>{MARK_CSS}</style>
      <rect className="ghost" x="5.35" y="16.85" width="23.3" height="6.3" />
      <rect className="b" x="5" y="6" width="24" height="7" />
      <rect className="pull" x="11" y="16.5" width="24" height="7" />
      <rect className="b b3" x="5" y="27" width="24" height="7" />
      <rect className="scan" x="2" y="3" width="36" height="1" />
    </svg>
  )
}
