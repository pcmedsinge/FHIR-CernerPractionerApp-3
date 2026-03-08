/**
 * ClinicalDashboard — single-patient clinical overview.
 *
 * Focused view for the in-context patient showing:
 * - Latest vitals with trend indicators
 * - Active conditions with flags
 * - Risk score cards with detailed breakdowns
 * - Quick action to record new vitals (opens modal directly)
 */

import { useEffect, useRef, useState } from 'react'
import { usePatientDashboard } from '../../hooks/usePatientDashboard'
import { RiskBadge } from './RiskBadge'
import { RecordVitals } from './RecordVitals'
import type { PatientClinicalData } from '../../types/app'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClinicalDashboardProps {
  /** Incrementing key — when it changes, dashboard refreshes vitals only */
  refreshKey?: number
  /** Called after vitals are successfully recorded from the dashboard modal */
  onVitalsRecorded?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClinicalDashboard({ refreshKey = 0, onVitalsRecorded }: ClinicalDashboardProps) {
  const {
    practitionerName,
    patientData,
    isLoading,
    error,
    refetch,
    refreshVitals,
  } = usePatientDashboard()

  const [recordOpen, setRecordOpen] = useState(false)

  // ---------------------------------------------------------------------------
  // React to external refreshKey changes (e.g. VitalsPanel saved new data)
  // Only triggers a lightweight vitals-only refresh, not a full reload.
  // ---------------------------------------------------------------------------
  const prevRefreshKey = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey
      void refreshVitals()
    }
  }, [refreshKey, refreshVitals])

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (isLoading && !patientData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-slate-400">
        <div className="w-8 h-8 border-[3px] border-card-border border-t-accent rounded-full animate-spinner" />
        <p>Loading clinical data...</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error
  // ---------------------------------------------------------------------------
  if (error && !patientData) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-status-critical">
        <p>{error}</p>
        <button className="py-2 px-5 rounded-md border border-accent bg-accent text-white cursor-pointer text-[13px]" onClick={refetch}>Retry</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-card-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">👨‍⚕️ {practitionerName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3.5 py-1.5 rounded-md border border-accent bg-accent text-white text-[13px] font-medium cursor-pointer transition-[background] duration-150 hover:bg-blue-700"
            onClick={() => setRecordOpen(true)}
          >
            📝 Record Vitals
          </button>
          <button
            className="px-3.5 py-1.5 rounded-md border border-card-border bg-white text-slate-900 text-[13px] cursor-pointer transition-[background] duration-150 hover:enabled:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={refetch}
            disabled={isLoading}
            title="Refresh clinical data"
          >
            {isLoading ? '↻ Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Record Vitals modal — opens directly from Dashboard */}
      <RecordVitals
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSaved={() => {
          // Refresh dashboard vitals + risk scores immediately
          void refreshVitals()
          // Notify parent so VitalsPanel can also update
          onVitalsRecorded?.()
        }}
      />

      {patientData ? (
        <div className="p-5 flex flex-col gap-6">
          {/* Vitals Section */}
          <VitalsOverview data={patientData} />

          {/* Conditions Section */}
          {patientData.conditionFlags.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-slate-900 m-0 pb-1.5 border-b border-card-border">Active Conditions</h3>
              <div className="flex flex-wrap gap-2">
                {patientData.conditionFlags.map(flag => (
                  <span key={flag} className="px-3 py-1 rounded-[14px] text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">{flag}</span>
                ))}
              </div>
            </section>
          )}

          {/* Risk Scores Section */}
          <RiskScoresPanel data={patientData} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-10 text-slate-400">
          <p>No clinical data available for this patient.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VitalsOverview — latest vitals in a horizontal card strip
// ---------------------------------------------------------------------------

function VitalsOverview({ data }: { data: PatientClinicalData }) {
  if (data.error) {
    return (
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900 m-0 pb-1.5 border-b border-card-border">Latest Vitals</h3>
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-[13px]">⚠ {data.error}</div>
      </section>
    )
  }

  if (!data.hasVitals) {
    return (
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900 m-0 pb-1.5 border-b border-card-border">Latest Vitals</h3>
        <div className="px-4 py-3 bg-slate-50 border border-card-border rounded-lg text-slate-400 text-[13px] italic">No vitals recorded for this patient.</div>
      </section>
    )
  }

  const { vitals } = data

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-slate-900 m-0 pb-1.5 border-b border-card-border">Latest Vitals</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        <VitalTile label="Blood Pressure" value={vitals.bloodPressure} unit="mmHg" icon="🫀" />
        <VitalTile label="Heart Rate" value={vitals.heartRate != null ? `${vitals.heartRate}` : null} unit="bpm" icon="💓" />
        <VitalTile label="Respiratory Rate" value={vitals.respiratoryRate != null ? `${vitals.respiratoryRate}` : null} unit="br/min" icon="🌬️" />
        <VitalTile label="SpO₂" value={vitals.spo2 != null ? `${vitals.spo2}` : null} unit="%" icon="🩸" />
        <VitalTile label="Temperature" value={vitals.temperature != null ? `${vitals.temperature}` : null} unit="°C" icon="🌡️" />
      </div>
    </section>
  )
}

function VitalTile({ label, value, unit, icon }: {
  label: string
  value: string | null
  unit: string
  icon: string
}) {
  return (
    <div className={`flex flex-col items-center gap-1 py-4 px-3 bg-white border border-card-border rounded-[10px] transition-shadow duration-150 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${value == null ? 'opacity-50' : ''}`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-[0.5px]">{label}</span>
      <span className="text-[22px] font-bold text-slate-900">{value ?? '—'}</span>
      {value != null && <span className="text-xs text-slate-400">{unit}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RiskScoresPanel — detailed risk score cards
// ---------------------------------------------------------------------------

function RiskScoresPanel({ data }: { data: PatientClinicalData }) {
  const { riskScores } = data
  const hasAnyScore = riskScores.news2 || riskScores.qsofa || riskScores.ascvd || riskScores.cha2ds2vasc

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-slate-900 m-0 pb-1.5 border-b border-card-border">Risk Assessment</h3>

      {!hasAnyScore ? (
        <div className="p-4 bg-slate-50 border border-card-border rounded-lg text-slate-400 text-[13px] text-center">
          Insufficient data to compute risk scores. Record vitals to enable risk assessment.
        </div>
      ) : (
        <>
          {/* Compact badge row */}
          <div className="flex flex-wrap gap-2.5 mb-2">
            <RiskBadge type="news2" news2={riskScores.news2} />
            <RiskBadge type="qsofa" qsofa={riskScores.qsofa} />
            <RiskBadge type="ascvd" ascvd={riskScores.ascvd} />
            <RiskBadge type="cha2ds2vasc" cha2ds2vasc={riskScores.cha2ds2vasc} />
          </div>

          {/* Detailed score cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            {riskScores.news2 && (
              <ScoreCard
                name="NEWS2"
                value={`${riskScores.news2.total}`}
                level={riskScores.news2.level}
                details={riskScores.news2.parameters.map(
                  (p: { name: string; value: string; score: number }) =>
                    `${p.name}: ${p.value} (score ${p.score})`,
                )}
                gaps={riskScores.news2.dataGaps}
              />
            )}
            {riskScores.qsofa && (
              <ScoreCard
                name="qSOFA"
                value={`${riskScores.qsofa.score}/3`}
                level={riskScores.qsofa.sepsisRisk ? 'high' : 'low'}
                details={[
                  riskScores.qsofa.criteria.highRespiratoryRate != null
                    ? `RR ≥ 22: ${riskScores.qsofa.criteria.highRespiratoryRate ? 'Yes' : 'No'}` : null,
                  riskScores.qsofa.criteria.lowSystolicBp != null
                    ? `SBP ≤ 100: ${riskScores.qsofa.criteria.lowSystolicBp ? 'Yes' : 'No'}` : null,
                  riskScores.qsofa.criteria.alteredMentation != null
                    ? `Altered mentation: ${riskScores.qsofa.criteria.alteredMentation ? 'Yes' : 'No'}` : null,
                ].filter((v): v is string => v != null)}
                gaps={riskScores.qsofa.dataGaps}
              />
            )}
            {riskScores.cha2ds2vasc && (
              <ScoreCard
                name="CHA₂DS₂-VASc"
                value={`${riskScores.cha2ds2vasc.score}/9`}
                level={riskScores.cha2ds2vasc.riskLevel}
                details={[`Annual stroke risk: ${riskScores.cha2ds2vasc.annualStrokeRisk}`]}
                gaps={riskScores.cha2ds2vasc.dataGaps}
              />
            )}
          </div>
        </>
      )}
    </section>
  )
}

const scoreBorderColor: Record<string, string> = {
  low: 'border-l-status-normal',
  moderate: 'border-l-status-warning',
  'low-medium': 'border-l-status-warning',
  borderline: 'border-l-status-warning',
  high: 'border-l-orange-600',
  medium: 'border-l-orange-600',
  intermediate: 'border-l-orange-600',
  critical: 'border-l-status-critical',
}

function ScoreCard({ name, value, level, details, gaps }: {
  name: string
  value: string
  level: string
  details: string[]
  gaps: string[]
}) {
  return (
    <div className={`bg-white border border-card-border border-l-4 rounded-lg p-3.5 ${scoreBorderColor[level] ?? 'border-l-card-border'}`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-semibold text-sm text-slate-900">{name}</span>
        <span className="font-bold text-lg text-slate-900">{value}</span>
      </div>
      <div className="text-xs uppercase tracking-[0.5px] text-slate-400 mb-2">{level}</div>
      {details.length > 0 && (
        <ul className="list-none p-0 mt-1.5 mb-0 text-xs text-slate-600">
          {details.map((d, i) => <li key={i} className="py-0.5">{d}</li>)}
        </ul>
      )}
      {gaps.length > 0 && (
        <div className="mt-1.5 text-[11px] text-status-warning italic">Missing: {gaps.join(', ')}</div>
      )}
    </div>
  )
}
