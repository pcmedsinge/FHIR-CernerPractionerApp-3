/**
 * PatientBriefing — unified single-page clinical view (redesigned).
 *
 * Redesign goals:
 *  - Clear visual hierarchy via SectionCard wrappers
 *  - 4-size typography: heading 13px, body 13px, caption 11px, micro 10px
 *  - Skeleton loading (no spinner)
 *  - NotePanel in slide-out panel (not inline)
 *  - Neutral color palette — color only for clinical severity
 */

import { useState, useCallback, lazy, Suspense } from 'react'
import { usePatientBriefing, type BriefingData } from '../../hooks/usePatientBriefing'
import type { LabGroup } from '../../services/fhir/labs'
import { InsightCard } from '../insights/InsightCard'
import { LabTrendChart } from '../insights/LabTrendChart'
import { NotePanel } from '../notes/NotePanel'
import { SectionCard } from '../../components/SectionCard'
import { BriefingSkeleton } from '../../components/BriefingSkeleton'
import { isAIConfigured } from '../../services/ai/openaiPlatform'
import { getVitalStatus, type VitalType } from '../../services/fhir/observations'
import { PatientTrajectory } from '../trajectory/PatientTrajectory'
import type { NEWS2Result } from '../../utils/risk-scores/news2'
import {
  IconAlert,
  IconCheckCircle,
  IconRefresh,
  IconBrain,
  IconWarning,
  IconNote,
  VITAL_ICON,
} from '../../components/icons/ClinicalIcons'

// Lazy-load VitalsPanel — only when user expands the accordion
const VitalsPanel = lazy(() =>
  import('../dashboard/VitalsPanel').then(m => ({ default: m.VitalsPanel })),
)

// ---------------------------------------------------------------------------
// Vital status → Tailwind (neutral base, color only for abnormal)
// ---------------------------------------------------------------------------

const STATUS_BG: Record<string, string> = {
  critical: 'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
  normal: 'bg-white border-slate-200',
  unknown: 'bg-white border-slate-200',
}

