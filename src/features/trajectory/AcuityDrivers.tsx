/**
 * AcuityDrivers — shows what's driving the acuity score.
 *
 * Replaces the spider/radar chart. Each row = one contributor to the score,
 * sorted by impact (highest first). Color-coded bars + severity badges.
 *
 * Unique value: no other section explains *why* the acuity number is what
 * it is. This makes the score transparent and actionable.
 */

import type { ReactNode } from 'react'
import type { AcuityDriver } from '../../services/trajectory/trajectoryEngine'

interface AcuityDriversProps {
  drivers: AcuityDriver[]
  totalAcuity: number
}

// ---------------------------------------------------------------------------
// Severity / category styling
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<AcuityDriver['severity'], { bar: string; badge: string; badgeText: string; text: string }> = {
  critical: {
    bar: 'bg-red-500',
    badge: 'bg-red-50 border-red-200 text-red-700',
    badgeText: 'Critical',
    text: 'text-red-700',
  },
  warning: {
    bar: 'bg-amber-500',
    badge: 'bg-amber-50 border-amber-200 text-amber-700',
    badgeText: 'High',
    text: 'text-amber-700',
  },
  moderate: {
    bar: 'bg-blue-400',
    badge: 'bg-blue-50 border-blue-200 text-blue-600',
    badgeText: 'Moderate',
    text: 'text-blue-600',
  },
  normal: {
    bar: 'bg-slate-300',
    badge: 'bg-slate-50 border-slate-200 text-slate-500',
    badgeText: 'Low',
    text: 'text-slate-500',
  },
}

const CATEGORY_ICON: Record<AcuityDriver['category'], { icon: ReactNode; label: string }> = {
  vital: {
    label: 'Vital',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  risk: {
    label: 'Risk',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  condition: {
    label: 'Condition',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  insight: {
    label: 'Alert',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
}

// ---------------------------------------------------------------------------
// Driver Row
// ---------------------------------------------------------------------------

function DriverRow({ driver, maxPoints }: { driver: AcuityDriver; maxPoints: number }) {
  const style = SEVERITY_STYLES[driver.severity]
  const catIcon = CATEGORY_ICON[driver.category]
  const barWidth = maxPoints > 0 ? Math.max(4, (driver.points / maxPoints) * 100) : 0

  return (
    <div className="flex items-center gap-3 group">
      {/* Category icon */}
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${style.text} bg-slate-50 border border-slate-100`} title={catIcon.label}>
        {catIcon.icon}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Label + value row */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-slate-800 truncate">{driver.label}</span>
            <span className={`text-[13px] font-mono font-bold ${style.text}`}>{driver.value}</span>
          </div>
          <span className="text-[11px] text-slate-400 shrink-0">ref: {driver.reference}</span>
        </div>

        {/* Points bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-[6px] bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${style.bar} transition-all duration-500`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className={`text-[12px] font-bold tabular-nums w-[48px] text-right ${style.text}`}>
            +{driver.points.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AcuityDrivers({ drivers, totalAcuity }: AcuityDriversProps) {
  if (drivers.length === 0) {
    return (
      <div className="text-[13px] text-slate-400 italic py-4 bg-slate-50 rounded-lg px-4">
        No significant acuity drivers detected — patient vitals are within normal ranges.
      </div>
    )
  }

  const topPoints = drivers[0]?.points ?? 0
  const totalDriverPoints = drivers.reduce((s, d) => s + d.points, 0)

  return (
    <div className="space-y-1">
      {/* Driver rows */}
      <div className="space-y-2.5">
        {drivers.map((driver, i) => (
          <DriverRow key={`${driver.label}-${i}`} driver={driver} maxPoints={topPoints} />
        ))}
      </div>

      {/* Footer summary */}
      <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">
          {drivers.length} factor{drivers.length !== 1 ? 's' : ''} contributing
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-slate-400">Total</span>
          <span className="text-[14px] font-black text-slate-700 tabular-nums">
            {Math.round(totalDriverPoints)}
          </span>
          <span className="text-[11px] text-slate-400">→ Acuity</span>
          <span className={`text-[14px] font-black tabular-nums ${totalAcuity >= 70 ? 'text-red-600' : totalAcuity >= 45 ? 'text-amber-600' : 'text-slate-700'}`}>
            {totalAcuity}
          </span>
        </div>
      </div>
    </div>
  )
}
