/**
 * LabTrendChart — compact sparkline card for a single lab trend.
 *
 * Practitioner "3-second scan":
 * - Clear IN RANGE (green) or OUT OF RANGE (red) badge
 * - Color-coded direction arrow: red if worsening out-of-range, green if recovering
 * - Inline sparkline (~28px) for trajectory at a glance
 */

import type { LabTrend } from '../../services/ai/clinicalAnalysis'

// ---------------------------------------------------------------------------
// Sparkline dimensions
// ---------------------------------------------------------------------------

const SW = 80
const SH = 28
const SPAD = 3

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LabTrendChart({ trend }: { trend: LabTrend }) {
  const { dataPoints, referenceRange, labName, unit, outOfRange, direction, daysToThreshold, currentValue } = trend
  if (dataPoints.length < 2) return null

  // Arrow direction
  const dirArrow = direction === 'rising' ? '↑' : direction === 'falling' ? '↓' : '→'

  // Determine if the trend is worsening:
  // - out of range AND moving further away = red
  // - out of range AND moving back toward range = amber (recovering)
  // - in range but moving toward boundary = amber
  // - in range and stable = green
  const refLow = referenceRange.low
  const refHigh = referenceRange.high
  let trendSeverity: 'danger' | 'caution' | 'ok' = 'ok'
  if (outOfRange) {
    // Check if worsening: high and rising, or low and falling
    const isWorsening =
      (refHigh != null && currentValue > refHigh && direction === 'rising') ||
      (refLow != null && currentValue < refLow && direction === 'falling')
    trendSeverity = isWorsening ? 'danger' : 'caution'
  } else if (direction !== 'stable' && daysToThreshold != null && daysToThreshold < 30) {
    trendSeverity = 'caution'
  }

  // Colors based on severity
  const lineColor = trendSeverity === 'danger' ? '#ef4444' : trendSeverity === 'caution' ? '#f59e0b' : '#3b82f6'
  const bgClass = trendSeverity === 'danger' ? 'bg-red-50 border-red-300'
    : trendSeverity === 'caution' ? 'bg-amber-50 border-amber-200'
    : 'bg-white border-card-border'
  const valueClass = trendSeverity === 'danger' ? 'text-red-700 font-black'
    : trendSeverity === 'caution' ? 'text-amber-700 font-bold'
    : 'text-slate-900 font-bold'
  const arrowClass = trendSeverity === 'danger' ? 'text-red-600 font-black'
    : trendSeverity === 'caution' ? 'text-amber-600 font-bold'
    : 'text-green-600 font-bold'

  // Compute Y bounds for sparkline
  const values = dataPoints.map(d => d.value)
  const allValues = [...values, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])]
  let yMin = Math.min(...allValues)
  let yMax = Math.max(...allValues)
  const yPad = (yMax - yMin) * 0.15 || 1
  yMin -= yPad
  yMax += yPad

  const chartW = SW - SPAD * 2
  const chartH = SH - SPAD * 2
  const points = dataPoints.map((dp, i) => ({
    x: SPAD + (i / (dataPoints.length - 1)) * chartW,
    y: SPAD + chartH - ((dp.value - yMin) / (yMax - yMin)) * chartH,
  }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  // Reference range band
  const refY1 = refHigh != null ? SPAD + chartH - ((refHigh - yMin) / (yMax - yMin)) * chartH : SPAD
  const refY2 = refLow != null ? SPAD + chartH - ((refLow - yMin) / (yMax - yMin)) * chartH : SPAD + chartH

  return (
    <div className={`flex items-center gap-2.5 px-2.5 py-2 border rounded-lg ${bgClass}`}>
      {/* Lab info */}
      <div className="flex flex-col min-w-0 shrink-0 gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-slate-800 truncate leading-tight">{labName}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-[15px] leading-tight ${valueClass}`}>{currentValue}</span>
          <span className="text-[10px] text-slate-500 font-medium">{unit}</span>
          <span className={`text-sm ${arrowClass}`}>{dirArrow}</span>
        </div>
        {daysToThreshold != null && daysToThreshold > 0 && (
          <span className="text-[9px] text-amber-700 font-medium leading-tight">~{daysToThreshold}d to threshold</span>
        )}
      </div>

      {/* Sparkline */}
      <svg viewBox={`0 0 ${SW} ${SH}`} className="w-[80px] h-[28px] shrink-0 ml-auto" aria-label={`${labName} trend`}>
        {(refLow != null || refHigh != null) && (
          <rect x={SPAD} y={refY1} width={chartW} height={Math.max(0, refY2 - refY1)} fill="rgba(34,197,94,0.12)" />
        )}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={lineColor} />
      </svg>
    </div>
  )
}
