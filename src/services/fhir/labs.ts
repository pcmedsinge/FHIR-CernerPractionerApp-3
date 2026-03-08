/**
 * Laboratory Observation FHIR service.
 *
 * Fetches recent lab results for a patient (category=laboratory).
 * Used as input to AI trend analysis.
 */

import { fhirFetch } from './client'
import type { FhirObservation, FhirBundle } from '../../types/fhir'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabReading {
  id: string
  name: string
  loincCode: string | null
  value: number | null
  unit: string | null
  referenceRange: { low: number | null; high: number | null } | null
  timestamp: string
}

export interface LabGroup {
  name: string
  loincCode: string | null
  unit: string | null
  readings: LabReading[]
  referenceRange: { low: number | null; high: number | null } | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch recent laboratory observations, sorted newest-first.
 * Returns up to 100 results grouped by lab name.
 */
export async function getPatientLabs(
  patientId: string,
  token: string,
): Promise<LabGroup[]> {
  const bundle = await fhirFetch<FhirBundle<FhirObservation>>(
    `Observation?patient=${encodeURIComponent(patientId)}&category=laboratory&_sort=-date&_count=100`,
    token,
    { timeout: 20_000 },
  )

  const observations = (bundle.entry ?? [])
    .map(e => e.resource)
    .filter((r): r is FhirObservation => r?.resourceType === 'Observation')

  // Parse into LabReading[]
  const readings: LabReading[] = observations.map(obs => {
    const name = obs.code?.text
      ?? obs.code?.coding?.[0]?.display
      ?? 'Unknown lab'
    const loincCode = obs.code?.coding?.find(c => c.system?.includes('loinc'))?.code ?? null

    // Extract reference range if present
    let refRange: LabReading['referenceRange'] = null
    const rr = (obs as unknown as Record<string, unknown>)['referenceRange'] as
      Array<{ low?: { value?: number }; high?: { value?: number } }> | undefined
    if (rr?.[0]) {
      refRange = {
        low: rr[0].low?.value ?? null,
        high: rr[0].high?.value ?? null,
      }
    }

    return {
      id: obs.id ?? '',
      name,
      loincCode,
      value: obs.valueQuantity?.value ?? null,
      unit: obs.valueQuantity?.unit ?? null,
      referenceRange: refRange,
      timestamp: obs.effectiveDateTime ?? obs.issued ?? '',
    }
  }).filter(r => r.value != null) // Only keep readings with numeric values

  // Group by name
  const groupMap = new Map<string, LabGroup>()
  for (const r of readings) {
    const key = r.name
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        name: r.name,
        loincCode: r.loincCode,
        unit: r.unit,
        readings: [],
        referenceRange: r.referenceRange,
      })
    }
    groupMap.get(key)!.readings.push(r)
  }

  // Sort groups by name, readings already sorted by date (desc from FHIR)
  return Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}
