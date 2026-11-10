/**
 * Motion kit — bold, animated, 2.5D/3D primitives for RUBLI's data shapes (skill: rubli-motion-viz).
 * Every GPU component is lazy: three.js lives in its own chunk and never weighs on first paint.
 * Mount them inside <Suspense> (or <Defer>), feed them with the mappers in ./data.
 */
import { lazy } from 'react'

export const ParticleFlow = lazy(() => import('./ParticleFlow'))
export const TimeTerrain = lazy(() => import('./TimeTerrain'))
export const Constellation = lazy(() => import('./Constellation'))
export const Unfold = lazy(() => import('./Unfold'))

export type { ParticleFlowProps } from './ParticleFlow'
export type { TimeTerrainProps } from './TimeTerrain'
export type { ConstellationProps } from './Constellation'
export * from './data'
export const Sculpture = lazy(() => import('./Sculpture'))
export type { SculptureProps } from './Sculpture'
