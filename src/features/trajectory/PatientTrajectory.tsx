/**
 * PatientTrajectory — full-viewport overlay for trajectory intelligence.
 *
 * Collapsed header stays in Chart Review showing trend + acuity at a glance.
 * Clicking opens a centered full-screen overlay with proper real estate.
 *
 * SEQUENCE (practitioner mental model):
 * 1. Body System Radar — "Which systems are at risk NOW?"
 * 2. Predictive Insights — "What should I do about it?"
 * 3. Acuity Timeline — "How did we get here?" (temporal detail)
 *
 * AI predictions lazy-loaded on overlay open. Charts render instantly.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { BriefingData } from '../../hooks/usePatientBriefing'
import { computeTrajectory, type TrajectoryData } from '../../services/trajectory/trajectoryEngine'
import { getTrajectoryPredictions, type PredictionCard } from '../../services/trajectory/trajectoryPredictions'
import { AcuityTimeline } from './AcuityTimeline'
import { BodySystemRadar } from './BodySystemRadar'

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const TREND_STYLES: Record<TrajectoryData['trend'], { bg: string; text: string; label: string; dot: string }> = {
  critical:  { bg: 'bg-red-50 border-red-200',     text: 'text-red-700',   label: 'Critical',  dot: 'bg-red-500' },
  worsening: { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700', label: 'Worsening', dot: 'bg-amber-500' },
  stable:    { bg: 'bg-slate-50 border-slate-200',  text: 'text-slate-600', label: 'Stable',    dot: 'bg-slate-400' },
  improving: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Improving', dot: 'bg-emerald-500' },
}

const SEVERITY_CARD: Record<PredictionCard['severity'], { border: string; dot: string; accent: string }> = {
  critical: { border: 'border-l-red-500',   dot: 'bg-red-500',   accent: 'text-red-700' },
  warning:  { border: 'border-l-amber-400', dot: 'bg-amber-400', accent: 'text-amber-700' },
  info:     { border: 'border-l-blue-400',  dot: 'bg-blue-400',  accent: 'text-blue-700' },
}

// ---------------------------------------------------------------------------
// Prediction Card — properly sized for overlay
// ---------------------------------------------------------------------------

function PredictionCardUI({ card }: { card: PredictionCard }) {
  const s = SEVERITY_CARD[card.severity]
  return (
    <div className={`bg-white border border-slate-200 border-l-[3px] ${s.border} rounded-lg px-4 py-3.5 shadow-sm`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full ${s.dot} shrink-0 mt-0.5`} />
          <span className="text-[14px] font-semibold text-slate-800 leading-snug">{card.headline}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[13px] font-mono font-bold text-slate-700">{card.confidence}</span>
          <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{card.timeframe}</span>
        </div>
      </div>
      {/* Detail */}
      <p className="text-[13px] text-slate-600 leading-relaxed m-0 mb-2.5">{card.detail}</p>
      {/* Action */}
      <div className={`text-[12px] font-medium ${s.accent} bg-slate-50 px-3 py-1.5 rounded-md inline-block leading-snug`}>
        {card.action}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Acuity Gauge — large number display for overlay header
// ---------------------------------------------------------------------------