const STATUS_TEXT: Record<string, string> = {
  critical: 'text-red-700',
  warning: 'text-amber-700',
  normal: 'text-slate-800',
  unknown: 'text-slate-400',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatientBriefing() {
  const {
    data,
    tier1Loading,
    tier2Loading,
    error,
    refreshVitals,
    reanalyze,
    refreshAll,
  } = usePatientBriefing()

  const [vitalsExpanded, setVitalsExpanded] = useState(false)
  const [notePanelOpen, setNotePanelOpen] = useState(false)

  const handleVitalsSaved = useCallback(() => {
    void refreshVitals()
  }, [refreshVitals])

  // ── Loading — skeleton instead of spinner ─────────────────────────

  if (tier1Loading && !data) {
    return <BriefingSkeleton />
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-status-critical">
        <p className="text-[13px]">{error}</p>
        <button
          className="py-2 px-5 rounded-lg border border-accent bg-accent text-white cursor-pointer text-[13px]"
          onClick={refreshAll}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const news2High = data.riskScores.news2 && data.riskScores.news2.total >= 7

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {/* ═══ NEWS2 EMERGENCY — sticky ═══ */}
        {news2High && (
          <div className="sticky top-0 z-20">
            <NEWS2Banner news2={data.riskScores.news2!} />
          </div>
        )}

        {/* ═══ ACTION BAR ═══ */}
        <ActionBar
          tier1Loading={tier1Loading}
          tier2Loading={tier2Loading}
          onRefresh={refreshAll}
          onReanalyze={reanalyze}
          onOpenNotes={() => setNotePanelOpen(true)}
          noteAvailable={!!data.clinicalSummary}
        />

        {/* ═══ PATIENT TRAJECTORY ═══ */}
        {data.hasVitals && (
          <PatientTrajectory data={data} />
        )}

        {/* ═══ AI ALERTS ═══ */}
        <AlertsSection data={data} tier2Loading={tier2Loading} />

        {/* ═══ RISK SCORES ═══ */}
        <SectionCard title="Risk Scores" icon={<IconAlert size={14} />}>
          <RiskScoresContent data={data} />
        </SectionCard>

        {/* ═══ VITALS ═══ */}
        <SectionCard
          title="Vitals"
          icon={<VITAL_ICON.heartRate size={14} />}
          subtitle={data.hasVitals ? undefined : 'No vitals recorded'}
          flush
        >
          <div className="px-3 py-2.5">
            <CompactVitals data={data} />
          </div>
        </SectionCard>

        {/* ═══ LAB TRENDS ═══ */}
        {data.labTrends.length > 0 && (
          <SectionCard title="Lab Trends" subtitle={`${data.labTrends.length} tracked`}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {data.labTrends.map(trend => (
                <LabTrendChart key={trend.labName} trend={trend} />
              ))}
            </div>
          </SectionCard>
        )}

        {/* ═══ LAB RESULTS ═══ */}
        {data.labGroups.length > 0 && (
          <SectionCard title="Lab Results" subtitle={`${data.labGroups.length} tests · ${data.labGroups.reduce((n, g) => n + g.readings.length, 0)} readings`}>
            <LabResultsGrid labGroups={data.labGroups} />
          </SectionCard>
        )}

        {/* ═══ VITALS HISTORY ═══ */}
        <VitalsAccordion
          expanded={vitalsExpanded}
          onToggle={() => setVitalsExpanded(v => !v)}
          onVitalsRecorded={handleVitalsSaved}
        />


      </div>

      {/* ═══ NOTES SLIDE-OUT ═══ */}
      <NoteSlideOut
        open={notePanelOpen}
        onClose={() => setNotePanelOpen(false)}
        data={data}
        dataLoading={tier2Loading}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// NEWS2 Emergency Banner — impossible to miss
// ---------------------------------------------------------------------------

function NEWS2Banner({ news2 }: { news2: NEWS2Result }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl shadow-[0_2px_8px_rgba(220,38,38,0.35)] animate-pulse">
      <span className="shrink-0"><IconAlert size={20} /></span>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-bold">
          NEWS2: {news2.total} — {news2.level === 'high' ? 'URGENT review' : 'Increased monitoring'}
        </span>
        <span className="text-[11px] opacity-90 ml-2">
          ({news2.parameters.filter(p => p.score > 0).map(p => `${p.name}: ${p.value}`).join(' · ')})
        </span>
      </div>
      <span className="text-[10px] font-semibold bg-white/20 rounded px-2 py-0.5 shrink-0">
        {news2.level.toUpperCase()}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActionBar — compact toolbar with note trigger
// ---------------------------------------------------------------------------

function ActionBar({
  tier1Loading,
  tier2Loading,
  onRefresh,
  onReanalyze,
  onOpenNotes,
  noteAvailable,
}: {
  tier1Loading: boolean
  tier2Loading: boolean
  onRefresh: () => void
  onReanalyze: () => void
  onOpenNotes: () => void
  noteAvailable: boolean
}) {
  return (
    <div className="flex items-center justify-end flex-wrap gap-1.5">
      <div className="flex items-center gap-1.5">
        {!isAIConfigured() && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
            AI N/A
          </span>
        )}
        <button
          title="Refresh vitals and risk scores"
          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] cursor-pointer hover:enabled:bg-slate-50 disabled:opacity-50"
          onClick={onRefresh}
          disabled={tier1Loading}
        >
          <span className="inline-flex items-center gap-1">
            <IconRefresh size={11} /> {tier1Loading ? 'Refreshing…' : 'Refresh'}
          </span>
        </button>
        <button
          title="Re-run AI clinical analysis"
          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] cursor-pointer hover:enabled:bg-slate-50 disabled:opacity-50"
          onClick={onReanalyze}
          disabled={tier2Loading}
        >
          <span className="inline-flex items-center gap-1">
            <IconBrain size={11} /> {tier2Loading ? 'Analyzing…' : 'Re-analyze'}
          </span>
        </button>
        <button
          title="Open Smart Notes panel"
          className="px-2.5 py-1 rounded-lg border-none bg-accent text-white text-[11px] font-semibold cursor-pointer hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onOpenNotes}
          disabled={!noteAvailable && !isAIConfigured()}
        >
          <span className="inline-flex items-center gap-1">
            <IconNote size={11} /> Notes
          </span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AlertsSection — AI insight cards
// ---------------------------------------------------------------------------

function AlertsSection({ data, tier2Loading }: { data: BriefingData; tier2Loading: boolean }) {
  // Insight cards — show first if we have any (from AI or local vitals)
  if (data.insights.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {data.insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    )
  }

  // Still loading Tier 2
  if (tier2Loading && !data.aiError) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-card">
        <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spinner shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-slate-600">Analyzing clinical data…</span>
          <span className="text-[11px] text-slate-400">Checking medications, labs, allergies</span>
        </div>
      </div>
    )
  }

  // AI error (but no insights from local fallback either)
  if (data.aiError && !data.allClear) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl shadow-card">
        <IconWarning size={14} className="text-amber-500 shrink-0" />
        <p className="text-[11px] text-slate-500 m-0">AI unavailable: {data.aiError}</p>
      </div>
    )
  }

  // All Clear
  if (data.allClear) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-card">
        <IconCheckCircle size={14} className="text-green-500" />
        <p className="text-[11px] text-slate-600 m-0 font-medium">
          No critical alerts
          {data.labTrends.length > 0 && ` · ${data.labTrends.length} lab trend${data.labTrends.length > 1 ? 's' : ''} below`}
        </p>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// RiskScoresContent — inside a SectionCard
