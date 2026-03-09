/**
 * Vital-signs service.
 *
 * Fetches vital signs for a patient using the shared FHIR client.
 * Initial load uses _count=50 for fast first paint.
 * On-demand load-more fetches per LOINC code.
 * createVitalSign() POSTs new Observation resources.
 */

import { fhirFetch, FhirHttpError } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VitalType =
  | 'bloodPressure'
  | 'heartRate'
  | 'temperature'
  | 'respiratoryRate'
  | 'spo2'
  | 'height'
  | 'weight'
  | 'bmi'

export interface VitalReading {
  id: string
  timestamp: string
  displayValue: string
  numericValue: number | null
  unit: string
}

export interface VitalSignGroup {
  type: VitalType
  label: string
  readings: VitalReading[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VITAL_LABELS: Record<VitalType, string> = {
  bloodPressure: 'Blood Pressure',
  heartRate: 'Heart Rate',
  temperature: 'Body Temperature',
  respiratoryRate: 'Respiratory Rate',
  spo2: 'SpO₂',
  height: 'Height',
  weight: 'Weight',
  bmi: 'BMI',
}

/** Clinical reference ranges for color coding. null = no range check. */
export const VITAL_RANGES: Record<VitalType, { low: number; high: number } | null> = {
  bloodPressure: null, // handled separately (systolic + diastolic)
  heartRate: { low: 60, high: 100 },
  temperature: { low: 36.1, high: 37.2 },
  respiratoryRate: { low: 12, high: 20 },
  spo2: { low: 95, high: 100 },
  height: null,
  weight: null,
  bmi: { low: 18.5, high: 24.9 },
}

export const BP_RANGES = {
  systolic: { low: 90, high: 120 },
  diastolic: { low: 60, high: 80 },
}

const VITAL_UNITS: Record<VitalType, string> = {
  bloodPressure: 'mmHg',
  heartRate: 'bpm',
  temperature: '°C',
  respiratoryRate: 'br/min',
  spo2: '%',
  height: 'cm',
  weight: 'kg',
  bmi: 'kg/m²',
}

const CODE_MAP: Record<VitalType, string[]> = {
  bloodPressure: ['55284-4', '85354-9', '8480-6', '8462-4', '8459-0', '8454-1', '8460-8'],
  heartRate: ['8867-4', '8893-0', '69000-8', '69001-6', '68999-2', '8890-6', '76282-3'],
  temperature: ['8310-5', '8331-1', '8328-7', '75539-7'],
  respiratoryRate: ['9279-1'],
  spo2: ['2708-6', '59408-5'],
  height: ['8302-2', '3137-7'],
  weight: ['29463-7', '3141-9'],
  bmi: ['39156-5'],
}

// Internal FHIR shapes
interface Quantity { value?: number; unit?: string }
interface Coding { code?: string }
interface ObservationComponent { code?: { coding?: Coding[] }; valueQuantity?: Quantity }

interface ObservationResource {
  resourceType?: string
  id?: string
  code?: { coding?: Coding[] }
  valueQuantity?: Quantity
  component?: ObservationComponent[]
  effectiveDateTime?: string
  issued?: string
}

interface BundleLink { relation?: string; url?: string }

interface ObservationBundle {
  entry?: Array<{ resource?: ObservationResource }>
  link?: BundleLink[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTimestamp(obs: ObservationResource): string {
  return obs.effectiveDateTime ?? obs.issued ?? new Date(0).toISOString()
}

function parseBloodPressure(obs: ObservationResource): Omit<VitalReading, 'id' | 'timestamp'> | null {
  const sys = obs.component?.find(c => c.code?.coding?.some(cd => cd.code === '8480-6'))?.valueQuantity
  const dia = obs.component?.find(c => c.code?.coding?.some(cd => cd.code === '8462-4'))?.valueQuantity
  if (typeof sys?.value !== 'number' || typeof dia?.value !== 'number') return null
  return { displayValue: `${sys.value}/${dia.value}`, numericValue: sys.value, unit: sys.unit ?? 'mmHg' }
}

function parseReading(obs: ObservationResource, type: VitalType): Omit<VitalReading, 'id' | 'timestamp'> | null {
  if (type === 'bloodPressure') {
    // First try component-based BP (55284-4 panel)
    const bpResult = parseBloodPressure(obs)
    if (bpResult) return bpResult

    // Standalone systolic or diastolic observation (8480-6 / 8462-4)
    const code = obs.code?.coding?.[0]?.code
    const v = obs.valueQuantity?.value
    if (typeof v !== 'number') return null
    if (code === '8480-6') {
      return { displayValue: `${v}/—`, numericValue: v, unit: obs.valueQuantity?.unit ?? 'mmHg' }
    }
    if (code === '8462-4') {
      return { displayValue: `—/${v}`, numericValue: null, unit: obs.valueQuantity?.unit ?? 'mmHg' }
    }
    return null
  }
  const v = obs.valueQuantity?.value
  if (typeof v !== 'number') return null
  return { displayValue: `${v}`, numericValue: v, unit: obs.valueQuantity?.unit ?? VITAL_UNITS[type] }
}

function nextLink(bundle: ObservationBundle): string | null {
  return bundle.link?.find(l => l.relation === 'next')?.url ?? null
}

async function fetchBundle(url: string, token: string, signal: AbortSignal): Promise<ObservationBundle> {
  return fhirFetch<ObservationBundle>(url, token, { signal, timeout: 30_000 })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initial fast fetch — fires 8 **parallel** per-LOINC queries, each asking
 * for only the latest N readings. This is radically faster than a single
 * `category=vital-signs&_count=50` because Cerner's FHIR index is per-code,
 * not per-category, so each narrow query resolves in 1-3 seconds vs. 15-30s.
 *
 * Returns results via an `onGroup` streaming callback so the UI can paint
 * each card as it arrives instead of waiting for all 8.
 */
export interface GetVitalSignsOptions {
  /** Called each time one vital type resolves. */
  onGroup?: (group: VitalSignGroup) => void
  signal?: AbortSignal
}

export async function getVitalSigns(
  patientId: string,
  accessToken: string,
  opts: GetVitalSignsOptions = {},
): Promise<VitalSignGroup[]> {
  const t0 = performance.now()
  const baseUrl = import.meta.env.VITE_FHIR_BASE_URL.replace(/\/$/, '')
  const LATEST_COUNT = 5

  const allGroups: VitalSignGroup[] = []

  const fetches = (Object.entries(CODE_MAP) as [VitalType, string[]][]).map(
    async ([type, loincs]) => {
      const codeParam = loincs.join(',')
      // BP needs more results because systolic + diastolic are separate resources
      const count = type === 'bloodPressure' ? LATEST_COUNT * 2 : LATEST_COUNT
      const url =
        `${baseUrl}/Observation?patient=${encodeURIComponent(patientId)}&code=${codeParam}&_sort=-date&_count=${count}`

      try {
        const t0 = performance.now()
        const bundle = await fetchBundle(url, accessToken, opts.signal ?? new AbortController().signal)
        console.log(`[Vitals] ${type}: ${bundle.entry?.length ?? 0} entries in ${(performance.now() - t0).toFixed(0)}ms`)

        const readings: VitalReading[] = []
        const seen = new Set<string>()

        for (const entry of bundle.entry ?? []) {
          const r = entry.resource
          if (r?.resourceType !== 'Observation' || !r.id || seen.has(r.id)) continue
          seen.add(r.id)

          const parsed = parseReading(r, type)
          if (!parsed) continue

          readings.push({
            id: r.id,
            timestamp: resolveTimestamp(r),
            ...parsed,
          })
        }

        readings.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

        // For BP: merge standalone systolic + diastolic into combined readings
        const finalReadings = type === 'bloodPressure' ? mergeBpReadings(readings) : readings

        const group: VitalSignGroup = { type, label: VITAL_LABELS[type], readings: finalReadings }
        allGroups.push(group)
        opts.onGroup?.(group)
      } catch (e) {
        // Individual type failures are non-fatal — the card just shows "No data"
        console.warn(`[Vitals] ❌ ${type} failed:`, e)
      }
    },
  )

  await Promise.allSettled(fetches)
  console.log(`[Vitals] All 8 types resolved in ${(performance.now() - t0).toFixed(0)}ms`)

  // Return in consistent order
  const ORDER: VitalType[] = [
    'bloodPressure', 'heartRate', 'respiratoryRate', 'spo2',
    'temperature', 'height', 'weight', 'bmi',
  ]
  allGroups.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
  return allGroups
}

/**
 * Load more readings for a **specific** vital type. Called on-demand when the
 * user expands a card and clicks "Load all readings". Fetches by LOINC code
 * with _count=100, follows up to 2 pagination links. Timeout: 30 seconds.
 */
export async function getVitalsByType(
  patientId: string,
  accessToken: string,
  type: VitalType,
): Promise<VitalReading[]> {
  const baseUrl = import.meta.env.VITE_FHIR_BASE_URL.replace(/\/$/, '')
  const codes = CODE_MAP[type]
  const codeParam = codes.join(',')
  let url: string | null =
    `${baseUrl}/Observation?patient=${encodeURIComponent(patientId)}&code=${codeParam}&_sort=-date&_count=100`

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30_000)

  const seen = new Set<string>()
  const all: ObservationResource[] = []
  let pages = 0

  try {
    while (url && pages < 2) {
      pages++
      const bundle = await fetchBundle(url, accessToken, controller.signal)

      for (const entry of bundle.entry ?? []) {
        const r = entry.resource
        if (r?.resourceType === 'Observation' && r.id && !seen.has(r.id)) {
          seen.add(r.id)
          all.push(r)
        }
      }
      url = nextLink(bundle)
    }
  } finally {
    window.clearTimeout(timeout)
  }

  // Parse into readings
  const readings: VitalReading[] = []
  for (const obs of all) {
    const parsed = parseReading(obs, type)
    if (!parsed) continue
    readings.push({
      id: obs.id ?? crypto.randomUUID(),
      timestamp: resolveTimestamp(obs),
      ...parsed,
    })
  }
  readings.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  // For BP: merge standalone systolic + diastolic readings taken at the same
  // timestamp into a single combined "120/80" reading.
  if (type === 'bloodPressure') {
    return mergeBpReadings(readings)
  }

  return readings
}

/**
 * Merge standalone systolic ("120/—") and diastolic ("—/80") readings that
 * share the same effectiveDateTime into combined "120/80" readings.
 * Component-based BP readings ("120/80" already) pass through as-is.
 */
function mergeBpReadings(readings: VitalReading[]): VitalReading[] {
  const merged: VitalReading[] = []
  const sysMap = new Map<string, VitalReading>()  // timestamp → systolic reading
  const diaMap = new Map<string, VitalReading>()  // timestamp → diastolic reading

  for (const r of readings) {
    // Already a combined reading (from component-based observation)
    if (!r.displayValue.includes('—')) {
      merged.push(r)
      continue
    }

    if (r.displayValue.startsWith('—/')) {
      // Diastolic only
      const existing = sysMap.get(r.timestamp)
      if (existing) {
        // Pair with systolic
        const diaVal = r.displayValue.replace('—/', '')
        existing.displayValue = `${existing.numericValue}/${diaVal}`
        sysMap.delete(r.timestamp)
      } else {
        diaMap.set(r.timestamp, r)
      }
    } else if (r.displayValue.endsWith('/—')) {
      // Systolic only
      const existing = diaMap.get(r.timestamp)
      if (existing) {
        // Pair with diastolic
        const diaVal = existing.displayValue.replace('—/', '')
        r.displayValue = `${r.numericValue}/${diaVal}`
        diaMap.delete(r.timestamp)
        merged.push(r)
      } else {
        sysMap.set(r.timestamp, r)
        merged.push(r) // Will be updated in-place if diastolic arrives
      }
    } else {
      merged.push(r)
    }
  }

  // Flush any unmatched diastolic readings
  for (const r of diaMap.values()) {
    merged.push(r)
  }

  merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return merged
}

/**
 * Determine color status for a vital reading.
 * Returns 'normal' | 'warning' | 'critical'
 */
export function getVitalStatus(
  type: VitalType,
  numericValue: number | null,
): 'normal' | 'warning' | 'critical' | 'unknown' {
  if (numericValue === null) return 'unknown'

  if (type === 'bloodPressure') {
    // numericValue is systolic for BP
    if (numericValue >= 180 || numericValue < 70) return 'critical'
    if (numericValue >= 140 || numericValue < 90) return 'warning'
    return 'normal'
  }

  const range = VITAL_RANGES[type]
  if (!range) return 'unknown'

  const marginLow = range.low - (range.high - range.low) * 0.3
  const marginHigh = range.high + (range.high - range.low) * 0.3

  if (numericValue < marginLow || numericValue > marginHigh) return 'critical'
  if (numericValue < range.low || numericValue > range.high) return 'warning'
  return 'normal'
}

// ---------------------------------------------------------------------------
// LOINC + UCUM maps for creating observations
// ---------------------------------------------------------------------------

// IMPORTANT: These LOINC codes must be specifically mapped in the Cerner sandbox
// for CREATE operations. Generic codes (e.g. 8310-5 Body temperature) may not work
// — use the specific "Measured" variants confirmed via diagnostic testing.
//
// Confirmed working via POST → 201:
//   8331-1 (Temperature), 3141-9 (Weight), 3137-7 (Height), 39156-5 (BMI),
//   8459-0 (Systolic), 8454-1 (Diastolic)
//
// Sandbox limitations — HR & RR return 422 regardless of code/structure.
// SpO2 works with proprietary code 703498 (not LOINC).
const LOINC_MAP: Record<Exclude<VitalType, 'bloodPressure'>, { code: string; display: string }> = {
  heartRate:       { code: '8867-4',  display: 'Heart rate' },
  temperature:     { code: '8331-1',  display: 'Temperature Oral' },
  respiratoryRate: { code: '9279-1',  display: 'Respiratory Rate' },
  spo2:            { code: '59408-5', display: 'SpO2' },
  height:          { code: '3137-7',  display: 'Height/Length Measured' },
  weight:          { code: '3141-9',  display: 'Weight Measured' },
  bmi:             { code: '39156-5', display: 'Body Mass Index Measured' },
}

/** Cerner tenant ID for proprietary code system URLs. */
const CERNER_TENANT = import.meta.env.VITE_FHIR_BASE_URL?.split('/').pop() ?? 'ec2458f2-1e24-41c8-b71b-0e701af7583d'

/**
 * Vital types that require Cerner proprietary codes instead of LOINC for create.
 * Key = VitalType | 'systolic' | 'diastolic', value = { code, display }.
 * Only types that fail with LOINC but succeed with proprietary codes.
 */
const PROPRIETARY_CREATE_MAP: Partial<Record<string, { code: string; display: string }>> = {
  spo2: { code: '703498', display: 'Oxygen Saturation' },
}

/**
 * Vital types that cannot be created in the Cerner sandbox.
 * Tested exhaustively: every LOINC code, proprietary codes (703511/703540),
 * bare-minimum payloads, different units, different categories — all HTTP 422.
 * Likely requires Provider/System persona scope (user/Observation.crus)
 * which the sandbox does not grant.
 */
export const UNSUPPORTED_CREATE_TYPES = new Set<string>(['heartRate', 'respiratoryRate'])

const UCUM_MAP: Record<string, string> = {
  'bpm': '/min',
  'br/min': '/min',
  '°C': 'Cel',
  '°F': '[degF]',
  '%': '%',
  'cm': 'cm',
  'in': '[in_i]',
  'kg': 'kg',
  'lb': '[lb_av]',
  'kg/m²': 'kg/m2',
  'mmHg': 'mm[Hg]',
}

// ---------------------------------------------------------------------------
// Create Vital Sign
// ---------------------------------------------------------------------------

export interface CreateVitalInput {
  type: VitalType | 'systolic' | 'diastolic'
  /** Single numeric value. */
  value: number
  unit: string
  dateTime: string // ISO 8601
  /** Optional encounter reference from SMART launch context */
  encounterId?: string
  /** Practitioner ID — REQUIRED by Cerner for Vital Signs creates */
  practitionerId?: string
}

/**
 * POST a new Observation to the FHIR server.
 * Blood pressure is handled as two separate Observations (systolic + diastolic)
 * because Cerner sandbox does not support Observation.component.
 * Returns the created resource (with server-assigned ID).
 */
export async function createVitalSign(
  patientId: string,
  accessToken: string,
  input: CreateVitalInput,
): Promise<ObservationResource> {
  const category = {
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs',
      display: 'Vital Signs',
    }],
    text: 'Vital Signs',
  }

  const subject = { reference: `Patient/${patientId}` }

  // Lookup LOINC — systolic/diastolic are in the map alongside regular vitals
  const allLoinc: Record<string, { code: string; display: string }> = {
    ...LOINC_MAP,
    systolic:  { code: '8459-0', display: 'Systolic Blood Pressure Sitting' },
    diastolic: { code: '8454-1', display: 'Diastolic Blood Pressure Standing' },
  }

  const loinc = allLoinc[input.type]
  if (!loinc) throw new Error(`Unknown vital type: ${input.type}`)

  // Check sandbox limitations
  if (UNSUPPORTED_CREATE_TYPES.has(input.type)) {
    throw new Error(
      `${VITAL_LABELS[input.type as VitalType] ?? input.type} cannot be created in the Cerner sandbox. ` +
      `This vital type is read-only due to unmapped LOINC codes in this environment.`
    )
  }

  // Cerner REQUIRES performer for vital-signs creates.
  // The performer must include the performerFunction extension with code 'LA'
  // (legal authenticator) when a single performer is provided.
  if (!input.practitionerId) {
    console.warn('[createVitalSign] ⚠ No practitionerId — Cerner WILL reject this vital sign.')
  }

  // Build performer with required LA (legal authenticator) extension per Cerner docs
  const performer = input.practitionerId
    ? [{
        extension: [{
          valueCodeableConcept: {
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
              code: 'LA',
              display: 'legal authenticator',
            }],
            text: 'legal authenticator',
          },
          url: 'http://hl7.org/fhir/StructureDefinition/event-performerFunction',
        }],
        reference: `Practitioner/${input.practitionerId}`,
      }]
    : undefined

