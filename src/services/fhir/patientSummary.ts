/**
 * Patient Clinical Summary — multi-resource aggregation.
 *
 * Fetches ALL clinical data for a patient in parallel using Promise.allSettled.
 * Gracefully handles partial failures — if one resource type fails the rest
 * still return. This data feeds the AI analysis engine; it's never shown
 * directly to the practitioner (no data duplication with EHR).
 */

import { getVitalSigns, type VitalSignGroup } from './observations'
import { getPatientConditions, type PatientConditions } from './conditions'
import { getPatientMedications, type MedicationSummary } from './medications'
import { getPatientAllergies, type AllergySummary } from './allergies'
import { getPatientLabs, type LabGroup } from './labs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientClinicalSummary {
  /** Recent vital sign groups */
  vitals: VitalSignGroup[]
  /** Active conditions with risk flags */
  conditions: PatientConditions
  /** Active medications */
  medications: MedicationSummary[]
  /** Active allergies / intolerances */
  allergies: AllergySummary[]
  /** Lab results grouped by test name */
  labs: LabGroup[]

  /** Metadata about what succeeded / failed */
  meta: {
    fetchedAt: string
    errors: string[]
    /** How many resource categories had data */
    populatedCategories: number
  }
}

// ---------------------------------------------------------------------------
// Default empty state
// ---------------------------------------------------------------------------

const EMPTY_CONDITIONS: PatientConditions = {
  hasChf: false,
  hasHypertension: false,
  hasDiabetes: false,
  hasStrokeTia: false,
  hasVascularDisease: false,
  hasAtrialFibrillation: false,
  conditions: [],
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a comprehensive clinical summary for a patient.
 * All resource types are fetched in parallel. Partial failures are reported
 * in `meta.errors` but don't block the rest of the results.
 */
export async function getComprehensiveSummary(
  patientId: string,
  token: string,
): Promise<PatientClinicalSummary> {
  const [
    vitalsResult,
    conditionsResult,
    medsResult,
    allergiesResult,
    labsResult,
  ] = await Promise.allSettled([
    getVitalSigns(patientId, token),
    getPatientConditions(patientId, token),
    getPatientMedications(patientId, token),
    getPatientAllergies(patientId, token),
    getPatientLabs(patientId, token),
  ])

  const errors: string[] = []

  const vitals = vitalsResult.status === 'fulfilled' ? vitalsResult.value : []
  if (vitalsResult.status === 'rejected') errors.push(`Vitals: ${String(vitalsResult.reason)}`)

  const conditions = conditionsResult.status === 'fulfilled' ? conditionsResult.value : EMPTY_CONDITIONS
  if (conditionsResult.status === 'rejected') errors.push(`Conditions: ${String(conditionsResult.reason)}`)

  const medications = medsResult.status === 'fulfilled' ? medsResult.value : []
  if (medsResult.status === 'rejected') errors.push(`Medications: ${String(medsResult.reason)}`)

  const allergies = allergiesResult.status === 'fulfilled' ? allergiesResult.value : []
  if (allergiesResult.status === 'rejected') errors.push(`Allergies: ${String(allergiesResult.reason)}`)

  const labs = labsResult.status === 'fulfilled' ? labsResult.value : []
  if (labsResult.status === 'rejected') errors.push(`Labs: ${String(labsResult.reason)}`)

  let populatedCategories = 0
  if (vitals.length > 0) populatedCategories++
  if (conditions.conditions.length > 0) populatedCategories++
  if (medications.length > 0) populatedCategories++
  if (allergies.length > 0) populatedCategories++
  if (labs.length > 0) populatedCategories++

  return {
    vitals,
    conditions,
    medications,
    allergies,
    labs,
    meta: {
      fetchedAt: new Date().toISOString(),
      errors,
      populatedCategories,
    },
  }
}
