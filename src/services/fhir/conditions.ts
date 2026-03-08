/**
 * Conditions FHIR service.
 *
 * Fetches active/resolved conditions for a patient.
 * Used by risk score calculators (ASCVD, CHA₂DS₂-VASc).
 */

import { fhirFetch } from './client'
import type { FhirCondition, FhirBundle } from '../../types/fhir'

// ---------------------------------------------------------------------------
// SNOMED CT codes for conditions used in risk calculators
// ---------------------------------------------------------------------------

/** Conditions we look for in risk score calculations */
const CONDITION_SNOMEDS: Record<string, string[]> = {
  // Congestive heart failure
  chf: ['42343007', '84114007', '88805009'],
  // Hypertension
  hypertension: ['38341003', '59621000', '73410007'],
  // Diabetes mellitus (type 1 + type 2)
  diabetes: ['73211009', '44054006', '46635009', '190331003'],
  // Stroke / TIA
  strokeTia: ['230690007', '266257000', '230691006', '195189003'],
  // Vascular disease (MI, PAD, aortic plaque)
  vascularDisease: ['22298006', '399211009', '840580004', '128053003'],
  // Atrial fibrillation
  atrialFibrillation: ['49436004', '5370000'],
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientConditions {
  hasChf: boolean
  hasHypertension: boolean
  hasDiabetes: boolean
  hasStrokeTia: boolean
  hasVascularDisease: boolean
  hasAtrialFibrillation: boolean
  /** All condition resources (for display) */
  conditions: FhirCondition[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch conditions for a patient and categorize them for risk scoring.
 * Uses `Condition?patient={id}&clinical-status=active,recurrence,remission`
 */
export async function getPatientConditions(
  patientId: string,
  token: string,
): Promise<PatientConditions> {
  const result: PatientConditions = {
    hasChf: false,
    hasHypertension: false,
    hasDiabetes: false,
    hasStrokeTia: false,
    hasVascularDisease: false,
    hasAtrialFibrillation: false,
    conditions: [],
  }

  try {
    const bundle = await fhirFetch<FhirBundle<FhirCondition>>(
      `Condition?patient=${encodeURIComponent(patientId)}&clinical-status=active,recurrence,remission&_count=100`,
      token,
      { timeout: 15_000 },
    )

    const conditions = (bundle.entry ?? [])
      .map(e => e.resource)
      .filter((r): r is FhirCondition => r?.resourceType === 'Condition')

    result.conditions = conditions

    for (const cond of conditions) {
      const codes = (cond.code?.coding ?? []).map(c => c.code ?? '')
      const text = (cond.code?.text ?? '').toLowerCase()

      // Check each risk category
      if (matchesCodes(codes, text, CONDITION_SNOMEDS.chf, ['heart failure', 'chf'])) {
        result.hasChf = true
      }
      if (matchesCodes(codes, text, CONDITION_SNOMEDS.hypertension, ['hypertension', 'htn', 'high blood pressure'])) {
        result.hasHypertension = true
      }
      if (matchesCodes(codes, text, CONDITION_SNOMEDS.diabetes, ['diabetes', 'dm type', 'dm2', 'dm1'])) {
        result.hasDiabetes = true
      }
      if (matchesCodes(codes, text, CONDITION_SNOMEDS.strokeTia, ['stroke', 'tia', 'cerebrovascular', 'cva'])) {
        result.hasStrokeTia = true
      }
      if (matchesCodes(codes, text, CONDITION_SNOMEDS.vascularDisease, ['myocardial infarction', 'mi', 'pad', 'peripheral arterial', 'aortic'])) {
        result.hasVascularDisease = true
      }
      if (matchesCodes(codes, text, CONDITION_SNOMEDS.atrialFibrillation, ['atrial fibrillation', 'afib', 'a-fib', 'a.fib'])) {
        result.hasAtrialFibrillation = true
      }
    }
  } catch (err) {
    console.warn('[getPatientConditions] Failed:', err)
  }

  return result
}

/**
 * Check if condition matches by SNOMED code or text keyword.
 */
function matchesCodes(
  codes: string[],
  text: string,
  snomedCodes: string[],
  keywords: string[],
): boolean {
  if (codes.some(c => snomedCodes.includes(c))) return true
  return keywords.some(kw => text.includes(kw))
}
