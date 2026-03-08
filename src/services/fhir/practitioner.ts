/**
 * Practitioner FHIR service.
 *
 * Fetches practitioner details for the logged-in provider.
 */

import { fhirFetch } from './client'
import type { FhirPractitioner, HumanName } from '../../types/fhir'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDisplayName(names?: HumanName[]): string {
  const n = names?.[0]
  if (!n) return 'Unknown'
  const family = n.family?.trim() ?? ''
  const given = n.given?.join(' ').trim() ?? ''
  if (n.text?.trim()) return n.text.trim()
  return [family, given].filter(Boolean).join(', ') || 'Unknown'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the logged-in practitioner resource.
 */
export async function getPractitioner(
  practitionerId: string,
  token: string,
): Promise<FhirPractitioner> {
  return fhirFetch<FhirPractitioner>(`Practitioner/${encodeURIComponent(practitionerId)}`, token, { timeout: 5_000 })
}

/**
 * Resolve practitioner display name from the FHIR resource.
 */
export function getPractitionerDisplayName(practitioner: FhirPractitioner): string {
  return extractDisplayName(practitioner.name)
}
