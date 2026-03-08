/**
 * MedicationRequest FHIR service.
 *
 * Fetches active medication requests for a patient.
 * Used as input to AI clinical analysis (drug interactions).
 */

import { fhirFetch } from './client'
import type { FhirMedicationRequest, FhirBundle } from '../../types/fhir'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MedicationSummary {
  id: string
  name: string
  dosage: string | null
  status: string
  authoredOn: string | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch active medication requests for a patient.
 * Returns a simplified list — the raw FHIR resources are not exposed to UI.
 */
export async function getPatientMedications(
  patientId: string,
  token: string,
): Promise<MedicationSummary[]> {
  const bundle = await fhirFetch<FhirBundle<FhirMedicationRequest>>(
    `MedicationRequest?patient=${encodeURIComponent(patientId)}&status=active&_count=100`,
    token,
    { timeout: 15_000 },
  )

  return (bundle.entry ?? [])
    .map(e => e.resource)
    .filter((r): r is FhirMedicationRequest => r?.resourceType === 'MedicationRequest')
    .map(r => ({
      id: r.id ?? '',
      name: r.medicationCodeableConcept?.text
        ?? r.medicationCodeableConcept?.coding?.[0]?.display
        ?? r.medicationReference?.display
        ?? 'Unknown medication',
      dosage: r.dosageInstruction?.[0]?.text ?? null,
      status: r.status ?? 'unknown',
      authoredOn: r.authoredOn ?? null,
    }))
}