// ---------------------------------------------------------------------------

function RiskScoresContent({ data }: { data: BriefingData }) {
  const { riskScores } = data
  const hasAnyScore = riskScores.news2 || riskScores.qsofa || riskScores.ascvd || riskScores.cha2ds2vasc

  if (!hasAnyScore) {
    return (
      <p className="text-[11px] text-slate-400 m-0 text-center italic">
        Record vitals to enable risk scoring
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {riskScores.news2 && (
        <RiskTile label="NEWS2" value={String(riskScores.news2.total)}
          level={riskScores.news2.level === 'high' ? 'critical' : riskScores.news2.level === 'medium' || riskScores.news2.level === 'low-medium' ? 'warning' : 'normal'}
          sub={riskScores.news2.level} />
      )}
      {riskScores.qsofa && (
        <RiskTile label="qSOFA" value={`${riskScores.qsofa.score}/3`}
          level={riskScores.qsofa.sepsisRisk ? 'critical' : 'normal'}
          sub={riskScores.qsofa.sepsisRisk ? 'Sepsis risk' : 'Low'} />
      )}
      {riskScores.ascvd && (
        <RiskTile label="ASCVD" value={`${riskScores.ascvd.riskPercent}%`}
          level={riskScores.ascvd.level === 'high' ? 'critical' : riskScores.ascvd.level === 'intermediate' ? 'warning' : 'normal'}
          sub={`10yr ${riskScores.ascvd.level}`} />
      )}
      {riskScores.cha2ds2vasc && (
        <RiskTile label="CHA₂DS₂" value={String(riskScores.cha2ds2vasc.score)}
          level={riskScores.cha2ds2vasc.riskLevel === 'high' ? 'critical' : riskScores.cha2ds2vasc.riskLevel === 'moderate' ? 'warning' : 'normal'}
          sub={riskScores.cha2ds2vasc.riskLevel} />
      )}
    </div>
  )
}

const RISK_STYLES = {
  critical: { bg: 'bg-red-50 border-red-200', label: 'text-red-600', value: 'text-red-700', sub: 'text-red-500' },
  warning: { bg: 'bg-amber-50 border-amber-200', label: 'text-amber-600', value: 'text-amber-700', sub: 'text-amber-500' },
  normal: { bg: 'bg-slate-50 border-slate-200', label: 'text-slate-500', value: 'text-slate-700', sub: 'text-slate-400' },
} as const

function RiskTile({ label, value, level, sub }: { label: string; value: string; level: 'critical' | 'warning' | 'normal'; sub: string }) {
  const s = RISK_STYLES[level]
  return (
    <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border ${s.bg}`}>
      <div className="flex flex-col">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.label}`}>{label}</span>
        <span className={`text-[11px] ${s.sub} leading-tight`}>{sub}</span>
      </div>
      <span className={`text-lg font-black leading-none ${s.value}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CompactVitals — color-coded by clinical status
// ---------------------------------------------------------------------------

const COMPACT_VITALS: Array<{
  key: keyof BriefingData['vitals']
  vitalType: VitalType
  label: string
  unit: string
}> = [
  { key: 'bloodPressure', vitalType: 'bloodPressure', label: 'BP', unit: 'mmHg' },
  { key: 'heartRate', vitalType: 'heartRate', label: 'HR', unit: 'bpm' },
  { key: 'respiratoryRate', vitalType: 'respiratoryRate', label: 'RR', unit: '/min' },
  { key: 'spo2', vitalType: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'temperature', vitalType: 'temperature', label: 'Temp', unit: '°C' },
]

// ---------------------------------------------------------------------------
// LabResultsGrid — compact lab results with reference range highlighting
// ---------------------------------------------------------------------------

function LabResultsGrid({ labGroups }: { labGroups: LabGroup[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
      {labGroups.map(group => {
        const latest = group.readings[0]
        if (!latest) return null

        const ref = group.referenceRange
        const val = latest.value
        let status: 'normal' | 'high' | 'low' | 'unknown' = 'unknown'
        if (val != null && ref) {
          if (ref.high != null && val > ref.high) status = 'high'
          else if (ref.low != null && val < ref.low) status = 'low'
          else status = 'normal'
        } else if (val != null) {
          status = 'normal'
        }

        const borderColor = status === 'high' || status === 'low' ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'
        const valueColor = status === 'high' || status === 'low' ? 'text-red-600' : 'text-slate-800'
        const refStr = ref
          ? `${ref.low ?? '—'}–${ref.high ?? '—'}`
          : ''

        const dateStr = latest.timestamp
          ? new Date(latest.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : ''

        return (
          <div key={group.name} className={`border rounded-lg px-3 py-2 ${borderColor}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-medium text-slate-500 truncate">{group.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{group.readings.length} reading{group.readings.length > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-[16px] font-bold ${valueColor} leading-none`}>
                {val != null ? val : '—'}
              </span>
              {group.unit && (
                <span className="text-[11px] text-slate-400">{group.unit}</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              {refStr && (
                <span className="text-[10px] text-slate-400">Ref: {refStr}</span>
              )}
              <span className="text-[10px] text-slate-400">{dateStr}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CompactVitals — inline vital signs display
// ---------------------------------------------------------------------------

function CompactVitals({ data }: { data: BriefingData }) {
  if (!data.hasVitals) {
    return (
      <p className="text-[11px] text-slate-400 m-0 italic text-center">
        No vitals recorded
      </p>
    )
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {COMPACT_VITALS.map(v => {
        const raw = data.vitals[v.key]
        const value = raw != null ? String(raw) : null
        let numericForStatus: number | null = null
        if (v.vitalType === 'bloodPressure') {
          numericForStatus = data.vitals.systolicBp
        } else if (typeof raw === 'number') {
          numericForStatus = raw
        }
        const status = value != null ? getVitalStatus(v.vitalType, numericForStatus) : 'unknown'
        const bg = STATUS_BG[status]
        const textColor = STATUS_TEXT[status]

        const VitalIcon = VITAL_ICON[v.vitalType]
        return (
          <div
            key={v.key}
            className={`flex flex-col items-center gap-0 py-1.5 px-1 border rounded-lg ${bg} ${value == null ? 'opacity-40' : ''}`}
          >
            <span className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide ${status === 'critical' ? 'text-red-500' : status === 'warning' ? 'text-amber-500' : 'text-slate-500'}`}>
              <VitalIcon size={11} />{v.label}
            </span>
            <span className={`text-lg font-bold leading-tight ${textColor}`}>{value ?? '—'}</span>
            {value != null && (
              <span className="text-[10px] text-slate-400">{v.unit}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VitalsAccordion — SectionCard-style
// ---------------------------------------------------------------------------

function VitalsAccordion({
  expanded,
  onToggle,
  onVitalsRecorded,
}: {
  expanded: boolean
  onToggle: () => void
  onVitalsRecorded: () => void
}) {
  return (
    <section className="bg-white border border-card-border rounded-xl shadow-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-white text-left cursor-pointer hover:bg-slate-50 transition-colors duration-150 border-none"
        onClick={onToggle}
      >
        <span className="text-[13px] font-semibold text-slate-700 flex items-center gap-2">
          <span className="text-[10px] text-slate-400">{expanded ? '▼' : '▶'}</span>
          Vitals History
        </span>
        <span className="text-[11px] text-slate-400">
          {expanded ? 'Collapse' : 'Full history & recording'}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-card-border">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-6 text-slate-400">
                <div className="w-4 h-4 border-2 border-card-border border-t-slate-500 rounded-full animate-spinner mr-2" />
                <span className="text-[11px]">Loading…</span>
              </div>
            }
          >
            <VitalsPanel onVitalsRecorded={onVitalsRecorded} />
          </Suspense>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// NoteSlideOut — right-side slide-out panel for clinical notes
// ---------------------------------------------------------------------------

function NoteSlideOut({
  open,
  onClose,
  data,
  dataLoading,
}: {
  open: boolean
  onClose: () => void
  data: BriefingData
  dataLoading: boolean
}) {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-modal flex flex-col animate-slide-in-right">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-card-border shrink-0">
          <div className="flex items-center gap-2">
            <IconNote size={16} className="text-slate-500" />
            <h2 className="text-[13px] font-semibold text-slate-700 m-0">Smart Notes</h2>
            <span className="text-[11px] text-slate-400">AI-assisted documentation</span>
          </div>
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 cursor-pointer hover:bg-slate-50 hover:text-slate-600 text-[13px]"
            onClick={onClose}
            title="Close notes panel"
          >
            ✕
          </button>
        </div>
        {/* NotePanel content — flex so textarea can fill remaining space */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-thin">
          <NotePanel
            summary={data.clinicalSummary}
            insights={data.insights}
            labTrends={data.labTrends}
            riskScores={data.riskScores}
            dataLoading={dataLoading}
            isSlideOut
          />
        </div>
      </div>
    </>
  )
}
