/**
 * RiskBadge — compact colored badge for a single risk score.
 *
 * Green (low), Yellow (moderate), Red (high/critical), Gray (no data).
 * Hover tooltip shows score breakdown and data gaps.
 */

import { useState } from 'react'
import type { NEWS2Result } from '../../utils/risk-scores/news2'
import type { QSofaResult } from '../../utils/risk-scores/qsofa'
import type { ASCVDResult } from '../../utils/risk-scores/ascvd'
import type { CHA2DS2VAScResult } from '../../utils/risk-scores/cha2ds2vasc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskType = 'news2' | 'qsofa' | 'ascvd' | 'cha2ds2vasc'

interface RiskBadgeProps {
  type: RiskType
  news2?: NEWS2Result | null
  qsofa?: QSofaResult | null
  ascvd?: ASCVDResult | null
  cha2ds2vasc?: CHA2DS2VAScResult | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LABELS: Record<RiskType, string> = {
  news2: 'NEWS2',
  qsofa: 'qSOFA',
  ascvd: 'ASCVD',
  cha2ds2vasc: 'CHA₂DS₂',
}

function getBadgeData(props: RiskBadgeProps): {
  label: string
  value: string
  color: 'green' | 'yellow' | 'red' | 'gray'
  tooltip: string[]
} {
  const label = LABELS[props.type]

  switch (props.type) {
    case 'news2': {
      const r = props.news2
      if (!r) return { label, value: '?', color: 'gray', tooltip: ['Insufficient data for NEWS2'] }
      const color = r.level === 'high' ? 'red'
        : r.level === 'medium' || r.level === 'low-medium' ? 'yellow'
        : 'green'
      const tooltipLines = [
        `NEWS2 Score: ${r.total}`,
        `Risk Level: ${r.level}`,
        '',
        ...r.parameters.map(p => `${p.name}: ${p.value} (${p.score})`),
        ...(r.dataGaps.length > 0 ? ['', `Missing: ${r.dataGaps.join(', ')}`] : []),
      ]
      return { label, value: `${r.total}`, color, tooltip: tooltipLines }
    }

    case 'qsofa': {
      const r = props.qsofa
      if (!r) return { label, value: '?', color: 'gray', tooltip: ['Insufficient data for qSOFA'] }
      const color = r.sepsisRisk ? 'red' : 'green'
      const criteriaLines: string[] = []
      if (r.criteria.highRespiratoryRate != null) {
        criteriaLines.push(`RR ≥ 22: ${r.criteria.highRespiratoryRate ? 'Yes' : 'No'}`)
      }
      if (r.criteria.lowSystolicBp != null) {
        criteriaLines.push(`SBP ≤ 100: ${r.criteria.lowSystolicBp ? 'Yes' : 'No'}`)
      }
      if (r.criteria.alteredMentation != null) {
        criteriaLines.push(`Altered mentation: ${r.criteria.alteredMentation ? 'Yes' : 'No'}`)
      }
      return {
        label,
        value: `${r.score}/3`,
        color,
        tooltip: [
          `qSOFA Score: ${r.score}/3`,
          r.sepsisRisk ? 'Sepsis Risk: POSITIVE' : 'Sepsis Risk: Low',
          '', ...criteriaLines,
          ...(r.dataGaps.length > 0 ? ['', `Missing: ${r.dataGaps.join(', ')}`] : []),
        ],
      }
    }

    case 'ascvd': {
      const r = props.ascvd
      if (!r) return { label, value: '?', color: 'gray', tooltip: ['Insufficient data for ASCVD (need age, sex, cholesterol, HDL, SBP)'] }
      const color = r.level === 'high' ? 'red'
        : r.level === 'intermediate' ? 'yellow'
        : 'green'
      return {
        label,
        value: `${r.riskPercent}%`,
        color,
        tooltip: [
          `10-Year ASCVD Risk: ${r.riskPercent}%`,
          `Level: ${r.level}`,
          ...(r.dataGaps.length > 0 ? ['', `Missing: ${r.dataGaps.join(', ')}`] : []),
        ],
      }
    }

    case 'cha2ds2vasc': {
      const r = props.cha2ds2vasc
      if (!r) return { label, value: '?', color: 'gray', tooltip: ['Insufficient data for CHA₂DS₂-VASc'] }
      const color = r.riskLevel === 'high' ? 'red'
        : r.riskLevel === 'moderate' ? 'yellow'
        : 'green'
      return {
        label,
        value: `${r.score}`,
        color,
        tooltip: [
          `CHA₂DS₂-VASc Score: ${r.score}/9`,
          `Risk: ${r.riskLevel}`,
          `Annual Stroke Risk: ${r.annualStrokeRisk}`,
          ...(r.dataGaps.length > 0 ? ['', `Missing: ${r.dataGaps.join(', ')}`] : []),
        ],
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const badgeColorClasses: Record<string, string> = {
  green: 'bg-green-100 text-green-900',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-900',
  gray: 'bg-slate-100 text-slate-500',
}

export function RiskBadge(props: RiskBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const { label, value, color, tooltip } = getBadgeData(props)

  return (
    <span
      className={`relative inline-flex items-center gap-[3px] px-[7px] py-0.5 rounded-[10px] text-[11px] font-semibold cursor-default whitespace-nowrap select-none ${badgeColorClasses[color] ?? ''}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="opacity-80">{label}</span>
      <span className="font-bold">{value}</span>
      {showTooltip && (
        <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-[11px] font-normal leading-relaxed whitespace-nowrap z-[100] pointer-events-none">
          {tooltip.map((line, i) => (
            <div key={i} className={line === '' ? 'h-1' : ''}>
              {line}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
