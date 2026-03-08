import { useState, useCallback, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/Toast'
import { Modal } from '../../components/Modal'
import { createVitalSign, verifyObservation, FhirHttpError, UNSUPPORTED_CREATE_TYPES, type CreateVitalInput } from '../../services/fhir/observations'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecordVitalsProps {
  open: boolean
  onClose: () => void
  /** Called with the list of successfully POSTed inputs so the parent can do optimistic UI. */
  onSaved: (savedInputs: CreateVitalInput[]) => void
  /** Called to communicate save progress to the parent (for inline status display). */
  onSaveStatus?: (status: { text: string; type: 'saving' | 'ok' | 'fail' }) => void
  /** Debug log callback — displayed in-app since F12 is unavailable in EHR iframe */
  onDebug?: (msg: string) => void
}

interface FieldDef {
  key: string
  label: string
  units: string[]
  defaultUnit: string
  range: [number, number] // Clinical plausible range
  step: number
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

const FIELDS: FieldDef[] = [
  { key: 'systolic',        label: 'Systolic BP',       units: ['mmHg'],        defaultUnit: 'mmHg',   range: [50, 300],  step: 1 },
  { key: 'diastolic',       label: 'Diastolic BP',      units: ['mmHg'],        defaultUnit: 'mmHg',   range: [20, 200],  step: 1 },
  { key: 'heartRate',       label: 'Heart Rate',        units: ['bpm'],         defaultUnit: 'bpm',    range: [20, 300],  step: 1 },
  { key: 'temperature',     label: 'Temperature',       units: ['°C', '°F'],    defaultUnit: '°C',     range: [30, 45],   step: 0.1 },
  { key: 'respiratoryRate', label: 'Respiratory Rate',  units: ['br/min'],      defaultUnit: 'br/min', range: [4, 60],    step: 1 },
  { key: 'spo2',            label: 'SpO₂',              units: ['%'],           defaultUnit: '%',      range: [50, 100],  step: 1 },
  { key: 'height',          label: 'Height',            units: ['cm', 'in'],    defaultUnit: 'cm',     range: [20, 300],  step: 0.1 },
  { key: 'weight',          label: 'Weight',            units: ['kg', 'lb'],    defaultUnit: 'kg',     range: [0.5, 500], step: 0.1 },
]

// Ranges vary by unit
const UNIT_RANGES: Record<string, [number, number]> = {
  '°F': [86, 113],
  'in': [8, 118],
  'lb': [1, 1100],
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

function convert(value: number, fromUnit: string, toUnit: string): number {
  if (fromUnit === toUnit) return value
  if (fromUnit === '°F' && toUnit === '°C') return Math.round(((value - 32) * 5 / 9) * 10) / 10
  if (fromUnit === '°C' && toUnit === '°F') return Math.round((value * 9 / 5 + 32) * 10) / 10
  if (fromUnit === 'in' && toUnit === 'cm') return Math.round(value * 2.54 * 10) / 10
  if (fromUnit === 'cm' && toUnit === 'in') return Math.round(value / 2.54 * 10) / 10
  if (fromUnit === 'lb' && toUnit === 'kg') return Math.round(value * 0.453592 * 10) / 10
  if (fromUnit === 'kg' && toUnit === 'lb') return Math.round(value / 0.453592 * 10) / 10
  return value
}

function toStorageUnit(value: number, unit: string): { value: number; unit: string } {
  // Always store in metric (°C, cm, kg) for FHIR consistency
  if (unit === '°F') return { value: convert(value, '°F', '°C'), unit: '°C' }
  if (unit === 'in') return { value: convert(value, 'in', 'cm'), unit: 'cm' }
  if (unit === 'lb') return { value: convert(value, 'lb', 'kg'), unit: 'kg' }
  return { value, unit }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRange(field: FieldDef, unit: string): [number, number] {
  return UNIT_RANGES[unit] ?? field.range
}

function nowIsoLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecordVitals({ open, onClose, onSaved, onSaveStatus, onDebug }: RecordVitalsProps) {
  const { session } = useAuth()
  const { showToast } = useToast()

  // Field values and units
  const [values, setValues] = useState<Record<string, string>>({})
  const [units, setUnits] = useState<Record<string, string>>(() => {
    const u: Record<string, string> = {}
    for (const f of FIELDS) u[f.key] = f.defaultUnit
    return u
  })
  const [dateTime, setDateTime] = useState(nowIsoLocal)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setValues({})
    setErrors({})
    setDateTime(nowIsoLocal())
    const u: Record<string, string> = {}
    for (const f of FIELDS) u[f.key] = f.defaultUnit
    setUnits(u)
  }, [])

  function handleUnitToggle(key: string, newUnit: string) {
    const raw = values[key]
    if (raw) {
      const num = parseFloat(raw)
      if (!Number.isNaN(num)) {
        const converted = convert(num, units[key], newUnit)
        setValues(prev => ({ ...prev, [key]: String(converted) }))
      }
    }
    setUnits(prev => ({ ...prev, [key]: newUnit }))
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e })
  }

  function handleValueChange(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e })
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}

    // BP requires both or neither
    const hasSys = values.systolic?.trim()
    const hasDia = values.diastolic?.trim()
    if (hasSys && !hasDia) errs.diastolic = 'Required with systolic'
    if (!hasSys && hasDia) errs.systolic = 'Required with diastolic'

    for (const field of FIELDS) {
      const raw = values[field.key]?.trim()
      if (!raw) continue

      const num = parseFloat(raw)
      if (Number.isNaN(num)) {
        errs[field.key] = 'Must be a number'
        continue
      }

      const [min, max] = getRange(field, units[field.key])
      if (num < min || num > max) {
        errs[field.key] = `Must be ${min}–${max} ${units[field.key]}`
      }
    }

    if (!dateTime) errs.dateTime = 'Date/time required'

    return errs
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    const patientId = session?.patientId
    const accessToken = session?.accessToken
    if (!patientId || !accessToken) return

    const isoDateTime = new Date(dateTime).toISOString()
    const encounterId = session?.encounterId ?? undefined
    const practitionerId = session?.practitionerId ?? undefined

    // Debug: Log session context for diagnosing 422 errors
    console.log('[RecordVitals] Session context:', {
      patientId,
      practitionerId: practitionerId ?? 'NULL',
      encounterId: encounterId ?? 'NULL',
      fhirUser: session?.fhirUser ?? 'NULL',
      scope: session?.scope?.slice(0, 100) ?? 'NULL',
    })
    onDebug?.(`Session: patient=${patientId} practitioner=${practitionerId ?? 'NULL'} encounter=${encounterId ?? 'NULL'} fhirUser=${session?.fhirUser ?? 'NULL'}`)
    onDebug?.(`Scopes: ${session?.scope ?? 'NULL'}`)

    // Build list of observations to create
    const inputs: CreateVitalInput[] = []

    // Blood Pressure — POST as two separate Observations (Cerner rejects component-based)
    const sys = values.systolic?.trim()
    const dia = values.diastolic?.trim()
    if (sys) {
      inputs.push({ type: 'systolic', value: parseFloat(sys), unit: 'mmHg', dateTime: isoDateTime, encounterId, practitionerId })
    }
    if (dia) {
      inputs.push({ type: 'diastolic', value: parseFloat(dia), unit: 'mmHg', dateTime: isoDateTime, encounterId, practitionerId })
    }

    // All other vitals
    const singleFields: Array<{ key: string; type: CreateVitalInput['type'] }> = [
      { key: 'heartRate', type: 'heartRate' },
      { key: 'temperature', type: 'temperature' },
      { key: 'respiratoryRate', type: 'respiratoryRate' },
      { key: 'spo2', type: 'spo2' },
      { key: 'height', type: 'height' },
      { key: 'weight', type: 'weight' },
    ]

    for (const { key, type } of singleFields) {
      const raw = values[key]?.trim()
      if (!raw) continue
      const num = parseFloat(raw)
      if (Number.isNaN(num)) continue
      const stored = toStorageUnit(num, units[key])
      inputs.push({ type, value: stored.value, unit: stored.unit, dateTime: isoDateTime, encounterId, practitionerId })
    }

    if (inputs.length === 0) {
      setErrors({ _form: 'Enter at least one vital sign value.' })
      return
    }

    // ---- Optimistic-first: close modal immediately, fire POSTs in background ----
    // This avoids the long "Saving…" wait since Cerner writes are slow.
    const inputsCopy = [...inputs]
    resetForm()
    onSaved(inputsCopy)   // optimistic UI update in VitalsPanel
    onClose()
    onSaveStatus?.({ text: `Saving ${inputsCopy.length} vital(s) to Cerner…`, type: 'saving' })

    // Fire all POSTs in parallel in the background
    void (async () => {
      try {
        onDebug?.(`Posting ${inputsCopy.length} observation(s)…`)
        for (const inp of inputsCopy) {
          onDebug?.(`  → ${inp.type}: value=${inp.value} ${inp.unit} | loinc-type=${inp.type}`)
        }

        const results = await Promise.allSettled(
          inputsCopy.map(async (input) => {
            const created = await createVitalSign(patientId, accessToken, input)
            return { input, created }
          }),
        )

        let successCount = 0
        const savedIds: string[] = []
        const failedTypes: string[] = []
        const diagLines: string[] = []

        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          const input = inputsCopy[i]
          if (result.status === 'fulfilled') {
            successCount++
            const id = result.value.created?.id
            if (id) {
              savedIds.push(id)
              diagLines.push(`${input.type}: ID=${id}`)
              onDebug?.(`✅ ${input.type}: Created → Observation/${id}`)
            } else {
              diagLines.push(`${input.type}: 201 but no ID in response body`)
              onDebug?.(`⚠ ${input.type}: 201 but no ID in response`)
            }
          } else {
            const err = result.reason
            let detail = ''
            if (err instanceof FhirHttpError) {
              // Extract the most useful part of the OperationOutcome
              const rawBody = err.operationOutcome ?? ''
              detail = rawBody || err.message
              // Log the FULL raw response body to the debug panel
              onDebug?.(`❌ ${input.type}: HTTP ${err.status} — Full body: ${rawBody.slice(0, 1000)}`)
              // Try to parse out the diagnostics text from FHIR JSON
              try {
                const oo = JSON.parse(rawBody)
                const diag = oo?.issue?.[0]?.diagnostics ?? oo?.issue?.[0]?.details?.text ?? ''
                if (diag) {
                  detail = diag
                  onDebug?.(`   Parsed diagnostic: ${diag}`)
                }
              } catch { /* use raw text */ }
              failedTypes.push(`${input.type} (${err.status})`)
              // Show MORE of the error to help diagnose — 500 chars instead of 200
              diagLines.push(`${input.type}: HTTP ${err.status} — ${detail.slice(0, 500)}`)
            } else if (err instanceof Error && err.name === 'AbortError') {
              failedTypes.push(`${input.type} (timeout)`)
              diagLines.push(`${input.type}: timeout after 30s`)
            } else {
              failedTypes.push(input.type)
              diagLines.push(`${input.type}: ${String(err).slice(0, 200)}`)
            }
          }
        }

        // Show detailed result in status
        if (successCount > 0 && failedTypes.length === 0) {
          const idList = savedIds.length > 0 ? savedIds.join(', ') : 'no IDs returned'
          showToast(`✓ ${successCount} vital${successCount > 1 ? 's' : ''} saved`, 'success')
          onSaveStatus?.({ text: `✓ ${successCount} saved → ${idList}`, type: 'ok' })
        } else if (successCount > 0) {
          showToast(`${successCount} saved, ${failedTypes.length} failed`, 'info')
          onSaveStatus?.({ text: `${successCount} saved, ${failedTypes.length} failed: ${failedTypes.join('; ')}`, type: 'fail' })
        } else {
          const diagSummary = diagLines.join(' | ')
          showToast(`Failed to save vitals`, 'error')
          onSaveStatus?.({ text: `Failed: ${diagSummary}`, type: 'fail' })
        }

        // Step 2: Verify each saved observation by direct GET
        if (savedIds.length > 0) {
          onSaveStatus?.({ text: `Verifying ${savedIds.length} observation(s)…`, type: 'saving' })
          const verifyResults = await Promise.allSettled(
            savedIds.map(id => verifyObservation(id, accessToken))
          )
          const verified = verifyResults.filter(r => r.status === 'fulfilled' && r.value === true).length
          if (verified === savedIds.length) {
            onSaveStatus?.({ text: `✓ All ${verified} observations verified readable`, type: 'ok' })
          } else {
            onSaveStatus?.({
              text: `⚠ ${verified}/${savedIds.length} readable — Cerner sandbox may not persist writes`,
              type: 'fail',
            })
          }
        } else if (successCount > 0) {
          // Cerner returned 201 but no ID — cannot verify
          onSaveStatus?.({
            text: `⚠ Cerner returned 201 Created but no resource IDs — cannot verify persistence`,
            type: 'fail',
          })
        }
      } catch (outerErr) {
        // Catch-all for unexpected errors in the async block
        onSaveStatus?.({
          text: `Unexpected error: ${String(outerErr).slice(0, 200)}`,
          type: 'fail',
        })
      }
    })()
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Vital Signs" width={640}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        {/* Date/time — full width */}
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-semibold text-slate-600 leading-tight" htmlFor="rv-datetime">Date &amp; Time</label>
          <input
            id="rv-datetime"
            className="flex-1 max-w-60 px-2.5 py-[7px] border border-card-border rounded-md text-[13px] outline-none transition-[border-color] duration-150 bg-white text-slate-900 min-w-0 focus:border-accent focus:shadow-[0_0_0_2px_rgba(37,99,235,0.12)]"
            type="datetime-local"
            value={dateTime}
            onChange={e => setDateTime(e.target.value)}
          />
          {errors.dateTime && <span className="text-[11px] text-status-critical font-medium">{errors.dateTime}</span>}
        </div>

        {/* Vital sign fields — 2 column grid */}
        <div className="grid grid-cols-2 gap-x-7 gap-y-4">
          {FIELDS.map(field => {
            const unit = units[field.key]
            const [min, max] = getRange(field, unit)
            const hasError = Boolean(errors[field.key])
            const isUnsupported = UNSUPPORTED_CREATE_TYPES.has(field.key)

            return (
              <div className={`flex flex-col gap-1 ${isUnsupported ? 'opacity-55 pointer-events-none' : ''}`} key={field.key}>
                <label className="text-[12.5px] font-semibold text-slate-600 leading-tight" htmlFor={`rv-${field.key}`}>
                  {field.label}
                  {isUnsupported && (
                    <span
                      className="inline-block text-[9px] font-semibold uppercase tracking-[0.5px] text-amber-800 bg-amber-100 border border-amber-300 rounded px-[5px] py-px ml-1.5 align-middle"
                      title="This vital type cannot be created in the Cerner sandbox"
                    >
                      read-only
                    </span>
                  )}
                  {!isUnsupported && <span className="font-normal text-slate-400 text-[11px]"> ({min}–{max})</span>}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id={`rv-${field.key}`}
                    className={`flex-1 px-2.5 py-[7px] border rounded-md text-[13px] outline-none transition-[border-color] duration-150 bg-white text-slate-900 min-w-0 ${
                      hasError
                        ? 'border-status-critical focus:shadow-[0_0_0_2px_rgba(220,38,38,0.12)]'
                        : 'border-card-border focus:border-accent focus:shadow-[0_0_0_2px_rgba(37,99,235,0.12)]'
                    }`}
                    type="number"
                    step={field.step}
                    min={min}
                    max={max}
                    placeholder={isUnsupported ? 'Sandbox limitation' : `e.g. ${min}`}
                    value={values[field.key] ?? ''}
                    onChange={e => handleValueChange(field.key, e.target.value)}
                    disabled={isUnsupported}
                  />
                  {field.units.length > 1 ? (
                    <div className="flex border border-card-border rounded-md overflow-hidden shrink-0">
                      {field.units.map((u, idx) => (
                        <button
                          key={u}
                          type="button"
                          className={`border-none px-2 py-1 text-[11px] font-semibold cursor-pointer transition-[background,color] duration-[120ms] ${
                            idx > 0 ? 'border-l border-card-border' : ''
                          } ${
                            u === unit
                              ? 'bg-accent text-white'
                              : 'bg-white text-slate-400 hover:bg-slate-100'
                          }`}
                          onClick={() => handleUnitToggle(field.key, u)}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium min-w-9 shrink-0">{unit}</span>
                  )}
                </div>
                {hasError && <span className="text-[11px] text-status-critical font-medium">{errors[field.key]}</span>}
              </div>
            )
          })}
        </div>

        {errors._form && (
          <div className="text-xs text-status-critical text-center p-1.5 bg-red-50 rounded-md">{errors._form}</div>
        )}

        <div className="flex justify-end gap-2.5 pt-2.5 border-t border-card-border">
          <button
            type="button"
            className="border-none rounded-lg px-[18px] py-2 text-[13px] font-semibold cursor-pointer transition-[background] duration-150 bg-slate-100 text-slate-600 hover:enabled:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => { resetForm(); onClose() }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="border-none rounded-lg px-[18px] py-2 text-[13px] font-semibold cursor-pointer transition-[background] duration-150 bg-accent text-white hover:enabled:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Save Vitals
          </button>
        </div>
      </form>
    </Modal>
  )
}