  // Check if this type needs a proprietary code instead of LOINC
  const propCode = PROPRIETARY_CREATE_MAP[input.type]
  const codeBlock = propCode
    ? {
        coding: [{
          system: `https://fhir.cerner.com/${CERNER_TENANT}/codeSet/72`,
          code: propCode.code,
          display: propCode.display,
          userSelected: true,
        }],
        text: propCode.display,
      }
    : {
        coding: [{ system: 'http://loinc.org', code: loinc.code, display: loinc.display }],
        text: loinc.display,
      }

  const resource: Record<string, unknown> = {
    resourceType: 'Observation',
    status: 'final',
    category: [category],
    code: codeBlock,
    subject,
    ...(input.encounterId ? { encounter: { reference: `Encounter/${input.encounterId}` } } : {}),
    effectiveDateTime: input.dateTime,
    issued: new Date().toISOString(),
    ...(performer ? { performer } : {}),
    valueQuantity: {
      value: input.value,
      unit: input.unit,
      system: 'http://unitsofmeasure.org',
      code: UCUM_MAP[input.unit] ?? input.unit,
    },
  }

  console.log('[createVitalSign] POST payload:', JSON.stringify(resource, null, 2))
  console.log('[createVitalSign] Context:', {
    patientId,
    practitionerId: input.practitionerId ?? 'MISSING',
    encounterId: input.encounterId ?? 'MISSING',
    type: input.type,
    loinc: loinc.code,
  })

