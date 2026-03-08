/**
 * usePatientDashboard — React hook for the single-patient clinical dashboard.
 *
 * Orchestrates:
 * 1. Practitioner identity resolution
 * 2. In-context patient vitals fetch + risk score computation
 * 3. Condition detection for risk calculators
 *
 * Returns everything the Dashboard needs to render a rich single-patient view.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getPractitioner, getPractitionerDisplayName } from '../services/fhir/practitioner'
import { fhirFetch } from '../services/fhir/client'
import { getVitalSigns, type VitalSignGroup } from '../services/fhir/observations'
import { getPatientConditions, type PatientConditions } from '../services/fhir/conditions'
import { calculateNEWS2 } from '../utils/risk-scores/news2'
import { calculateQSofa } from '../utils/risk-scores/qsofa'
import { calculateASCVD } from '../utils/risk-scores/ascvd'
import { calculateCHA2DS2VASc } from '../utils/risk-scores/cha2ds2vasc'
import type {
  PatientClinicalData,
  VitalsSnapshot,
  RiskScores,
} from '../types/app'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePatientDashboardResult {
  /** Practitioner display name */
  practitionerName: string
  /** Clinical data for the in-context patient */
  patientData: PatientClinicalData | null
  /** Global loading state */
  isLoading: boolean
  /** Error if initial load failed entirely */
  error: string | null
  /** Re-fetch all data (practitioner, demographics, conditions, vitals) */
  refetch: () => void
  /** Lightweight refresh: re-fetches only vitals & recomputes risk scores using cached demographics/conditions */
  refreshVitals: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calculate age in years from FHIR birthDate string (YYYY-MM-DD) */
function ageFromBirthDate(birthDate: string | undefined): string {
  if (!birthDate) return '?'
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return '?'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return String(age)
}

/** Fetch minimal Patient demographics (gender, birthDate) */
async function getPatientDemographics(
  patientId: string,
  token: string,
): Promise<{ age: string; gender: string }> {
  const patient = await fhirFetch<{ gender?: string; birthDate?: string }>(
    `Patient/${patientId}`,
    token,
  )
  return {
    age: ageFromBirthDate(patient.birthDate),
    gender: (patient.gender ?? 'unknown').toLowerCase(),
  }
}

