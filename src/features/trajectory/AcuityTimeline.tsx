/**
 * AcuityTimeline — SVG line chart showing 48h history + 12h prediction cone.
 *
 * Design:
 * - Dense, minimal, clinical — no gridlines except Y-axis severity bands
 * - Severity bands: green (0–20), yellow (20–45), amber (45–70), red (70–100)
 * - Prediction zone = hatched/shaded area widening into the future
 * - Event markers as small diamonds on the timeline
 * - Current time = vertical dashed line
 * - Responsive width, fixed height
 */

import { useMemo } from 'react'
import type { TimelinePoint, PredictionPoint } from '../../services/trajectory/trajectoryEngine'

interface AcuityTimelineProps {
  history: TimelinePoint[]
  prediction: PredictionPoint[]
  currentAcuity: number
}

// Chart dimensions
const W = 680
const H = 200
const PAD = { top: 16, right: 20, bottom: 28, left: 40 }
const CW = W - PAD.left - PAD.right
const CH = H - PAD.top - PAD.bottom

// Severity bands (y-axis zones)
const BANDS = [
  { from: 0,  to: 20, color: '#dcfce7', label: 'Stable' },      // green-100
  { from: 20, to: 45, color: '#fef9c3', label: 'Low-Mod' },      // yellow-100
  { from: 45, to: 70, color: '#ffedd5', label: 'Moderate' },      // orange-100
  { from: 70, to: 100, color: '#fee2e2', label: 'High' },         // red-100
]