  let created: ObservationResource
  try {
    created = await fhirFetch<ObservationResource>('Observation', accessToken, {
      method: 'POST',
      body: resource,
      timeout: 30_000,
    })
  } catch (err) {
    // Log the FULL OperationOutcome for debugging — this is the key to diagnosing 422s
    if (err instanceof FhirHttpError) {
      console.error(`[createVitalSign] ❌ ${input.type} HTTP ${err.status}`)  
      console.error('[createVitalSign] Full error response body:', err.operationOutcome)
      console.error('[createVitalSign] Error message:', err.message)
    } else {
      console.error('[createVitalSign] Non-HTTP error:', err)
    }
    throw err
  }

  console.log(`[createVitalSign] ✅ Created ${input.type} → Observation/${created.id}`)

  return created
}

/**
 * Verify a newly-created Observation still exists by direct GET.
 * Returns true if readable, false if 404/error.
 */
export async function verifyObservation(
  observationId: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fhirFetch<ObservationResource>(`Observation/${observationId}`, accessToken, {
      timeout: 10_000,
    })
    console.log(`[verifyObservation] ✅ Observation/${observationId} exists, id=${res.id ?? '?'}`)
    return true
  } catch (err) {
    console.error(`[verifyObservation] ❌ Observation/${observationId} not found:`, err)
    return false
  }
}

