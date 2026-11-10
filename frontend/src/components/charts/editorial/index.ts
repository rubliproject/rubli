/**
 * Editorial chart primitives — bible-locked, token-enforced.
 * Every page should import from here. No inline Recharts in pages.
 */

import { lazyChart } from './lazyChart'
import { CHART_TOKENS } from './tokens'

export { CHART_TOKENS, tokenColor, formatValue, annotationStroke } from './tokens'
export type { ColorToken, ChartAnnotation } from './tokens'

export { DotStrip } from './DotStrip'
export type { DotStripProps, DotStripRow } from './DotStrip'

export const EditorialLineChart = lazyChart(() => import('./EditorialLineChart').then((m) => m.EditorialLineChart), CHART_TOKENS.dims.default)
export type { EditorialLineChartProps, LineSeries } from './EditorialLineChart'

export const EditorialAreaChart = lazyChart(() => import('./EditorialAreaChart').then((m) => m.EditorialAreaChart), CHART_TOKENS.dims.default)
export type { EditorialAreaChartProps } from './EditorialAreaChart'

export const EditorialScatterChart = lazyChart(() => import('./EditorialScatterChart').then((m) => m.EditorialScatterChart), CHART_TOKENS.dims.default)
export type { EditorialScatterChartProps } from './EditorialScatterChart'

export const EditorialComposedChart = lazyChart(() => import('./EditorialComposedChart').then((m) => m.EditorialComposedChart), CHART_TOKENS.dims.default)
export type {
  EditorialComposedChartProps,
  ComposedLayer,
} from './EditorialComposedChart'

export const EditorialSparkline = lazyChart(() => import('./EditorialSparkline').then((m) => m.EditorialSparkline), 40)
export type { EditorialSparklineProps } from './EditorialSparkline'

export const EditorialRadarChart = lazyChart(() => import('./EditorialRadarChart').then((m) => m.EditorialRadarChart), CHART_TOKENS.dims.default)
export type { EditorialRadarChartProps, RadarSeries } from './EditorialRadarChart'

export { scaleToColor } from './colorScales'
export type { HeatmapScale } from './colorScales'

export { EditorialDistribution } from './EditorialDistribution'
export type { EditorialDistributionProps, DistributionThreshold } from './EditorialDistribution'

export { EditorialTimeline } from './EditorialTimeline'
export type { EditorialTimelineProps, EditorialTimelineEvent } from './EditorialTimeline'

export { DABullet } from './DABullet'
