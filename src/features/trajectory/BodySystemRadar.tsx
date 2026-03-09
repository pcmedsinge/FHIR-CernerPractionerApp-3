/**
 * BodySystemRadar — SVG spider/radar chart for 6 organ systems.
 *
 * Shows two overlapping hexagonal shapes:
 * - Faded: 12h ago ("Prior")
 * - Solid: Current ("Now")
 *
 * Instantly shows which systems are deteriorating (expanding outward)
 * vs improving (contracting inward).
 *
 * Design: dense, monochrome base + red fill for abnormal expansion.
 * No animation, no decoration — pure clinical signal.
 */

import { useMemo } from 'react'
import type { BodySystemScore } from '../../services/trajectory/trajectoryEngine'

interface BodySystemRadarProps {
  systems: BodySystemScore[]
}

const SIZE = 280
const CENTER = SIZE / 2
const RADIUS = 105
const LEVELS = 5 // Concentric rings (at 2, 4, 6, 8, 10)

function polarToXY(angle: number, radius: number): [number, number] {
  // Start from top (-90°), go clockwise
  const rad = ((angle - 90) * Math.PI) / 180
  return [CENTER + radius * Math.cos(rad), CENTER + radius * Math.sin(rad)]
}

export function BodySystemRadar({ systems }: BodySystemRadarProps) {
  const n = systems.length
  const angleStep = 360 / n

  const { nowPath, priorPath, axes, rings, deltaIndicators } = useMemo(() => {
    const angles = systems.map((_, i) => i * angleStep)

    // Generate polygon paths
    const toPath = (getValue: (s: BodySystemScore) => number): string => {
      const points = systems.map((s, i) => {
        const val = Math.min(10, Math.max(0, getValue(s)))
        const r = (val / 10) * RADIUS
        const [x, y] = polarToXY(angles[i], r)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      return 'M' + points.join(' L') + ' Z'
    }

    const nowP = toPath(s => s.now)
    const priorP = toPath(s => s.prior)

    // Axis lines + labels
    const axesData = systems.map((s, i) => {
      const [x, y] = polarToXY(angles[i], RADIUS + 18)
      const [lineX, lineY] = polarToXY(angles[i], RADIUS)
      return { label: s.abbrev, x, y, lineX, lineY, score: s.now, delta: s.delta }
    })

    // Concentric rings
    const ringsData = Array.from({ length: LEVELS }, (_, i) => {
      const r = ((i + 1) / LEVELS) * RADIUS
      const pts = angles.map(a => {
        const [x, y] = polarToXY(a, r)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      return { d: 'M' + pts.join(' L') + ' Z', r }
    })

    // Delta indicators (arrows next to labels)
    const deltas = systems.map((s, i) => {
      const [x, y] = polarToXY(angles[i], RADIUS + 32)
      let symbol = ''
      let color = '#94a3b8' // slate-400
      if (s.delta > 0.5) { symbol = '▲'; color = '#ef4444' }   // red — worsening
      else if (s.delta < -0.5) { symbol = '▼'; color = '#22c55e' } // green — improving
      else { symbol = '–'; color = '#94a3b8' }
      return { x, y, symbol, color }
    })

    return {
      nowPath: nowP,
      priorPath: priorP,
      axes: axesData,
      rings: ringsData,
      deltaIndicators: deltas,
    }
  }, [systems, angleStep])

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[240px] h-[240px] shrink-0">
        {/* Concentric rings */}
        {rings.map((ring, i) => (
          <polygon
            key={i}
            points={ring.d.slice(1)} // Remove the 'M'
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={0.5}
          />
        ))}

        {/* Axis lines */}
        {axes.map((a, i) => (
          <line
            key={i}
            x1={CENTER} y1={CENTER}
            x2={a.lineX} y2={a.lineY}
            stroke="#e2e8f0"
            strokeWidth={0.5}
          />
        ))}

        {/* Prior (12h ago) — faded */}
        <path
          d={priorPath}
          fill="#94a3b8"
          fillOpacity={0.08}
          stroke="#94a3b8"
          strokeWidth={1}
          strokeDasharray="3,2"
          opacity={0.5}
        />

        {/* Current — solid */}
        <path
          d={nowPath}
          fill="#3b82f6"
          fillOpacity={0.12}
          stroke="#1e40af"
          strokeWidth={1.5}
        />

        {/* Axis labels */}
        {axes.map((a, i) => (
          <text
            key={i}
            x={a.x}
            y={a.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[11px] font-semibold fill-slate-600 select-none"
            fontFamily="system-ui"
          >
            {a.label}
          </text>
        ))}

        {/* Delta indicators */}
        {deltaIndicators.map((d, i) => (
          <text
            key={i}
            x={d.x}
            y={d.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={d.color}
            className="text-[10px] select-none"
            fontFamily="system-ui"
          >
            {d.symbol}
          </text>
        ))}

        {/* Center dot */}
        <circle cx={CENTER} cy={CENTER} r={2} fill="#94a3b8" />
      </svg>

      {/* Legend + system list */}
      <div className="flex flex-col gap-2 w-full max-w-[280px]">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-1.5">
          <span className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-4 h-[2px] bg-blue-800 inline-block rounded" /> Current
          </span>
          <span className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-4 h-[2px] bg-slate-400 inline-block rounded opacity-50" style={{ borderBottom: '1px dashed #94a3b8' }} /> 12h ago
          </span>
        </div>

        {/* System scores */}
        {systems.map(s => {
          const deltaColor = s.delta > 0.5 ? 'text-red-500' : s.delta < -0.5 ? 'text-green-500' : 'text-slate-400'
          const deltaSymbol = s.delta > 0.5 ? '↑' : s.delta < -0.5 ? '↓' : '→'
          const barWidth = Math.round((s.now / 10) * 100)
          const barColor = s.now >= 7 ? 'bg-red-400' : s.now >= 4 ? 'bg-amber-300' : 'bg-blue-300'

          return (
            <div key={s.system} className="flex items-center gap-2.5">
              <span className="text-[12px] font-medium text-slate-600 w-[90px] shrink-0">{s.system}</span>
              <div className="flex-1 h-[7px] bg-slate-100 rounded-full overflow-hidden min-w-[80px]">
                <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
              </div>
              <span className="text-[12px] font-mono text-slate-500 w-[28px] text-right">{s.now.toFixed(1)}</span>
              <span className={`text-[12px] w-[14px] text-center ${deltaColor}`}>{deltaSymbol}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
