/**
 * InsightsView — AI Clinical Decision Assistant.
 *
 * "3-second scan" design:
 * - Practitioner sees a summary badge at the top (# of alerts)
 * - Max 3 insight cards ranked by urgency
 * - Problematic lab trend charts (only ones heading toward danger)
 * - "All Clear" state when nothing needs attention
 *
 * No raw clinical data lists — everything is behind-the-scenes fuel for AI.
 * This view shows ONLY what the EHR can't: predictive insights & interactions.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { getComprehensiveSummary, type PatientClinicalSummary } from '../../services/fhir/patientSummary'
import {
  analyzeClinicalData,
  type ClinicalAnalysisResult,
} from '../../services/ai/clinicalAnalysis'
import { isAIConfigured } from '../../services/ai/openaiPlatform'
import { InsightCard } from './InsightCard'
import { LabTrendChart } from './LabTrendChart'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnalysisState = 'idle' | 'fetching' | 'analyzing' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightsView() {
  const { session } = useAuth()
  const [state, setState] = useState<AnalysisState>('idle')
  const [summary, setSummary] = useState<PatientClinicalSummary | null>(null)
  const [analysis, setAnalysis] = useState<ClinicalAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const hasFetchedRef = useRef(false)

  const patientId = session?.patientId ?? ''
  const accessToken = session?.accessToken ?? ''

  const runAnalysis = useCallback(async () => {
    if (!patientId || !accessToken) return

    setState('fetching')
    setError(null)

    try {
      // Step 1: Aggregate all clinical data
      const summaryData = await getComprehensiveSummary(patientId, accessToken)
      if (!mountedRef.current) return
      setSummary(summaryData)
      setState('analyzing')

      // Step 2: Run AI analysis (or local-only if no API key)
      const result = await analyzeClinicalData(summaryData)
      if (!mountedRef.current) return
      setAnalysis(result)
      setState('done')
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setState('error')
    }
  }, [patientId, accessToken])

  useEffect(() => {
    mountedRef.current = true
    // Only auto-fetch once on mount
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      void runAnalysis()
    }
    return () => { mountedRef.current = false }
  }, [runAnalysis])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!patientId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-[15px]">
        No patient in context.
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4 h-full min-h-0 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="m-0 text-[17px] font-bold text-slate-900">AI Clinical Insights</h2>
          <StatusBadge state={state} analysis={analysis} />
        </div>
        <div className="flex items-center gap-2">
          {!isAIConfigured() && (
            <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 font-medium">
              AI not configured — showing local analysis only
            </span>
          )}
          <button
            type="button"
            className="bg-transparent text-slate-600 border border-card-border rounded-lg px-3 py-[7px] text-xs font-medium cursor-pointer transition-[background,color] duration-150 whitespace-nowrap hover:enabled:bg-white hover:enabled:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={state === 'fetching' || state === 'analyzing'}
            onClick={() => void runAnalysis()}
          >
            {state === 'fetching' ? '↻ Fetching data…' : state === 'analyzing' ? '🧠 Analyzing…' : '↻ Re-analyze'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {(state === 'fetching' || state === 'analyzing') && (
        <LoadingState state={state} summary={summary} />
      )}

      {/* Error state */}
      {state === 'error' && error && (
        <div className="flex flex-col items-center gap-3 py-8 text-status-critical">
          <p className="text-sm">{error}</p>
          <button
            className="py-2 px-5 rounded-md border border-accent bg-accent text-white cursor-pointer text-[13px]"
            onClick={() => void runAnalysis()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {state === 'done' && analysis && (
        <div className="flex flex-col gap-5">
          {/* All Clear state */}
          {analysis.allClear && analysis.insights.length === 0 && (
            <AllClearBanner labTrendCount={analysis.labTrends.length} />
          )}

          {/* Insight Cards */}
          {analysis.insights.length > 0 && (
            <div className="flex flex-col gap-3">
              {analysis.insights.map(insight => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}

          {/* Lab Trends — only problematic ones */}
          {analysis.labTrends.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-sm font-semibold text-slate-900 m-0">Lab Trends to Watch</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                {analysis.labTrends.map(trend => (
                  <LabTrendChart key={trend.labName} trend={trend} />
                ))}
              </div>
            </div>
          )}

          {/* Data quality note */}
          {summary && (
            <DataQualityNote summary={summary} analysis={analysis} />
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ state, analysis }: { state: AnalysisState; analysis: ClinicalAnalysisResult | null }) {
  if (state === 'fetching' || state === 'analyzing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        {state === 'fetching' ? 'Gathering data…' : 'Running analysis…'}
      </span>
    )
  }
  if (state === 'done' && analysis) {
    if (analysis.allClear && analysis.insights.length === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-[11px] font-semibold">
          ✓ All Clear
        </span>
      )
    }
    const critCount = analysis.insights.filter(i => i.severity === 'critical').length
    const warnCount = analysis.insights.filter(i => i.severity === 'warning').length
    return (
      <div className="flex items-center gap-1.5">
        {critCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold">
            {critCount} critical
          </span>
        )}
        {warnCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
            {warnCount} warning
          </span>
        )}
      </div>
    )
  }
  return null
}

function LoadingState({ state, summary }: { state: AnalysisState; summary: PatientClinicalSummary | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="w-10 h-10 border-[3px] border-card-border border-t-accent rounded-full animate-spinner" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-slate-600 font-medium m-0">
          {state === 'fetching' ? 'Gathering clinical data…' : '🧠 AI analyzing patient data…'}
        </p>
        {state === 'fetching' && (
          <p className="text-xs text-slate-400 m-0">
            Fetching vitals, conditions, medications, allergies, and labs
          </p>
        )}
        {state === 'analyzing' && summary && (
          <p className="text-xs text-slate-400 m-0">
            Processing {summary.meta.populatedCategories} data categories
          </p>
        )}
      </div>
    </div>
  )
}

function AllClearBanner({ labTrendCount }: { labTrendCount: number }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 bg-green-50 border border-green-200 rounded-lg">
      <span className="text-3xl">✅</span>
      <div>
        <p className="text-sm font-semibold text-green-900 m-0">No critical alerts for this patient</p>
        <p className="text-xs text-green-700 mt-0.5 m-0">
          No drug interactions, contraindications, or urgent guideline deviations detected.
          {labTrendCount > 0 && ` ${labTrendCount} lab trend${labTrendCount > 1 ? 's' : ''} shown below for monitoring.`}
        </p>
      </div>
    </div>
  )
}

function DataQualityNote({ summary, analysis }: { summary: PatientClinicalSummary; analysis: ClinicalAnalysisResult }) {
  const { meta } = summary
  const hasErrors = meta.errors.length > 0

  return (
    <div className="flex flex-col gap-1 text-[11px] text-slate-400 border-t border-card-border pt-3 mt-1">
      <div className="flex items-center gap-3 flex-wrap">
        <span>Data: {meta.populatedCategories}/5 categories</span>
        <span>·</span>
        <span>Analyzed: {new Date(meta.fetchedAt).toLocaleTimeString()}</span>
        {analysis.tokenUsage && (
          <>
            <span>·</span>
            <span>Tokens: {analysis.tokenUsage.total}</span>
          </>
        )}
      </div>
      {hasErrors && (
        <div className="text-amber-500">
          ⚠ Partial data: {meta.errors.map(e => e.split(':')[0]).join(', ')} failed to load
        </div>
      )}
      {analysis.error && !analysis.tokenUsage && (
        <div className="text-amber-500">
          {analysis.error}
        </div>
      )}
    </div>
  )
}
