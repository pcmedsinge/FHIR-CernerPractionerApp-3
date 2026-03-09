/**
 * PatientTrajectory — collapsible "Patient Trajectory" section.
 *
 * Collapsed by default. When expanded:
 * - Acuity timeline + body system radar render instantly (pre-computed)
 * - AI predictive cards lazy-load (one OpenAI call)
 *
 * Professional, dense clinical layout. No decoration.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { BriefingData } from '../../hooks/usePatientBriefing'
import { computeTrajectory, type TrajectoryData } from '../../services/trajectory/trajectoryEngine'
import { getTrajectoryPredictions, type PredictionCard } from '../../services/trajectory/trajectoryPredictions'
import { AcuityTimeline } from './AcuityTimeline'
import { BodySystemRadar } from './BodySystemRadar'

// ---------------------------------------------------------------------------
// Trend badge styles
// ---------------------------------------------------------------------------

const TREND_STYLES: Record<TrajectoryData['trend'], { bg: string; text: string; label: string }> = {
  critical:  { bg: 'bg-red-50 border-red-200',   text: 'text-red-700',   label: 'Critical' },
  worsening: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Worsening' },
  stable:    { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600', label: 'Stable' },
  improving: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Improving' },
}

const SEVERITY_CARD: Record<PredictionCard['severity'], { border: string; dot: string; bg: string }> = {
  critical: { border: 'border-l-red-500', dot: 'bg-red-500', bg: 'bg-red-50/30' },
  warning:  { border: 'border-l-amber-400', dot: 'bg-amber-400', bg: 'bg-amber-50/30' },
  info:     { border: 'border-l-blue-300', dot: 'bg-blue-400', bg: 'bg-white' },
}

// ---------------------------------------------------------------------------
// Prediction Card component
// ---------------------------------------------------------------------------

function PredictionCardUI({ card }: { card: PredictionCard }) {
  const s = SEVERITY_CARD[card.severity]
  return (
    <div className={`border border-slate-200 border-l-[3px] ${s.border} ${s.bg} rounded-lg px-3 py-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0`} />
            <span className="text-[12px] font-semibold text-slate-800 leading-tight">{card.headline}</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed m-0 mb-1.5">{card.detail}</p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {card.action}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[10px] font-mono font-bold text-slate-600">{card.confidence}</span>
          <span className="text-[9px] text-slate-400">{card.timeframe}</span>
        </div>
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
  const [expanded, setExpanded] = useState(false)
  const [predictions, setPredictions] = useState<PredictionCard[]>([])
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const fetchedRef = useRef(false)

  // Compute trajectory (pure math, instant)
  const trajectory = useMemo(() => computeTrajectory(data), [data])
  const trendStyle = TREND_STYLES[trajectory.trend]

  // Lazy-load AI predictions when expanded
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
    if (expanded && predictions.length === 0 && !fetchedRef.current) {
      void loadPredictions()
    }
  }, [expanded, predictions.length, loadPredictions])

  return (
    <section className="bg-white border border-card-border rounded-xl shadow-card overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white text-left cursor-pointer hover:bg-slate-50/70 transition-colors duration-150 border-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-slate-400">{expanded ? '▼' : '▶'}</span>
          {/* Trajectory icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 shrink-0">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-[13px] font-semibold text-slate-700">Patient Trajectory</span>
          {/* Trend badge */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${trendStyle.bg} ${trendStyle.text}`}>
            {trendStyle.label}
          </span>
          {/* Acuity score */}
          <span className="text-[11px] font-mono text-slate-500">
            Acuity {trajectory.currentAcuity}/100
          </span>
        </div>
        <span className="text-[10px] text-slate-400 shrink-0">
          {expanded ? 'Collapse' : '48h history · 12h forecast'}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-card-border">
          {/* Acuity Timeline */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider m-0">Acuity Timeline</h4>
              <span className="text-[9px] text-slate-400">48h history + 12h prediction</span>
              <span className="text-[9px] text-slate-400 ml-auto italic">
                Synthetic history · Real anchor point
              </span>
            </div>
            <AcuityTimeline
              history={trajectory.history}
              prediction={trajectory.prediction}
              currentAcuity={trajectory.currentAcuity}
            />
          </div>

          <div className="border-t border-slate-100" />

          {/* Body System Radar + AI Predictions — side by side on wider screens */}
          <div className="px-3 py-3">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Radar */}
              <div className="min-w-0">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider m-0 mb-2">
                  Body Systems
                  <span className="text-[9px] text-slate-400 font-normal ml-2 normal-case">Now vs 12h ago</span>
                </h4>
                <BodySystemRadar systems={trajectory.systems} />
              </div>

              {/* AI Predictions */}
              <div className="flex-1 min-w-0">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider m-0 mb-2">
                  Predictive Insights
                  <span className="text-[9px] text-slate-400 font-normal ml-2 normal-case">AI-generated</span>
                </h4>

                {predictionsLoading && predictions.length === 0 && (
                  <div className="flex items-center gap-2 py-4">
                    <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spinner" />
                    <span className="text-[11px] text-slate-400">Generating predictive analysis…</span>
                  </div>
                )}

                {predictions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {predictions.map(card => (
                      <PredictionCardUI key={card.id} card={card} />
                    ))}
                  </div>
                )}

                {!predictionsLoading && predictions.length === 0 && fetchedRef.current && (
                  <div className="text-[11px] text-slate-400 italic py-3">
                    Unable to generate predictions. AI may not be configured.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="px-3 pb-2">
            <p className="text-[9px] text-slate-400 m-0 leading-relaxed border-t border-slate-100 pt-2">
              Trajectory data uses synthetic history generated from current vital signs. In production, this would use full FHIR observation history. Predictions are AI-assisted estimates — always apply clinical judgment.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
