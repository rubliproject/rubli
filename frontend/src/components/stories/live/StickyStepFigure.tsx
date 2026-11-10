/**
 * StickyStepFigure — the stepped-figure scrolly, shared by the story variants.
 *
 * SD-01 built this inside `HeroChapter` for the `el-vacio` blackout diagram and
 * left a note: "if a second story needs the same mechanic it earns its own
 * file; one caller does not." SD-02's 36-month line is the second caller, and
 * it lives in a `standard` chapter rather than the hero, so the mechanic moved
 * here unchanged.
 *
 * What is shared is the beat and the frame, not the prose. Each variant renders
 * its own paragraphs — the hero with a drop cap and a pull-quote, `standard`
 * with source superscripts — and only registers them with the hook. Pulling the
 * paragraphs in here too would mean passing both variants' layouts back out
 * again, which is more code than it saves.
 */
import type { ReactNode } from 'react'

/**
 * The sticky frame the stepped figure sits in — the 760 figure column, pinned
 * below the site header at `lg` and in normal flow below it.
 */
export function StickyStepFrame({ stage, children }: { stage: number; children: ReactNode }) {
  return (
    <div
      data-stage={stage}
      // `py-2` is load-bearing, not spacing: without padding the figure's own
      // vertical margin collapses through this div, so the margin band sits
      // OUTSIDE the background box and the prose scrolls visibly through it
      // while the figure is stuck.
      className="max-w-[760px] mx-auto px-4 sm:px-0 py-2 bg-background lg:sticky lg:top-24 lg:z-10"
    >
      {children}
    </div>
  )
}