function AcuityGauge({ value, label }: { value: number; label: string }) {
  const color = value >= 70 ? 'text-red-600' : value >= 45 ? 'text-amber-600' : value >= 20 ? 'text-slate-700' : 'text-emerald-600'
  const ring = value >= 70 ? 'border-red-200 bg-red-50' : value >= 45 ? 'border-amber-200 bg-amber-50' : value >= 20 ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50'

  return (
    <div className={`flex flex-col items-center justify-center w-[88px] h-[88px] rounded-full border-2 ${ring}`}>
      <span className={`text-[28px] font-black leading-none ${color}`}>{value}</span>
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section Header helper
// ---------------------------------------------------------------------------

function SectionHeader({ title, subtitle, number }: { title: string; subtitle: string; number: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span className="text-[11px] font-bold text-slate-400 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center shrink-0">{number}</span>
      <div>
        <h3 className="text-[15px] font-bold text-slate-800 m-0 leading-tight">{title}</h3>
        <p className="text-[12px] text-slate-400 m-0 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PatientTrajectoryProps {
  data: BriefingData
}

export function PatientTrajectory({ data }: PatientTrajectoryProps) {
  const [open, setOpen] = useState(false)
  const [predictions, setPredictions] = useState<PredictionCard[]>([])
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const fetchedRef = useRef(false)

  // Compute trajectory (pure math, instant)
  const trajectory = useMemo(() => computeTrajectory(data), [data])
  const trendStyle = TREND_STYLES[trajectory.trend]

  // Lazy-load AI predictions when overlay opens
  const loadPredictions = useCallback(async () => {
    if (fetchedRef.current || predictionsLoading) return
    fetchedRef.current = true
    setPredictionsLoading(true)
    try {
      const cards = await getTrajectoryPredictions(trajectory, data)
      setPredictions(cards)
    } catch (err) {
      console.warn('[PatientTrajectory] predictions failed:', err)
    } finally {
      setPredictionsLoading(false)
    }
  }, [trajectory, data, predictionsLoading])

  useEffect(() => {
    if (open && predictions.length === 0 && !fetchedRef.current) {
      void loadPredictions()
    }
  }, [open, predictions.length, loadPredictions])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Predicted 12h acuity
  const predicted12h = trajectory.prediction.length > 0
    ? trajectory.prediction[trajectory.prediction.length - 1].acuity
    : trajectory.currentAcuity

  return (
    <>
      {/* ── Collapsed Card — always visible in Chart Review ── */}
      <button
        type="button"
        className="w-full bg-white border border-card-border rounded-xl shadow-card overflow-hidden text-left cursor-pointer hover:shadow-card-hover hover:border-slate-300 transition-all duration-150"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Trajectory icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 shrink-0">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="text-[13px] font-semibold text-slate-700">Patient Trajectory</span>
            {/* Trend badge */}
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${trendStyle.bg} ${trendStyle.text}`}>
              {trendStyle.label}
            </span>
            <span className="text-[12px] font-mono text-slate-500">
              Acuity {trajectory.currentAcuity}/100
            </span>
            {trajectory.trend === 'worsening' || trajectory.trend === 'critical' ? (
              <span className="text-[11px] text-red-500 font-medium">→ {predicted12h} in 12h</span>
            ) : trajectory.trend === 'improving' ? (
              <span className="text-[11px] text-emerald-500 font-medium">→ {predicted12h} in 12h</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[11px]">View full analysis</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 17 17 7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </div>
        </div>
      </button>

      {/* ── Full Viewport Overlay ── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px]"
            onClick={() => setOpen(false)}
          />

          {/* Overlay Panel */}
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
            <div
              className="bg-white rounded-2xl shadow-modal w-full max-w-6xl animate-modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Overlay Header ── */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div className="flex items-center gap-4">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <div>
                    <h2 className="text-[17px] font-bold text-slate-800 m-0">Patient Trajectory Intelligence</h2>
                    <p className="text-[12px] text-slate-400 m-0 mt-0.5">48-hour retrospective · 12-hour predictive analysis</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Acuity gauge */}
                  <AcuityGauge value={trajectory.currentAcuity} label="Acuity" />
                  {/* Trend badge */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`flex items-center gap-1.5 text-[13px] font-bold ${trendStyle.text}`}>
                      <span className={`w-2 h-2 rounded-full ${trendStyle.dot} ${trajectory.trend === 'critical' ? 'animate-pulse' : ''}`} />
                      {trendStyle.label}
                    </span>
                    <span className="text-[11px] text-slate-400">{trajectory.severityLabel}</span>
                  </div>
                  {/* Close button */}
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 cursor-pointer hover:bg-slate-50 hover:text-slate-600 transition-colors ml-2"
                    onClick={() => setOpen(false)}
                    title="Close (Esc)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── SECTION 1: Body Systems + Predictive Insights (side by side) ── */}
              <div className="px-6 pt-5 pb-4">
                <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
                  {/* Left: Body System Radar */}
                  <div>
                    <SectionHeader number="1" title="Body Systems" subtitle="Current state vs 12 hours ago" />
                    <BodySystemRadar systems={trajectory.systems} />
                  </div>

                  {/* Right: Predictive Insights */}
                  <div>
                    <SectionHeader number="2" title="Predictive Insights" subtitle="AI-generated forward-looking analysis" />

                    {predictionsLoading && predictions.length === 0 && (
                      <div className="flex items-center gap-3 py-6">
                        <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spinner" />
                        <span className="text-[13px] text-slate-500">Generating predictive analysis…</span>
                      </div>
                    )}

                    {predictions.length > 0 && (
                      <div className="flex flex-col gap-2.5">
                        {predictions.map(card => (
                          <PredictionCardUI key={card.id} card={card} />
                        ))}
                      </div>
                    )}

                    {!predictionsLoading && predictions.length === 0 && fetchedRef.current && (
                      <div className="text-[13px] text-slate-400 italic py-4 bg-slate-50 rounded-lg px-4">
                        Unable to generate predictions. Ensure OpenAI API key is configured.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 mx-6" />

              {/* ── SECTION 2: Acuity Timeline (full width) ── */}
              <div className="px-6 pt-4 pb-3">
                <SectionHeader number="3" title="Acuity Timeline" subtitle="Composite acuity index over 60 hours with severity bands" />
                <AcuityTimeline
                  history={trajectory.history}
                  prediction={trajectory.prediction}
                  currentAcuity={trajectory.currentAcuity}
                />
              </div>

              {/* ── Footer disclaimer ── */}
              <div className="px-6 pb-4 pt-2">
                <p className="text-[11px] text-slate-400 m-0 leading-relaxed bg-slate-50 rounded-lg px-4 py-2.5">
                  <span className="font-semibold text-slate-500">Note:</span> History is synthetically generated from current vital-sign anchor points. In production, this would use full FHIR observation history. Predictions are AI-assisted estimates — always apply clinical judgment.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
