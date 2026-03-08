/**
 * InsightCard — a single clinical insight alert.
 *
 * Design: "3-second scan"
 * - Color-coded left border (red=critical, amber=warning)
 * - One-line headline always visible
 * - Detail, source, and suggested action hidden behind accordion
 * - Category icon for quick visual parsing
 */

import { useState } from 'react'
import type { ClinicalInsight } from '../../services/ai/clinicalAnalysis'
import { INSIGHT_ICON } from '../../components/icons/ClinicalIcons'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<ClinicalInsight['severity'], { border: string; bg: string; badge: string; badgeText: string }> = {
  critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-800',
    badgeText: 'CRITICAL',
  },
  warning: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 text-amber-800',
    badgeText: 'WARNING',
  },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightCard({ insight }: { insight: ClinicalInsight }) {
  const [expanded, setExpanded] = useState(false)
  const style = SEVERITY_STYLES[insight.severity]
  const CategoryIcon = INSIGHT_ICON[insight.category]

  return (
    <div
      className={`border border-card-border border-l-4 ${style.border} ${style.bg} rounded-lg overflow-hidden transition-all duration-150`}
    >
      {/* Header — always visible, clickable to expand */}
      <button
        type="button"
        className="w-full text-left px-4 py-3 bg-transparent border-none cursor-pointer flex items-start gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-lg leading-none mt-0.5 shrink-0">
          <CategoryIcon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.badge}`}>
              {style.badgeText}
            </span>
          </div>
          <p className="m-0 text-sm font-semibold text-slate-900 leading-snug">
            {insight.headline}
          </p>
        </div>
        <span className="text-xs text-slate-400 shrink-0 mt-1">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expandable detail */}
      {expanded && (
        <div className="px-4 pb-3.5 pt-0 border-t border-card-border">
          {insight.detail && (
            <p className="text-[13px] text-slate-700 leading-relaxed mt-2.5 mb-2">
              {insight.detail}
            </p>
          )}
          {insight.suggestedAction && (
            <div className="flex items-start gap-2 mt-2 px-3 py-2 bg-white rounded-md border border-card-border">
              <span className="text-xs font-semibold text-slate-500 shrink-0 mt-px">ACTION:</span>
              <span className="text-[13px] text-slate-800">{insight.suggestedAction}</span>
            </div>
          )}
          {insight.source && (
            <p className="text-[11px] text-slate-400 mt-2 mb-0 italic">
              Source: {insight.source}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