export function AcuityTimeline({ history, prediction, currentAcuity }: AcuityTimelineProps) {
  const { historyPath, predictionPath, confPath, nowX, eventMarkers, yLabels, timeLabels } = useMemo(() => {
    if (history.length === 0) return { historyPath: '', predictionPath: '', confPath: '', nowX: 0, eventMarkers: [], yLabels: [], timeLabels: [] }

    const allTimes = [...history, ...prediction].map(p => new Date(p.time).getTime())
    const minT = Math.min(...allTimes)
    const maxT = Math.max(...allTimes)
    const rangeT = maxT - minT || 1

    const tx = (t: string) => PAD.left + ((new Date(t).getTime() - minT) / rangeT) * CW
    const ty = (a: number) => PAD.top + CH - (a / 100) * CH

    // History line
    const hPts = history.map(p => `${tx(p.time).toFixed(1)},${ty(p.acuity).toFixed(1)}`)
    const historyPathStr = 'M' + hPts.join(' L')

    // Prediction line
    const lastHistory = history[history.length - 1]
    const pPts = [
      `${tx(lastHistory.time).toFixed(1)},${ty(lastHistory.acuity).toFixed(1)}`,
      ...prediction.map(p => `${tx(p.time).toFixed(1)},${ty(p.acuity).toFixed(1)}`)
    ]
    const predPathStr = 'M' + pPts.join(' L')

    // Confidence polygon
    const confUpper = [
      { time: lastHistory.time, val: lastHistory.acuity },
      ...prediction.map(p => ({ time: p.time, val: p.high }))
    ]
    const confLower = [
      ...prediction.map(p => ({ time: p.time, val: p.low })).reverse(),
      { time: lastHistory.time, val: lastHistory.acuity }
    ]
    const confPoints = [...confUpper, ...confLower]
    const confPathStr = 'M' + confPoints.map(p => `${tx(p.time).toFixed(1)},${ty(p.val).toFixed(1)}`).join(' L') + ' Z'

    // Now line
    const nowXPos = tx(lastHistory.time)

    // Events
    const markers = history
      .filter(p => p.event)
      .map(p => ({ x: tx(p.time), y: ty(p.acuity), label: p.event! }))

    // Y-axis labels
    const yLabs = [0, 25, 50, 75, 100].map(v => ({ y: ty(v), label: String(v) }))

    // Time labels (every 12h)
    const timeLabs: Array<{ x: number; label: string }> = []
    const step = 12 * 60 * 60 * 1000
    const startT = Math.ceil(minT / step) * step
    for (let t = startT; t <= maxT; t += step) {
      const d = new Date(t)
      const hr = d.getHours()
      const label = hr === 0 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `${hr.toString().padStart(2, '0')}:00`
      timeLabs.push({ x: PAD.left + ((t - minT) / rangeT) * CW, label })
    }

    return {
      historyPath: historyPathStr,
      predictionPath: predPathStr,
      confPath: confPathStr,
      nowX: nowXPos,
      eventMarkers: markers,
      yLabels: yLabs,
      timeLabels: timeLabs,
    }
  }, [history, prediction])

  if (history.length === 0) {
    return <div className="text-[11px] text-slate-400 italic py-4 text-center">Insufficient data for timeline</div>
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-[680px]"
        style={{ minWidth: 480 }}
      >
        {/* Severity bands */}
        {BANDS.map(band => (
          <rect
            key={band.from}
            x={PAD.left}
            y={PAD.top + CH - (band.to / 100) * CH}
            width={CW}
            height={((band.to - band.from) / 100) * CH}
            fill={band.color}
            opacity={0.5}
          />
        ))}

        {/* Band labels */}
        {BANDS.map(band => (
          <text
            key={`lbl-${band.from}`}
            x={PAD.left + 3}
            y={PAD.top + CH - ((band.from + band.to) / 200) * CH + 3}
            className="text-[7px] fill-slate-400 select-none"
            fontFamily="system-ui"
          >
            {band.label}
          </text>
        ))}

        {/* Y-axis labels */}
        {yLabels.map(yl => (
          <text
            key={yl.label}
            x={PAD.left - 6}
            y={yl.y + 3}
            textAnchor="end"
            className="text-[8px] fill-slate-400 select-none"
            fontFamily="system-ui"
          >
            {yl.label}
          </text>
        ))}

        {/* Time labels */}
        {timeLabels.map((tl, i) => (
          <text
            key={i}
            x={tl.x}
            y={H - 4}
            textAnchor="middle"
            className="text-[8px] fill-slate-400 select-none"
            fontFamily="system-ui"
          >
            {tl.label}
          </text>
        ))}

        {/* Now line */}
        <line
          x1={nowX} y1={PAD.top} x2={nowX} y2={PAD.top + CH}
          stroke="#64748b" strokeWidth={1} strokeDasharray="3,3" opacity={0.6}
        />
        <text
          x={nowX}
          y={PAD.top - 4}
          textAnchor="middle"
          className="text-[7px] fill-slate-500 font-semibold select-none"
          fontFamily="system-ui"
        >
          NOW
        </text>

        {/* Confidence cone */}
        <path d={confPath} fill="#3b82f6" opacity={0.08} />

        {/* Prediction line */}
        <path
          d={predictionPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          strokeDasharray="4,3"
          opacity={0.7}
        />

        {/* History line */}
        <path
          d={historyPath}
          fill="none"
          stroke="#334155"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Current acuity dot */}
        <circle cx={nowX} cy={PAD.top + CH - (currentAcuity / 100) * CH} r={4} fill="#1e40af" stroke="#fff" strokeWidth={1.5} />

        {/* Event markers */}
        {eventMarkers.map((m, i) => (
          <g key={i}>
            <polygon
              points={`${m.x},${m.y - 5} ${m.x + 4},${m.y} ${m.x},${m.y + 5} ${m.x - 4},${m.y}`}
              fill="#f59e0b"
              stroke="#fff"
              strokeWidth={1}
            />
            <text
              x={m.x}
              y={m.y - 8}
              textAnchor="middle"
              className="text-[6px] fill-slate-500 select-none"
              fontFamily="system-ui"
            >
              {m.label}
            </text>
          </g>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} stroke="#cbd5e1" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top + CH} x2={PAD.left + CW} y2={PAD.top + CH} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
    </div>
  )
}
