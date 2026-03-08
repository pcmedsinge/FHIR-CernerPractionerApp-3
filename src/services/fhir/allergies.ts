/**
 * AllergyIntolerance FHIR service.
 *
 * Fetches active allergies/intolerances for a patient.
 * Used as input to AI clinical analysis (drug-allergy checks).
 */

import { fhirFetch } from './client'
import type { FhirAllergyIntolerance, FhirBundle } from '../../types/fhir'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllergySummary {
  id: string
  substance: string
  category: string | null
  criticality: string | null
  reactions: string[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch active allergies/intolerances for a patient.
 */
export async function getPatientAllergies(
  patientId: string,
  token: string,
): Promise<AllergySummary[]> {
  const bundle = await fhirFetch<FhirBundle<FhirAllergyIntolerance>>(
    `AllergyIntolerance?patient=${encodeURIComponent(patientId)}&clinical-status=active&_count=100`,
    token,
    { timeout: 15_000 },
  )

  return (bundle.entry ?? [])
    .map(e => e.resource)
    .filter((r): r is FhirAllergyIntolerance => r?.resourceType === 'AllergyIntolerance')
    .map(r => ({
      id: r.id ?? '',
      substance: r.code?.text
        ?? r.code?.coding?.[0]?.display
        ?? 'Unknown substance',
      category: r.category?.[0] ?? null,
      criticality: r.criticality ?? null,
      reactions: (r.reaction ?? []).flatMap(
        rx => (rx.manifestation ?? []).map(m => m.text ?? m.coding?.[0]?.display ?? ''),
      ).filter(Boolean),
    }))
}