// Re-export for consumer convenience
export { FhirHttpError } from './client'

// ---------------------------------------------------------------------------
// Diagnostic test — mirrors Cerner's official R4_OBSERVATION_CREATE example
// ---------------------------------------------------------------------------

export interface DiagnosticTestResult {
  testName: string
  success: boolean
  status?: number
  detail: string
  payload: string
}

/**
 * SEARCH-FIRST diagnostics: query existing observations to find Cerner's
 * proprietary codeSet/72 codes, then attempt creates using those codes.
 *
 * Strategy:
 *  Phase 1 — GET existing HR/SpO2/RR observations → extract proprietary codes
 *  Phase 2 — POST creates using proprietary + LOINC codes
 *  Phase 3 — POST creates with other hypotheses (display text, unit variants)
 */
export async function runCreateDiagnostics(
  patientId: string,
  practitionerId: string | null,
  encounterId: string | null,
  accessToken: string,
  onResult: (result: DiagnosticTestResult) => void,
): Promise<void> {
  const baseCategory = [{
    coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }],
    text: 'Vital Signs',
  }]

  const now = new Date().toISOString()

  function mkPerformer(pracId: string) {
    return [{
      extension: [{
        valueCodeableConcept: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'LA', display: 'legal authenticator' }],
          text: 'legal authenticator',
        },
        url: 'http://hl7.org/fhir/StructureDefinition/event-performerFunction',
      }],
      reference: `Practitioner/${pracId}`,
    }]
  }

  // =====================================================================
  // PHASE 1: Search for existing observations to extract proprietary codes
  // =====================================================================
  interface SearchResult {
    found: boolean
    proprietaryCode?: string
    proprietarySystem?: string
    proprietaryDisplay?: string
    codeText?: string
    allCodings?: unknown[]
  }

  async function searchForVital(loincCode: string, name: string): Promise<SearchResult> {
    try {
      const path = `Observation?patient=${patientId}&code=http://loinc.org|${loincCode}&_count=1&_sort=-date`
      const bundle = await fhirFetch<Record<string, unknown>>(path, accessToken, { timeout: 30_000 })
      const entries = (bundle.entry as Array<Record<string, unknown>>) ?? []
      if (entries.length === 0) {
        onResult({ testName: `SEARCH ${name}`, success: false, detail: `📋 No ${name} observations found for this patient (LOINC ${loincCode})`, payload: '' })
        return { found: false }
      }
      const resource = ((entries[0] as Record<string, unknown>).resource ?? entries[0]) as Record<string, unknown>
      const codeObj = resource?.code as Record<string, unknown>
      const codings = (codeObj?.coding as Array<Record<string, unknown>>) ?? []
      const codeText = (codeObj?.text as string) ?? ''
      let propCode: string | undefined, propSystem: string | undefined, propDisplay: string | undefined
      for (const c of codings) {
        const sys = (c.system as string) ?? ''
        if (sys.includes('codeSet/72')) {
          propCode = c.code as string
          propSystem = sys
          propDisplay = (c.display as string) ?? ''
        }
      }
      const loincCodings = codings.filter(c => (c.system as string)?.includes('loinc'))
      onResult({
        testName: `SEARCH ${name}`,
        success: true,
        detail: `📋 FOUND! text="${codeText}" | proprietary: ${propCode ? `${propCode} (${propDisplay}) @ ${propSystem}` : 'NONE'} | LOINC codes: ${loincCodings.map(c => `${c.code}(${c.display ?? ''})`).join(', ')} | Total codings: ${codings.length}`,
        payload: JSON.stringify(resource, null, 2).slice(0, 2000),
      })
      return { found: true, proprietaryCode: propCode, proprietarySystem: propSystem, proprietaryDisplay: propDisplay, codeText, allCodings: codings }
    } catch (err) {
      const errMsg = err instanceof FhirHttpError ? `HTTP ${err.status}: ${(err.operationOutcome ?? '').slice(0, 200)}` : String(err).slice(0, 200)
      onResult({ testName: `SEARCH ${name}`, success: false, detail: `⚠️ Search error: ${errMsg}`, payload: '' })
      return { found: false }
    }
  }

  const hrSearch = await searchForVital('8867-4', 'Heart Rate 8867-4')
  const rrSearch = await searchForVital('9279-1', 'Resp Rate 9279-1')
  // SpO2 703498 proprietary-only already confirmed working (201) — skip search
  void searchForVital('59408-5', 'SpO2 59408-5') // still show search result for context
  // Also search all vital-signs by category to see what types exist
  try {
    const catPath = `Observation?patient=${patientId}&category=vital-signs&_count=100&_sort=-date`
    const catBundle = await fhirFetch<Record<string, unknown>>(catPath, accessToken, { timeout: 30_000 })
    const catEntries = (catBundle.entry as Array<Record<string, unknown>>) ?? []
    // Count distinct vital code.text values
    const codeTexts = new Map<string, number>()
    for (const entry of catEntries) {
      const res = ((entry as Record<string, unknown>).resource ?? entry) as Record<string, unknown>
      const txt = ((res?.code as Record<string, unknown>)?.text as string) ?? 'unknown'
      codeTexts.set(txt, (codeTexts.get(txt) ?? 0) + 1)
    }
    const summary = Array.from(codeTexts.entries()).map(([t, n]) => `${t} (×${n})`).join(', ')
    onResult({
      testName: 'SEARCH All Vitals Summary',
      success: true,
      detail: `📋 ${catEntries.length} vital-sign observations. Types: ${summary || 'none'}`,
      payload: '',
    })
  } catch (err) {
    const errMsg = err instanceof FhirHttpError ? `HTTP ${err.status}` : String(err).slice(0, 100)
    onResult({ testName: 'SEARCH All Vitals Summary', success: false, detail: `⚠️ ${errMsg}`, payload: '' })
  }

  // =====================================================================
  // PHASE 2: Focused tests — unit matching + last hypotheses
  // =====================================================================
  // CONFIRMED: category must be exactly 1 item, must be vital-signs.
  // CONFIRMED: SpO2 prop-only 703498 → 201 (unit: '%', code: '%' MATCHED)
  // FAILED: HR prop 703511 (unit: 'bpm', code: '/min' MISMATCH) → 422
  // FAILED: RR prop 703540 (unit: 'br/min', code: '/min' MISMATCH) → 422
  // Hypothesis: proprietary code creates require unit == UCUM code exactly
  // =====================================================================
  const tests: Array<{ name: string; body: Record<string, unknown> }> = []

  const now2 = now

  // Control — temperature (known working)
  const tempBody: Record<string, unknown> = {
    resourceType: 'Observation', status: 'final', category: baseCategory,
    code: { coding: [{ system: 'http://loinc.org', code: '8331-1' }], text: 'Temperature Oral' },
    subject: { reference: `Patient/${patientId}` },
    encounter: encounterId ? { reference: `Encounter/${encounterId}` } : undefined,
    effectiveDateTime: now2, issued: now2,
    valueQuantity: { value: 36.8, unit: 'degC', system: 'http://unitsofmeasure.org', code: 'Cel' },
  }
  if (practitionerId) tempBody.performer = mkPerformer(practitionerId)
  tests.push({ name: 'CONTROL: Temp 8331-1', body: tempBody })

  // --- TEST 1: HR PROP 703511, unit='/min' (matching UCUM code) ---
  if (hrSearch.proprietaryCode && hrSearch.proprietarySystem) {
    const body: Record<string, unknown> = {
      resourceType: 'Observation', status: 'final', category: baseCategory,
      code: {
        coding: [{ system: hrSearch.proprietarySystem, code: hrSearch.proprietaryCode, display: hrSearch.proprietaryDisplay, userSelected: true }],
        text: hrSearch.codeText ?? 'Peripheral Pulse Rate',
      },
      subject: { reference: `Patient/${patientId}` },
      encounter: encounterId ? { reference: `Encounter/${encounterId}` } : undefined,
      effectiveDateTime: now2, issued: now2,
      valueQuantity: { value: 72, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    }
    if (practitionerId) body.performer = mkPerformer(practitionerId)
    tests.push({ name: `HR PROP ${hrSearch.proprietaryCode} unit=/min`, body })
  }

  // --- TEST 2: RR PROP 703540, unit='/min' (matching UCUM code) ---
  if (rrSearch.proprietaryCode && rrSearch.proprietarySystem) {
    const body: Record<string, unknown> = {
      resourceType: 'Observation', status: 'final', category: baseCategory,
      code: {
        coding: [{ system: rrSearch.proprietarySystem, code: rrSearch.proprietaryCode, display: rrSearch.proprietaryDisplay, userSelected: true }],
        text: rrSearch.codeText ?? 'Respiratory Rate',
      },
      subject: { reference: `Patient/${patientId}` },
      encounter: encounterId ? { reference: `Encounter/${encounterId}` } : undefined,
      effectiveDateTime: now2, issued: now2,
      valueQuantity: { value: 16, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    }
    if (practitionerId) body.performer = mkPerformer(practitionerId)
    tests.push({ name: `RR PROP ${rrSearch.proprietaryCode} unit=/min`, body })
  }

  // --- TEST 3: HR PROP 703511, NO system in valueQuantity (raw unit only) ---
  if (hrSearch.proprietaryCode && hrSearch.proprietarySystem) {
    const body: Record<string, unknown> = {
      resourceType: 'Observation', status: 'final', category: baseCategory,
      code: {
        coding: [{ system: hrSearch.proprietarySystem, code: hrSearch.proprietaryCode, display: hrSearch.proprietaryDisplay, userSelected: true }],
        text: hrSearch.codeText ?? 'Peripheral Pulse Rate',
      },
      subject: { reference: `Patient/${patientId}` },
      encounter: encounterId ? { reference: `Encounter/${encounterId}` } : undefined,
      effectiveDateTime: now2, issued: now2,
      valueQuantity: { value: 72, unit: 'bpm' },
    }
    if (practitionerId) body.performer = mkPerformer(practitionerId)
    tests.push({ name: `HR PROP ${hrSearch.proprietaryCode} no-UCUM-system`, body })
  }

  // --- TEST 4: HR PROP 703511, different patient (Cerner example 12457981) ---
  if (hrSearch.proprietaryCode && hrSearch.proprietarySystem) {
    const body: Record<string, unknown> = {
      resourceType: 'Observation', status: 'final', category: baseCategory,
      code: {
        coding: [{ system: hrSearch.proprietarySystem, code: hrSearch.proprietaryCode, display: hrSearch.proprietaryDisplay, userSelected: true }],
        text: hrSearch.codeText ?? 'Peripheral Pulse Rate',
      },
      subject: { reference: 'Patient/12457981' },
      encounter: { reference: 'Encounter/97845408' },
      effectiveDateTime: now2, issued: now2,
      valueQuantity: { value: 72, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    }
    if (practitionerId) body.performer = mkPerformer(practitionerId)
    tests.push({ name: `HR PROP ${hrSearch.proprietaryCode} DIFF PATIENT 12457981`, body })
  }

  // --- TEST 5: HR LOINC 8867-4 with different patient (Cerner example) ---
  {
    const body: Record<string, unknown> = {
      resourceType: 'Observation', status: 'final', category: baseCategory,
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }], text: 'Heart Rate' },
      subject: { reference: 'Patient/12457981' },
      encounter: { reference: 'Encounter/97845408' },
      effectiveDateTime: now2, issued: now2,
      valueQuantity: { value: 72, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    }
    if (practitionerId) body.performer = mkPerformer(practitionerId)
    tests.push({ name: 'HR LOINC 8867-4 DIFF PATIENT 12457981', body })
  }

  // =====================================================================
  // PHASE 3: Run all tests
  // =====================================================================
  for (const test of tests) {
    const payload = JSON.stringify(test.body, null, 2)
    try {
      const result = await fhirFetch<ObservationResource>('Observation', accessToken, {
        method: 'POST', body: test.body, timeout: 30_000,
      })
      onResult({
        testName: test.name, success: true, status: 201,
        detail: `✅ Created → Observation/${result.id ?? '(no id)'}`, payload,
      })
    } catch (err) {
      if (err instanceof FhirHttpError) {
        const rawOO = err.operationOutcome ?? ''
        let parsedDetail = ''
        try {
          const oo = JSON.parse(rawOO)
          const issues = oo?.issue ?? []
          parsedDetail = issues.map((i: Record<string, unknown>, idx: number) => {
            const sev = i.severity ?? '?'; const code = i.code ?? '?'
            const diag = i.diagnostics ?? ''; const detTxt = (i.details as Record<string, unknown>)?.text ?? ''
            return `Issue ${idx + 1}: [${sev}/${code}] ${diag || detTxt}`
          }).join(' | ')
        } catch { /* use raw */ }
        const detail = parsedDetail
          ? `${parsedDetail}\n\nFull: ${rawOO.slice(0, 500)}`
          : rawOO.slice(0, 500) || err.message
        onResult({ testName: test.name, success: false, status: err.status, detail: `❌ HTTP ${err.status} — ${detail}`, payload })
      } else {
        onResult({ testName: test.name, success: false, detail: `❌ ${String(err).slice(0, 500)}`, payload })
      }
    }
  }
}
