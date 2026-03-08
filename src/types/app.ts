/**
 * Application-level types used across features.
 */

import type { VitalSignGroup } from '../services/fhir/observations'
import type { NEWS2Result } from '../utils/risk-scores/news2'
import type { QSofaResult } from '../utils/risk-scores/qsofa'
import type { ASCVDResult } from '../utils/risk-scores/ascvd'
import type { CHA2DS2VAScResult } from '../utils/risk-scores/cha2ds2vasc'

// ---------------------------------------------------------------------------
// Vitals Snapshot — latest readings for display + risk calculations
// ---------------------------------------------------------------------------

export interface VitalsSnapshot {
  /** Latest systolic/diastolic as "120/80" or null */
  bloodPressure: string | null
  /** Latest HR value or null */
  heartRate: number | null
  /** Latest temperature or null */
  temperature: number | null
  /** Latest SpO2 or null */
  spo2: number | null
  /** Latest respiratory rate or null */
  respiratoryRate: number | null
  /** Systolic BP numeric (for risk calculations) */
  systolicBp: number | null
}

// ---------------------------------------------------------------------------
// Risk Scores
// ---------------------------------------------------------------------------

export interface RiskScores {
  news2: NEWS2Result | null
  qsofa: QSofaResult | null
  ascvd: ASCVDResult | null
  cha2ds2vasc: CHA2DS2VAScResult | null
}

// ---------------------------------------------------------------------------
// Patient Clinical Data — everything the dashboard needs for one patient
// ---------------------------------------------------------------------------

export interface PatientClinicalData {
  vitals: VitalsSnapshot
  vitalGroups: VitalSignGroup[]
  riskScores: RiskScores
  /** Highest severity level across all risk scores */
  maxSeverity: 'low' | 'moderate' | 'high' | 'critical' | 'unknown'
  /** Short condition flag labels (e.g. "HTN", "DM", "CHF") */
  conditionFlags: string[]
  /** Whether any vitals were returned (distinguishes "no data" from "error") */
  hasVitals: boolean
  /** Loading state for this patient's data */
  isLoading: boolean
  /** Error message if data fetch failed */
  error: string | null
}
