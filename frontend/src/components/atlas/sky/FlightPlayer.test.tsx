/**
 * Render-count guard — spec .claude/designs/atlas-2026-10-02-spec.md §3.11.5.
 * All 17 waypoints of the 3 narratives, fake timers, a mock engine: each waypoint
 * renders the player fewer than 4 times, the camera flies exactly once per
 * waypoint, and nothing logs "Maximum update depth".
 */
import { Profiler, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATLAS_STORIES, type Story } from '@/lib/atlas-stories'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { FlightPlayer } from './FlightPlayer'
import { compileWaypoint } from './compileWaypoint'

vi.mock('@/lib/atlas/flight-stats', () => ({
  useFlightStat: (ref: unknown) => (ref ? { state: 'ok', value: '1', vars: {}, source: '/mock' } : null),
}))

const starIds = [...new Set(ATLAS_STORIES.flatMap((s) => s.chapters.map((c) => c.at.star).filter((x): x is number => x != null)))]
const manifest = {
  stars: { id: starIds, name: starIds.map((i) => `INS ${i}`) },
  inst_map: { raw: [], canon: [] },
} as unknown as SkyManifest

describe('FlightPlayer render-count guard', () => {
  let errors: string[] = []
  beforeEach(() => {
    vi.useFakeTimers()
    errors = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('17 waypoints · < 4 renders each · one camera move each · 0 "Maximum update depth"', () => {
    const fly = vi.fn()
    const apiRef = { current: { fly } }
    const renders = new Map<string, number>()
    let total = 0

    function Harness({ flight }: { flight: Story }) {
      const [n, setN] = useState(0)
      const ch = flight.chapters[n]
      const compiled = ch ? compileWaypoint(ch, manifest, null, null) : null
      return (
        <Profiler id="flight" onRender={() => { const k = `${flight.id}:${n}`; renders.set(k, (renders.get(k) ?? 0) + 1) }}>
          <FlightPlayer
            flight={flight} n={n} compiled={compiled} lang="es" lv="20261002T000000Z" cut="28·sep·2025"
            apiRef={apiRef} autoplay taken={false}
            onGo={setN} onTake={() => {}} onResume={() => {}} onClose={() => {}} onNextFlight={() => {}} nextFlight={null}
          />
        </Profiler>
      )
    }

    for (const flight of ATLAS_STORIES) {
      const flyBefore = fly.mock.calls.length
      const view = render(<MemoryRouter><Harness flight={flight} /></MemoryRouter>)
      for (const ch of flight.chapters) {
        total++
        act(() => { vi.advanceTimersByTime(ch.dwellMs) })
      }
      expect(fly.mock.calls.length - flyBefore).toBe(flight.chapters.length)
      view.unmount()
    }

    expect(total).toBe(17)
    for (const [k, c] of renders) expect(c, k).toBeLessThan(4)
    expect(errors.filter((e) => e.includes('Maximum update depth'))).toEqual([])
  })

  it('a withheld planet is never a focal target or a name', () => {
    const ch = ATLAS_STORIES[0].chapters[1] // IMSS · Grupo Fármacos Especializados + 3
    const system = {
      star: { id: ch.at.star },
      ranked: [2873, 4335, 13885], // 29277 withheld
      bodies: [29277, 2873, 4335, 13885].map((v) => ({ vendor_id: v, name: `V${v}` })),
    } as never
    const c = compileWaypoint(ch, manifest, null, system)
    expect(c.target.kind).toBe('star')
    expect(c.focus.map((f) => f.vendor_id)).toEqual([2873, 4335, 13885])
  })
})
