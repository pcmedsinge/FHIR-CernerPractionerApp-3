/**
 * PatientBriefing — unified single-page clinical view.
 *
 * Design philosophy: "As a practitioner my eyes are trained to see only
 * what is CRITICAL, ACTIONABLE, and RELEVANT — the rest I can explore."
 *
 * Layout:
 *  1. STICKY COMMAND CENTER (never scrolls away):
 *     - NEWS2 ≥ 7 emergency banner (red, impossible to miss)
 *     - AI Alerts (0-3 insight cards)
 *     - Risk scores (large, color-coded)
 *     - Vitals (color-coded: red/yellow/green)
 *  2. SCROLLABLE explore zone:
 *     - Lab sparklines (compact)
 *     - Vitals history accordion
 *     - Data quality footer
 *
 * No tabs. No navigation. Critical info pinned. One glance.
 */

import { useState, useCallback, lazy, Suspense } from 'react'
import { usePatientBriefing, type BriefingData } from '../../hooks/usePatientBriefing'
import { InsightCard } from '../insights/InsightCard'
import { LabTrendChart } from '../insights/LabTrendChart'
import { NotePanel } from '../notes/NotePanel'
import { isAIConfigured } from '../../services/ai/openaiPlatform'
import { getVitalStatus, type VitalType } from '../../services/fhir/observations'
import type { NEWS2Result } from '../../utils/risk-scores/news2'
import {
  IconAlert,
  IconCheckCircle,
  IconStethoscope,
  IconRefresh,
  IconBrain,
  IconWarning,
  VITAL_ICON,
} from '../../components/icons/ClinicalIcons'

// Lazy-load VitalsPanel — only when user expands the accordion
const VitalsPanel = lazy(() =>
  import('../dashboard/VitalsPanel').then(m => ({ default: m.VitalsPanel })),
)

// ---------------------------------------------------------------------------
// Vital status → Tailwind classes
// ---------------------------------------------------------------------------

const STATUS_BG: Record<string, string> = {
  critical: 'bg-red-50 border-red-300',
  warning: 'bg-amber-50 border-amber-300',
  normal: 'bg-white border-card-border',
  unknown: 'bg-white border-card-border',
}

const STATUS_TEXT: Record<string, string> = {
  critical: 'text-red-700',
  warning: 'text-amber-700',
  normal: 'text-slate-900',
  unknown: 'text-slate-900',
}

const STATUS_PULSE: Record<string, string> = {
  critical: 'animate-pulse',
  warning: '',
  normal: '',
  unknown: '',
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

  const handleVitalsSaved = useCallback(() => {
    void refreshVitals()
  }, [refreshVitals])

  // ── Loading state ─────────────────────────────────────────────────────

  if (tier1Loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <div className="w-8 h-8 border-[3px] border-card-border border-t-accent rounded-full animate-spinner" />
        <p className="text-sm">Loading patient briefing…</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-status-critical">
        <p className="text-sm">{error}</p>
        <button
          className="py-2 px-5 rounded-md border border-accent bg-accent text-white cursor-pointer text-[13px]"
          onClick={refreshAll}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  // Detect if NEWS2 is dangerously high (≥ 7 = high clinical risk)
  const news2High = data.riskScores.news2 && data.riskScores.news2.total >= 7

  return (
    <div className="flex flex-col h-[calc(100vh-90px)]">
      {/* ════════════════════════════════════════════════════════════════
          STICKY COMMAND CENTER — always visible, never scrolls away
          ════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 flex flex-col gap-2 pb-2 bg-surface z-10">
        {/* ── NEWS2 Emergency Banner ─────────────────────────────────── */}
        {news2High && <NEWS2Banner news2={data.riskScores.news2!} />}

        {/* ── Action bar (compact) ───────────────────────────────────── */}
        <ActionBar
          practitionerName={data.practitionerName}
          tier1Loading={tier1Loading}
          tier2Loading={tier2Loading}
          onRefresh={refreshAll}
          onReanalyze={reanalyze}
        />

        {/* ── AI Alerts ──────────────────────────────────────────────── */}
        <AlertsSection data={data} tier2Loading={tier2Loading} />

        {/* ── Risk Scores (large, prominent) ─────────────────────────── */}
        <RiskScoresBar data={data} />

        {/* ── Vitals (color-coded) ───────────────────────────────────── */}
        <CompactVitals data={data} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          EXPLORE ZONE — scrollable secondary content
          ════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pt-3 min-h-0">
        {/* ── Lab Sparklines ─────────────────────────────────────────── */}
        {data.labTrends.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider m-0">Lab Trends</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {data.labTrends.map(trend => (
                <LabTrendChart key={trend.labName} trend={trend} />
              ))}
            </div>
          </section>
        )}

        {/* ── Smart Notes ──────────────────────────────────────────── */}
        <NotePanel
          summary={data.clinicalSummary}
          insights={data.insights}
          labTrends={data.labTrends}
          riskScores={data.riskScores}
          dataLoading={tier2Loading}
        />

        {/* ── Vitals History Accordion ─────────────────────────────── */}
        <VitalsAccordion
          expanded={vitalsExpanded}
          onToggle={() => setVitalsExpanded(v => !v)}
          onVitalsRecorded={handleVitalsSaved}
        />

        {/* ── Data Quality Footer ──────────────────────────────────── */}
        <DataQualityFooter data={data} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NEWS2 Emergency Banner — impossible to miss