function extractVitalsSnapshot(groups: VitalSignGroup[]): VitalsSnapshot {
  const find = (type: string) => groups.find(g => g.type === type)

  const bpGroup = find('bloodPressure')
  const bpReading = bpGroup?.readings[0]

  // Extract numeric systolic from BP display value like "120/80"
  let systolicBp: number | null = null
  if (bpReading?.displayValue) {
    const parts = bpReading.displayValue.split('/')
    const sys = Number(parts[0])
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
  conditions: {
    hasChf: boolean
    hasHypertension: boolean
    hasDiabetes: boolean
    hasStrokeTia: boolean
    hasVascularDisease: boolean
  },
): RiskScores {
  const ageNum = patient.age ? parseInt(patient.age, 10) : null
  const sex = patient.gender === 'male' || patient.gender === 'female' ? patient.gender : null

  const news2 = calculateNEWS2({
    respiratoryRate: vitals.respiratoryRate,
    spo2: vitals.spo2,
    supplementalO2: null,
    temperature: vitals.temperature,
    systolicBp: vitals.systolicBp,
    heartRate: vitals.heartRate,
    consciousness: null,
  })

  const qsofa = calculateQSofa({
    respiratoryRate: vitals.respiratoryRate,
    systolicBp: vitals.systolicBp,
    gcs: null,
  })

  const ascvd = calculateASCVD({
    age: ageNum,
    sex,
    race: null,
    totalCholesterol: null,
    hdlCholesterol: null,
    systolicBp: vitals.systolicBp,
    onBpTreatment: conditions.hasHypertension ? true : null,
    hasDiabetes: conditions.hasDiabetes,
    isSmoker: null,
  })

  const cha2ds2vasc = calculateCHA2DS2VASc({
    age: ageNum,
    sex,
    hasChf: conditions.hasChf,
    hasHypertension: conditions.hasHypertension,
    hasDiabetes: conditions.hasDiabetes,
    hasStrokeTia: conditions.hasStrokeTia,
    hasVascularDisease: conditions.hasVascularDisease,
  })

  return { news2, qsofa, ascvd, cha2ds2vasc }
}

function resolveMaxSeverity(scores: RiskScores): PatientClinicalData['maxSeverity'] {
  const levels: PatientClinicalData['maxSeverity'][] = []

  if (scores.news2) {
    const n = scores.news2.level
    if (n === 'high') levels.push('critical')
    else if (n === 'medium') levels.push('high')
    else if (n === 'low-medium') levels.push('moderate')
    else levels.push('low')
  }

  if (scores.qsofa) {
    levels.push(scores.qsofa.sepsisRisk ? 'critical' : 'low')
  }

  if (scores.ascvd) {
    const a = scores.ascvd.level
    if (a === 'high') levels.push('high')
    else if (a === 'intermediate') levels.push('moderate')
    else levels.push('low')
  }

  if (scores.cha2ds2vasc) {
    const c = scores.cha2ds2vasc.riskLevel
    if (c === 'high') levels.push('high')
    else if (c === 'moderate') levels.push('moderate')
    else levels.push('low')
  }

  if (levels.length === 0) return 'unknown'

  const priority: PatientClinicalData['maxSeverity'][] = ['critical', 'high', 'moderate', 'low']
  for (const p of priority) {
    if (levels.includes(p)) return p
  }
  return 'unknown'
}

function extractConditionFlags(conditions: {
  hasChf: boolean
  hasHypertension: boolean
  hasDiabetes: boolean
  hasStrokeTia: boolean
  hasVascularDisease: boolean
  hasAtrialFibrillation?: boolean
}): string[] {
  const flags: string[] = []
  if (conditions.hasChf) flags.push('CHF')
  if (conditions.hasHypertension) flags.push('HTN')
  if (conditions.hasDiabetes) flags.push('DM')
  if (conditions.hasStrokeTia) flags.push('Stroke/TIA')
  if (conditions.hasVascularDisease) flags.push('Vascular')
  if (conditions.hasAtrialFibrillation) flags.push('AFib')
  return flags
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

const DEFAULT_CONDITIONS: PatientConditions = {
  hasChf: false,
  hasHypertension: false,
  hasDiabetes: false,
  hasStrokeTia: false,
  hasVascularDisease: false,
  hasAtrialFibrillation: false,
  conditions: [],
}

export function usePatientDashboard(): UsePatientDashboardResult {
  const { session } = useAuth()
  const [practitionerName, setPractitionerName] = useState('Loading...')
  const [patientData, setPatientData] = useState<PatientClinicalData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const mountedRef = useRef(true)

  // Cache static data (demographics + conditions) so refreshVitals can skip re-fetching them
  const demoRef = useRef<{ age: string; gender: string }>({ age: '?', gender: 'unknown' })
  const conditionsRef = useRef<PatientConditions>(DEFAULT_CONDITIONS)

  const fetchAll = useCallback(async () => {
    const token = session?.accessToken
    const patientId = session?.patientId
    const practId = session?.practitionerId

    if (!token || !patientId) {
      setError('No session available')
      setIsLoading(false)
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      // Fire practitioner name + patient clinical data in parallel
      const [practResult, vitalsResult, conditionsResult, demoResult] = await Promise.allSettled([
        practId
          ? getPractitioner(practId, token)
              .then(p => getPractitionerDisplayName(p))
          : Promise.resolve('Unknown Practitioner'),
        getVitalSigns(patientId, token),
        getPatientConditions(patientId, token),
        getPatientDemographics(patientId, token),
      ])

      if (!mountedRef.current) return

      // Practitioner name
      if (practResult.status === 'fulfilled') {
        setPractitionerName(practResult.value)
      } else {
        setPractitionerName(practId ? `Practitioner ${practId}` : 'Unknown Practitioner')
      }

      // Clinical data
      const vitalGroups = vitalsResult.status === 'fulfilled' ? vitalsResult.value : []
      const conditions = conditionsResult.status === 'fulfilled'
        ? conditionsResult.value
        : DEFAULT_CONDITIONS

      const vitals = extractVitalsSnapshot(vitalGroups)
      const demographics = demoResult.status === 'fulfilled'
        ? demoResult.value
        : { age: '?', gender: 'unknown' }

      // Cache static data for lightweight refreshVitals calls
      demoRef.current = demographics
      conditionsRef.current = conditions

      const riskScores = computeRiskScores(vitals, demographics, conditions)
      const maxSeverity = resolveMaxSeverity(riskScores)
      const conditionFlags = extractConditionFlags(conditions)
      const hasVitals = vitalGroups.some(g => g.readings.length > 0)

      setPatientData({
        vitals,
        vitalGroups,
        riskScores,
        maxSeverity,
        conditionFlags,
        hasVitals,
        isLoading: false,
        error: vitalsResult.status === 'rejected'
          ? 'Failed to load vitals'
          : null,
      })
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load clinical data')
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [session])

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true
    void fetchAll()

    pollRef.current = setInterval(() => {
      void fetchAll()
    }, POLL_INTERVAL)

    return () => {
      mountedRef.current = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchAll])

  // ---------------------------------------------------------------------------
  // Lightweight refresh — only re-fetches vitals, recomputes risk scores
  // using cached demographics & conditions. No spinner, no wiping existing data.
  // ---------------------------------------------------------------------------

  const refreshVitals = useCallback(async () => {
    const token = session?.accessToken
    const patientId = session?.patientId
    if (!token || !patientId) return

    try {
      const vitalGroups = await getVitalSigns(patientId, token)
      if (!mountedRef.current) return

      const vitals = extractVitalsSnapshot(vitalGroups)
      const riskScores = computeRiskScores(vitals, demoRef.current, conditionsRef.current)
      const maxSeverity = resolveMaxSeverity(riskScores)
      const conditionFlags = extractConditionFlags(conditionsRef.current)
      const hasVitals = vitalGroups.some(g => g.readings.length > 0)

      setPatientData(prev => ({
        ...(prev ?? {} as PatientClinicalData),
        vitals,
        vitalGroups,
        riskScores,
        maxSeverity,
        conditionFlags,
        hasVitals,
        isLoading: false,
        error: null,
      }))
    } catch (err) {
      // Silent failure for lightweight refresh — don't overwrite existing data
      console.error('refreshVitals failed:', err)
    }
  }, [session])

  return {
    practitionerName,
    patientData,
    isLoading,
    error,
    refetch: fetchAll,
    refreshVitals,
  }
}
