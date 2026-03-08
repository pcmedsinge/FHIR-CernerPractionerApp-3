/**
 * usePatientBriefing — unified hook replacing usePatientDashboard + InsightsView fetch logic.
 *
 * Progressive two-tier data loading with staleness-based cache:
 *
 * Tier 1 (critical path, renders in ~1-2s):
 *   - Practitioner name
 *   - Patient demographics
 *   - Vitals (8 parallel LOINC queries)
 *   - Conditions (for risk scores)
 *   → Computes risk scores locally (instant)
 *
 * Tier 2 (background, 2-5s after Tier 1):
 *   - Medications, Allergies, Labs (3 parallel queries)
 *   - AI analysis (after data gathered)
 *   → Renders insight cards + lab trend charts
 *
 * Staleness thresholds:
 *   Demographics: Infinity (never changes mid-session)
 *   Conditions:   30 min
 *   Vitals:       5 min OR after recording new vitals
 *   Meds/Allergies/Labs: 15 min
 *   AI Analysis:  stale when underlying data refreshes
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getPractitioner, getPractitionerDisplayName } from '../services/fhir/practitioner'
import { fhirFetch } from '../services/fhir/client'
import { getVitalSigns, type VitalSignGroup } from '../services/fhir/observations'
import { getPatientConditions, type PatientConditions } from '../services/fhir/conditions'
import { getPatientMedications, type MedicationSummary } from '../services/fhir/medications'
import { getPatientAllergies, type AllergySummary } from '../services/fhir/allergies'
import { getPatientLabs, type LabGroup } from '../services/fhir/labs'
import { analyzeClinicalData, analyzeLabTrendsLocally, type ClinicalAnalysisResult, type ClinicalInsight, type LabTrend } from '../services/ai/clinicalAnalysis'
import type { PatientClinicalSummary } from '../services/fhir/patientSummary'
import { calculateNEWS2 } from '../utils/risk-scores/news2'
import { calculateQSofa } from '../utils/risk-scores/qsofa'
import { calculateASCVD } from '../utils/risk-scores/ascvd'
import { calculateCHA2DS2VASc } from '../utils/risk-scores/cha2ds2vasc'
import type { PatientClinicalData, VitalsSnapshot, RiskScores } from '../types/app'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BriefingData {
  // Tier 1
  practitionerName: string
  vitals: VitalsSnapshot
  vitalGroups: VitalSignGroup[]
  riskScores: RiskScores
  maxSeverity: PatientClinicalData['maxSeverity']
  conditionFlags: string[]
  hasVitals: boolean

  // Tier 2 (AI)
  insights: ClinicalInsight[]
  labTrends: LabTrend[]
  allClear: boolean
  aiError: string | null
  tokenUsage: { prompt: number; completion: number; total: number } | null
  summaryMeta: PatientClinicalSummary['meta'] | null
  /** Full clinical summary for note generation (available after Tier 2) */
  clinicalSummary: PatientClinicalSummary | null
}

export interface UsePatientBriefingResult {
  data: BriefingData | null
  tier1Loading: boolean
  tier2Loading: boolean
  error: string | null
  /** Re-fetch only vitals + recompute risk scores (after recording) */
  refreshVitals: () => Promise<void>
  /** Re-fetch Tier 2 data + re-run AI analysis */
  reanalyze: () => Promise<void>
  /** Full reload of everything */
  refreshAll: () => void
}

// ---------------------------------------------------------------------------
// Staleness thresholds (ms)
// ---------------------------------------------------------------------------

const STALE_DEMOGRAPHICS = Infinity       // never stale
const STALE_CONDITIONS   = 30 * 60_000    // 30 min
const STALE_VITALS       = 5 * 60_000     // 5 min
const STALE_MEDS_ALLERGY = 15 * 60_000    // 15 min
const STALE_LABS         = 15 * 60_000    // 15 min

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

function isFresh<T>(entry: CacheEntry<T> | null, maxAge: number): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() - entry.fetchedAt < maxAge
}

// ---------------------------------------------------------------------------
// Helpers (reused from usePatientDashboard — DRY these later if needed)
// ---------------------------------------------------------------------------

function ageFromBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return '?'
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return '?'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--
  return String(age)
}

async function getPatientDemographics(
  patientId: string,
  token: string,
): Promise<{ age: string; gender: string }> {
  const patient = await fhirFetch<{ gender?: string; birthDate?: string }>(
    `Patient/${patientId}`, token,
  )
  return {
    age: ageFromBirthDate(patient.birthDate),
    gender: (patient.gender ?? 'unknown').toLowerCase(),
  }
}

function extractVitalsSnapshot(groups: VitalSignGroup[]): VitalsSnapshot {
  const find = (type: string) => groups.find(g => g.type === type)
  const bpReading = find('bloodPressure')?.readings[0]
  let systolicBp: number | null = null
  if (bpReading?.displayValue) {
    const sys = Number(bpReading.displayValue.split('/')[0])
    if (!Number.isNaN(sys)) systolicBp = sys
  }
  return {
    bloodPressure: bpReading?.displayValue ?? null,
    heartRate: find('heartRate')?.readings[0]?.numericValue ?? null,
    temperature: find('temperature')?.readings[0]?.numericValue ?? null,
    spo2: find('spo2')?.readings[0]?.numericValue ?? null,
    respiratoryRate: find('respiratoryRate')?.readings[0]?.numericValue ?? null,
    systolicBp,
  }
}

function computeRiskScores(
  vitals: VitalsSnapshot,
  patient: { age: string; gender: string },
  conditions: PatientConditions,
): RiskScores {
  const ageNum = patient.age ? parseInt(patient.age, 10) : null
  const sex = patient.gender === 'male' || patient.gender === 'female' ? patient.gender : null

  return {
    news2: calculateNEWS2({
      respiratoryRate: vitals.respiratoryRate, spo2: vitals.spo2,
      supplementalO2: null, temperature: vitals.temperature,
      systolicBp: vitals.systolicBp, heartRate: vitals.heartRate, consciousness: null,
    }),
    qsofa: calculateQSofa({
      respiratoryRate: vitals.respiratoryRate, systolicBp: vitals.systolicBp, gcs: null,
    }),
    ascvd: calculateASCVD({
      age: ageNum, sex, race: null, totalCholesterol: null, hdlCholesterol: null,
      systolicBp: vitals.systolicBp,
      onBpTreatment: conditions.hasHypertension ? true : null,
      hasDiabetes: conditions.hasDiabetes, isSmoker: null,
    }),
    cha2ds2vasc: calculateCHA2DS2VASc({
      age: ageNum, sex, hasChf: conditions.hasChf,
      hasHypertension: conditions.hasHypertension, hasDiabetes: conditions.hasDiabetes,
      hasStrokeTia: conditions.hasStrokeTia, hasVascularDisease: conditions.hasVascularDisease,
    }),
  }
}

function resolveMaxSeverity(scores: RiskScores): PatientClinicalData['maxSeverity'] {
  const levels: PatientClinicalData['maxSeverity'][] = []
  if (scores.news2) {
    const n = scores.news2.level
    levels.push(n === 'high' ? 'critical' : n === 'medium' ? 'high' : n === 'low-medium' ? 'moderate' : 'low')
  }
  if (scores.qsofa) levels.push(scores.qsofa.sepsisRisk ? 'critical' : 'low')
  if (scores.ascvd) {
    const a = scores.ascvd.level
    levels.push(a === 'high' ? 'high' : a === 'intermediate' ? 'moderate' : 'low')
  }
  if (scores.cha2ds2vasc) {
    const c = scores.cha2ds2vasc.riskLevel
    levels.push(c === 'high' ? 'high' : c === 'moderate' ? 'moderate' : 'low')
  }
  if (levels.length === 0) return 'unknown'
  for (const p of ['critical', 'high', 'moderate', 'low'] as const) {
    if (levels.includes(p)) return p
  }
  return 'unknown'
}

function extractConditionFlags(conditions: PatientConditions): string[] {
  const flags: string[] = []
  if (conditions.hasChf) flags.push('CHF')
  if (conditions.hasHypertension) flags.push('HTN')
  if (conditions.hasDiabetes) flags.push('DM')
  if (conditions.hasStrokeTia) flags.push('Stroke/TIA')
  if (conditions.hasVascularDisease) flags.push('Vascular')
  if (conditions.hasAtrialFibrillation) flags.push('AFib')
  return flags
}