// ---------------------------------------------------------------------------

function NEWS2Banner({ news2 }: { news2: NEWS2Result }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-red-600 text-white rounded-lg animate-pulse">
      <span className="text-2xl"><IconAlert size={24} /></span>
      <div className="flex-1">
        <span className="text-sm font-bold">
          NEWS2 Score: {news2.total} — {news2.level === 'high' ? 'URGENT clinical review required' : 'Increased monitoring needed'}
        </span>
        <span className="text-xs opacity-90 ml-2">
          ({news2.parameters.filter(p => p.score > 0).map(p => `${p.name}: ${p.value}`).join(' · ')})
        </span>
      </div>
      <span className="text-xs font-semibold bg-white/20 rounded px-2 py-0.5">
        {news2.level.toUpperCase()}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActionBar — compact, toolbar-style
// ---------------------------------------------------------------------------

function ActionBar({
  practitionerName,
  tier1Loading,
  tier2Loading,
  onRefresh,
  onReanalyze,
}: {
  practitionerName: string
  tier1Loading: boolean
  tier2Loading: boolean
  onRefresh: () => void
  onReanalyze: () => void
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-1.5">
      <span className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5"><IconStethoscope size={14} /> {practitionerName}</span>
      <div className="flex items-center gap-1.5">
        {!isAIConfigured() && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-medium">
            AI N/A
          </span>
        )}
        <button
          title="Refresh vitals and risk scores"
          className="px-2.5 py-1 rounded-md border border-card-border bg-white text-slate-600 text-[12px] cursor-pointer hover:enabled:bg-slate-100 disabled:opacity-50"
          onClick={onRefresh}
          disabled={tier1Loading}
        >
          <span className="inline-flex items-center gap-1"><IconRefresh size={12} /> {tier1Loading ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <button
          title="Re-run AI clinical analysis"
          className="px-2.5 py-1 rounded-md border border-card-border bg-white text-slate-600 text-[12px] cursor-pointer hover:enabled:bg-slate-100 disabled:opacity-50"
          onClick={onReanalyze}
          disabled={tier2Loading}
        >
          <span className="inline-flex items-center gap-1"><IconBrain size={12} /> {tier2Loading ? 'Analyzing…' : 'Re-analyze'}</span>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AlertsSection — AI insight cards
// ---------------------------------------------------------------------------

function AlertsSection({ data, tier2Loading }: { data: BriefingData; tier2Loading: boolean }) {
  // Still loading Tier 2 — show prominent "analyzing" indicator
  if (tier2Loading && data.insights.length === 0 && !data.aiError) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spinner shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-blue-900">Analyzing clinical data…</span>
          <span className="text-[11px] text-blue-600">Checking medications, labs, allergies for alerts</span>
        </div>
      </div>
    )
  }

  // AI error
  if (data.aiError && data.insights.length === 0 && !data.allClear) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <span className="text-sm"><IconWarning size={16} /></span>
        <p className="text-xs text-amber-800 m-0">AI unavailable: {data.aiError}</p>
      </div>
    )
  }

  // All Clear
  if (data.allClear && data.insights.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
        <span className="text-sm text-green-600"><IconCheckCircle size={16} /></span>
        <p className="text-xs text-green-800 m-0 font-medium">
          No critical alerts
          {data.labTrends.length > 0 && ` · ${data.labTrends.length} lab trend${data.labTrends.length > 1 ? 's' : ''} below`}
        </p>
      </div>
    )
  }

  // Insight cards
  if (data.insights.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {data.insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// RiskScoresBar — prominent, color-coded risk scores
// ---------------------------------------------------------------------------

function RiskScoresBar({ data }: { data: BriefingData }) {
  const { riskScores } = data
  const hasAnyScore = riskScores.news2 || riskScores.qsofa || riskScores.ascvd || riskScores.cha2ds2vasc

  if (!hasAnyScore) {
    return (
      <div className="px-3 py-1.5 bg-slate-50 border border-card-border rounded-lg text-slate-400 text-[11px] text-center">
        Record vitals to enable risk scoring
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {riskScores.news2 && <RiskTile label="NEWS2" value={String(riskScores.news2.total)} color={riskScores.news2.level === 'high' ? 'red' : riskScores.news2.level === 'medium' || riskScores.news2.level === 'low-medium' ? 'yellow' : 'green'} sub={riskScores.news2.level} />}
      {riskScores.qsofa && <RiskTile label="qSOFA" value={`${riskScores.qsofa.score}/3`} color={riskScores.qsofa.sepsisRisk ? 'red' : 'green'} sub={riskScores.qsofa.sepsisRisk ? 'Sepsis risk' : 'Low'} />}
      {riskScores.ascvd && <RiskTile label="ASCVD" value={`${riskScores.ascvd.riskPercent}%`} color={riskScores.ascvd.level === 'high' ? 'red' : riskScores.ascvd.level === 'intermediate' ? 'yellow' : 'green'} sub={`10yr ${riskScores.ascvd.level}`} />}
      {riskScores.cha2ds2vasc && <RiskTile label="CHA₂DS₂" value={String(riskScores.cha2ds2vasc.score)} color={riskScores.cha2ds2vasc.riskLevel === 'high' ? 'red' : riskScores.cha2ds2vasc.riskLevel === 'moderate' ? 'yellow' : 'green'} sub={riskScores.cha2ds2vasc.riskLevel} />}
    </div>
  )
}

const RISK_COLORS: Record<string, { bg: string; text: string; value: string; border: string }> = {
  red: { bg: 'bg-red-50', text: 'text-red-500', value: 'text-red-700', border: 'border-red-300' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-500', value: 'text-amber-700', border: 'border-amber-300' },
  green: { bg: 'bg-green-50', text: 'text-green-500', value: 'text-green-700', border: 'border-green-300' },
}

function RiskTile({ label, value, color, sub }: { label: string; value: string; color: 'red' | 'yellow' | 'green'; sub: string }) {
  const c = RISK_COLORS[color]
  const isAlert = color === 'red'
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.bg} ${c.border} ${isAlert ? 'animate-pulse' : ''}`}>
      <div className="flex flex-col items-start">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${c.text}`}>{label}</span>
        <span className={`text-xs ${c.text} leading-tight`}>{sub}</span>
      </div>
      <span className={`text-xl font-black leading-none ${c.value}`}>{value}</span>
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

function CompactVitals({ data }: { data: BriefingData }) {
  if (!data.hasVitals) {
    return (
      <div className="px-3 py-1.5 bg-slate-50 border border-card-border rounded-lg text-slate-400 text-[11px] italic text-center">
        No vitals recorded
      </div>
    )
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {COMPACT_VITALS.map(v => {
        const raw = data.vitals[v.key]
        const value = raw != null ? String(raw) : null
        // Get clinical status for color coding
        let numericForStatus: number | null = null
        if (v.vitalType === 'bloodPressure') {
          numericForStatus = data.vitals.systolicBp
        } else if (typeof raw === 'number') {
          numericForStatus = raw
        }
        const status = value != null ? getVitalStatus(v.vitalType, numericForStatus) : 'unknown'
        const bg = STATUS_BG[status]
        const textColor = STATUS_TEXT[status]
        const pulse = STATUS_PULSE[status]

        const VitalIcon = VITAL_ICON[v.vitalType]
        return (
          <div
            key={v.key}
            className={`flex flex-col items-center gap-0 py-1.5 px-1 border rounded-lg ${bg} ${pulse} ${value == null ? 'opacity-40' : ''}`}
          >
            <span className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${status === 'critical' ? 'text-red-600' : status === 'warning' ? 'text-amber-600' : 'text-slate-600'}`}><VitalIcon size={12} />{v.label}</span>
            <span className={`text-xl font-black leading-tight ${textColor}`}>{value ?? '—'}</span>
            {value != null && <span className={`text-[10px] font-semibold ${status === 'critical' ? 'text-red-400' : status === 'warning' ? 'text-amber-400' : 'text-slate-500'}`}>{v.unit}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VitalsAccordion
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
    <section className="border border-card-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-left cursor-pointer hover:bg-slate-100 transition-colors duration-150 border-0"
        onClick={onToggle}
      >
        <span className="text-[12px] font-semibold text-slate-600">
          {expanded ? '▼' : '▶'} Vitals History
        </span>
        <span className="text-[10px] text-slate-400">
          {expanded ? 'Collapse' : 'Full history, trends, recording'}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-card-border">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-6 text-slate-400">
                <div className="w-5 h-5 border-2 border-card-border border-t-accent rounded-full animate-spinner mr-2" />
                <span className="text-xs">Loading…</span>
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
// DataQualityFooter — minimal
// ---------------------------------------------------------------------------

function DataQualityFooter({ data }: { data: BriefingData }) {
  if (!data.summaryMeta) return null
  const { summaryMeta, tokenUsage, aiError } = data
  const hasErrors = summaryMeta.errors.length > 0

  return (
    <div className="flex flex-col gap-0.5 text-[10px] text-slate-400 border-t border-card-border pt-2 pb-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span>{summaryMeta.populatedCategories}/5 categories</span>
        <span>·</span>
        <span>{new Date(summaryMeta.fetchedAt).toLocaleTimeString()}</span>
        {tokenUsage && <><span>·</span><span>{tokenUsage.total} tokens</span></>}
      </div>
      {hasErrors && (
        <div className="flex items-center gap-1 text-amber-500">
          <IconWarning size={12} /> {summaryMeta.errors.map(e => e.split(':')[0]).join(', ')} failed
        </div>
      )}
      {aiError && !tokenUsage && <div className="text-amber-500">{aiError}</div>}
    </div>
  )
}
