/**
 * Encounter FHIR service.
 * Provides encounter details for context display.
 */

import { fhirFetch } from './client'
import type { FhirEncounter } from '../../types/fhir'

/**
 * Fetch a single Encounter by ID.
 */
export async function getEncounter(
  encounterId: string,
  token: string,
): Promise<FhirEncounter> {
  return fhirFetch<FhirEncounter>(`Encounter/${encodeURIComponent(encounterId)}`, token)
}