const DEFAULT_CONDITIONS: PatientConditions = {
  hasChf: false, hasHypertension: false, hasDiabetes: false,
  hasStrokeTia: false, hasVascularDisease: false, hasAtrialFibrillation: false,
  conditions: [],
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatientBriefing(): UsePatientBriefingResult {
  const { session } = useAuth()
  const [data, setData] = useState<BriefingData | null>(null)
  const [tier1Loading, setTier1Loading] = useState(true)
  const [tier2Loading, setTier2Loading] = useState(true)  // starts true — Tier 2 is pending
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)

  // ── Cache refs ──────────────────────────────────────────────────────────
  const demoCache = useRef<CacheEntry<{ age: string; gender: string }> | null>(null)
  const conditionsCache = useRef<CacheEntry<PatientConditions> | null>(null)
  const vitalsCache = useRef<CacheEntry<VitalSignGroup[]> | null>(null)
  const practNameCache = useRef<CacheEntry<string> | null>(null)
  const medsCache = useRef<CacheEntry<MedicationSummary[]> | null>(null)
  const allergiesCache = useRef<CacheEntry<AllergySummary[]> | null>(null)
  const labsCache = useRef<CacheEntry<LabGroup[]> | null>(null)
  const aiCache = useRef<CacheEntry<ClinicalAnalysisResult> | null>(null)
  // Track which tier-2 data version the AI was computed from
  const aiDataVersion = useRef(0)
  const dataVersion = useRef(0)

  // ── TIER 1: fast critical path ──────────────────────────────────────────

  const fetchTier1 = useCallback(async (): Promise<{
    vitals: VitalsSnapshot
    vitalGroups: VitalSignGroup[]
    riskScores: RiskScores
    maxSeverity: PatientClinicalData['maxSeverity']
    conditionFlags: string[]
    hasVitals: boolean
    practitionerName: string
  } | null> => {
    const token = session?.accessToken
    const patientId = session?.patientId
    const practId = session?.practitionerId
    if (!token || !patientId) return null

    // Determine what needs re-fetching
    const needDemo = !isFresh(demoCache.current, STALE_DEMOGRAPHICS)
    const needConditions = !isFresh(conditionsCache.current, STALE_CONDITIONS)
    const needVitals = !isFresh(vitalsCache.current, STALE_VITALS)
    const needPract = !isFresh(practNameCache.current, Infinity)

    // Only fetch stale data
    const [practResult, vitalsResult, conditionsResult, demoResult] = await Promise.allSettled([
      needPract && practId
        ? getPractitioner(practId, token).then(p => getPractitionerDisplayName(p))
        : Promise.resolve(practNameCache.current?.data ?? 'Unknown Practitioner'),
      needVitals
        ? getVitalSigns(patientId, token)
        : Promise.resolve(vitalsCache.current!.data),
      needConditions
        ? getPatientConditions(patientId, token)
        : Promise.resolve(conditionsCache.current!.data),
      needDemo
        ? getPatientDemographics(patientId, token)
        : Promise.resolve(demoCache.current!.data),
    ])

    if (!mountedRef.current) return null

    const now = Date.now()

    const practName = practResult.status === 'fulfilled'
      ? practResult.value
      : 'Practitioner'
    practNameCache.current = { data: practName, fetchedAt: now }

    const vitalGroups = vitalsResult.status === 'fulfilled' ? vitalsResult.value : (vitalsCache.current?.data ?? [])
    if (vitalsResult.status === 'fulfilled') vitalsCache.current = { data: vitalGroups, fetchedAt: now }

    const conditions = conditionsResult.status === 'fulfilled' ? conditionsResult.value : (conditionsCache.current?.data ?? DEFAULT_CONDITIONS)
    if (conditionsResult.status === 'fulfilled') conditionsCache.current = { data: conditions, fetchedAt: now }

    const demographics = demoResult.status === 'fulfilled' ? demoResult.value : (demoCache.current?.data ?? { age: '?', gender: 'unknown' })
    if (demoResult.status === 'fulfilled') demoCache.current = { data: demographics, fetchedAt: now }

    const vitals = extractVitalsSnapshot(vitalGroups)
    const riskScores = computeRiskScores(vitals, demographics, conditions)
    const maxSeverity = resolveMaxSeverity(riskScores)
    const conditionFlags = extractConditionFlags(conditions)
    const hasVitals = vitalGroups.some(g => g.readings.length > 0)

    return { vitals, vitalGroups, riskScores, maxSeverity, conditionFlags, hasVitals, practitionerName: practName }
  }, [session])

  // ── TIER 2: background AI fuel + analysis ───────────────────────────────

  const fetchTier2 = useCallback(async (tier1VitalGroups: VitalSignGroup[], tier1Conditions: PatientConditions) => {
    const token = session?.accessToken
    const patientId = session?.patientId
    if (!token || !patientId) return

    setTier2Loading(true)
    dataVersion.current++
    const currentVersion = dataVersion.current

    try {
      // Fetch only stale Tier 2 resources
      const needMeds = !isFresh(medsCache.current, STALE_MEDS_ALLERGY)
      const needAllergies = !isFresh(allergiesCache.current, STALE_MEDS_ALLERGY)
      const needLabs = !isFresh(labsCache.current, STALE_LABS)

      const [medsResult, allergiesResult, labsResult] = await Promise.allSettled([
        needMeds ? getPatientMedications(patientId, token) : Promise.resolve(medsCache.current!.data),
        needAllergies ? getPatientAllergies(patientId, token) : Promise.resolve(allergiesCache.current!.data),
        needLabs ? getPatientLabs(patientId, token) : Promise.resolve(labsCache.current!.data),
      ])

      if (!mountedRef.current || currentVersion !== dataVersion.current) return

      const now = Date.now()
      const errors: string[] = []

      const medications = medsResult.status === 'fulfilled' ? medsResult.value : (medsCache.current?.data ?? [])
      if (medsResult.status === 'fulfilled' && needMeds) medsCache.current = { data: medications, fetchedAt: now }
      if (medsResult.status === 'rejected') errors.push(`Medications: ${String(medsResult.reason)}`)

      const allergies = allergiesResult.status === 'fulfilled' ? allergiesResult.value : (allergiesCache.current?.data ?? [])
      if (allergiesResult.status === 'fulfilled' && needAllergies) allergiesCache.current = { data: allergies, fetchedAt: now }
      if (allergiesResult.status === 'rejected') errors.push(`Allergies: ${String(allergiesResult.reason)}`)

      const labs = labsResult.status === 'fulfilled' ? labsResult.value : (labsCache.current?.data ?? [])
      if (labsResult.status === 'fulfilled' && needLabs) labsCache.current = { data: labs, fetchedAt: now }
      if (labsResult.status === 'rejected') errors.push(`Labs: ${String(labsResult.reason)}`)

      // Build comprehensive summary for AI
      let populatedCategories = 0
      if (tier1VitalGroups.length > 0) populatedCategories++
      if (tier1Conditions.conditions.length > 0) populatedCategories++
      if (medications.length > 0) populatedCategories++
      if (allergies.length > 0) populatedCategories++
      if (labs.length > 0) populatedCategories++

      const summary: PatientClinicalSummary = {
        vitals: tier1VitalGroups,
        conditions: tier1Conditions,
        medications,
        allergies,
        labs,
        meta: { fetchedAt: new Date(now).toISOString(), errors, populatedCategories },
      }

      // ── FAST: render local lab trends immediately (no AI needed) ───
      const localTrends = analyzeLabTrendsLocally(summary)
      setData(prev => prev ? {
        ...prev,
        labTrends: localTrends,
        summaryMeta: summary.meta,
        clinicalSummary: summary,
      } : prev)

      // ── ASYNC: run AI analysis for insight cards ──────────────────
      let analysis: ClinicalAnalysisResult
      if (aiCache.current && aiDataVersion.current === currentVersion) {
        analysis = aiCache.current.data
      } else {
        analysis = await analyzeClinicalData(summary)
        if (!mountedRef.current || currentVersion !== dataVersion.current) return
        aiCache.current = { data: analysis, fetchedAt: Date.now() }
        aiDataVersion.current = currentVersion
      }

      setData(prev => prev ? {
        ...prev,
        insights: analysis.insights,
        labTrends: analysis.labTrends.length > 0 ? analysis.labTrends : localTrends,
        allClear: analysis.allClear,
        aiError: analysis.error,
        tokenUsage: analysis.tokenUsage,
        summaryMeta: summary.meta,
        clinicalSummary: summary,
      } : prev)
    } catch (err) {
      if (!mountedRef.current) return
      setData(prev => prev ? {
        ...prev,
        aiError: err instanceof Error ? err.message : 'Analysis failed',
      } : prev)
    } finally {
      if (mountedRef.current) setTier2Loading(false)
    }
  }, [session])

  // ── Orchestrator: runs both tiers ─────────────────────────────────────

  const loadAll = useCallback(async () => {
    setError(null)
    setTier1Loading(true)

    try {
      const tier1 = await fetchTier1()
      if (!tier1 || !mountedRef.current) return

      // Render Tier 1 immediately
      setData(prev => ({
        // Preserve existing Tier 2 data while Tier 1 refreshes
        insights: prev?.insights ?? [],
        labTrends: prev?.labTrends ?? [],
        allClear: prev?.allClear ?? false,  // never claim "all clear" before AI runs
        aiError: prev?.aiError ?? null,
        tokenUsage: prev?.tokenUsage ?? null,
        summaryMeta: prev?.summaryMeta ?? null,
        clinicalSummary: prev?.clinicalSummary ?? null,
        // Tier 1 fresh
        ...tier1,
      }))
      setTier1Loading(false)

      // Fire Tier 2 in background (non-blocking for UI)
      void fetchTier2(
        vitalsCache.current?.data ?? [],
        conditionsCache.current?.data ?? DEFAULT_CONDITIONS,
      )
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load clinical data')
      setTier1Loading(false)
    }
  }, [fetchTier1, fetchTier2])

  // ── Mount: initial load + 5-min polling ─────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    void loadAll()

    pollRef.current = setInterval(() => {
      void loadAll()
    }, 5 * 60_000)

    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadAll])

  // ── Public methods ──────────────────────────────────────────────────────

  /** Lightweight: re-fetch vitals only, recompute risk scores from cache */
  const refreshVitals = useCallback(async () => {
    const token = session?.accessToken
    const patientId = session?.patientId
    if (!token || !patientId) return

    // Invalidate vitals cache so it re-fetches
    vitalsCache.current = null

    try {
      const vitalGroups = await getVitalSigns(patientId, token)
      if (!mountedRef.current) return

      const now = Date.now()
      vitalsCache.current = { data: vitalGroups, fetchedAt: now }

      const demographics = demoCache.current?.data ?? { age: '?', gender: 'unknown' }
      const conditions = conditionsCache.current?.data ?? DEFAULT_CONDITIONS

      const vitals = extractVitalsSnapshot(vitalGroups)
      const riskScores = computeRiskScores(vitals, demographics, conditions)
      const maxSeverity = resolveMaxSeverity(riskScores)
      const conditionFlags = extractConditionFlags(conditions)
      const hasVitals = vitalGroups.some(g => g.readings.length > 0)

      setData(prev => prev ? {
        ...prev,
        vitals, vitalGroups, riskScores, maxSeverity, conditionFlags, hasVitals,
      } : prev)

      // Invalidate AI cache since underlying data changed
      aiCache.current = null
    } catch (err) {
      console.error('[refreshVitals] failed:', err)
    }
  }, [session])

  /** Re-run Tier 2 fetch + AI analysis */
  const reanalyze = useCallback(async () => {
    // Invalidate Tier 2 caches
    medsCache.current = null
    allergiesCache.current = null
    labsCache.current = null
    aiCache.current = null

    await fetchTier2(
      vitalsCache.current?.data ?? [],
      conditionsCache.current?.data ?? DEFAULT_CONDITIONS,
    )
  }, [fetchTier2])

  return { data, tier1Loading, tier2Loading, error, refreshVitals, reanalyze, refreshAll: loadAll }
}
