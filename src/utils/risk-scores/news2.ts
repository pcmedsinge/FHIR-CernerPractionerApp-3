/**
 * NEWS2 — National Early Warning Score 2
 *
 * Calculates a composite score from 7 physiological parameters to detect
 * acute deterioration. Score 0-20, mapped to 4 clinical risk levels.
 *
 * Reference: Royal College of Physicians, 2017.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NEWS2Level = 'low' | 'low-medium' | 'medium' | 'high'

export interface NEWS2Input {
  /** Respiratory rate (breaths/min) */
  respiratoryRate?: number | null
  /** SpO2 percentage */
  spo2?: number | null
  /** Whether patient is on supplemental oxygen */
  supplementalO2?: boolean | null
  /** Body temperature (°C) */
  temperature?: number | null
  /** Systolic blood pressure (mmHg) */
  systolicBp?: number | null
  /** Heart rate (bpm) */
  heartRate?: number | null
  /** Level of consciousness: A=Alert, V=Voice, P=Pain, U=Unresponsive */
  consciousness?: 'A' | 'V' | 'P' | 'U' | null
}

export interface NEWS2ParameterScore {
  name: string
  value: string
  score: number
}

export interface NEWS2Result {
  /** Total NEWS2 score (0-20) */
  total: number
  /** Clinical risk level */
  level: NEWS2Level
  /** Individual parameter scores */
  parameters: NEWS2ParameterScore[]
  /** Parameters that were missing (could not be scored) */
  dataGaps: string[]
}

// ---------------------------------------------------------------------------
// Scoring tables (NEWS2 specification)
// ---------------------------------------------------------------------------

function scoreRespiratoryRate(rr: number): number {
  if (rr <= 8) return 3
  if (rr <= 11) return 1
  if (rr <= 20) return 0
  if (rr <= 24) return 2
  return 3 // >= 25
}

/**
 * SpO2 scoring depends on whether the patient is on Scale 1 (no known
 * hypercapnic respiratory failure) or Scale 2. For this implementation
 * we default to Scale 1 as Scale 2 requires clinical judgment.
 */
function scoreSpo2Scale1(spo2: number): number {
  if (spo2 <= 91) return 3
  if (spo2 <= 93) return 2
  if (spo2 <= 95) return 1
  return 0 // >= 96
}

function scoreSupplementalO2(onO2: boolean): number {
  return onO2 ? 2 : 0
}

function scoreTemperature(temp: number): number {
  if (temp <= 35.0) return 3
  if (temp <= 36.0) return 1
  if (temp <= 38.0) return 0
  if (temp <= 39.0) return 1
  return 2 // >= 39.1
}

function scoreSystolicBp(sbp: number): number {
  if (sbp <= 90) return 3
  if (sbp <= 100) return 2
  if (sbp <= 110) return 1
  if (sbp <= 219) return 0
  return 3 // >= 220
}

function scoreHeartRate(hr: number): number {
  if (hr <= 40) return 3
  if (hr <= 50) return 1
  if (hr <= 90) return 0
  if (hr <= 110) return 1
  if (hr <= 130) return 2
  return 3 // >= 131
}

function scoreConsciousness(avpu: 'A' | 'V' | 'P' | 'U'): number {
  return avpu === 'A' ? 0 : 3
}

function resolveLevel(total: number): NEWS2Level {
  if (total >= 7) return 'high'
  if (total >= 5) return 'medium'
  // NOTE: NEWS2 also defines "low-medium" when any single parameter scores 3.
  // That nuance requires checking individual params. We handle it in calculate().
  if (total >= 1) return 'low'
  return 'low'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate NEWS2 score. Returns null if not enough data is available
 * (at minimum, 3 of 7 parameters must be present).
 */
export function calculateNEWS2(input: NEWS2Input): NEWS2Result | null {
  const parameters: NEWS2ParameterScore[] = []
  const dataGaps: string[] = []
  let total = 0
  let scoredCount = 0
  let hasIndividual3 = false

  // Respiratory Rate
  if (input.respiratoryRate != null) {
    const s = scoreRespiratoryRate(input.respiratoryRate)
    parameters.push({ name: 'Respiratory Rate', value: `${input.respiratoryRate} br/min`, score: s })
    total += s
    scoredCount++
    if (s === 3) hasIndividual3 = true
  } else {
    dataGaps.push('Respiratory Rate')
  }

  // SpO2
  if (input.spo2 != null) {
    const s = scoreSpo2Scale1(input.spo2)
    parameters.push({ name: 'SpO₂', value: `${input.spo2}%`, score: s })
    total += s
    scoredCount++
    if (s === 3) hasIndividual3 = true
  } else {
    dataGaps.push('SpO₂')
  }

  // Supplemental O2
  if (input.supplementalO2 != null) {
    const s = scoreSupplementalO2(input.supplementalO2)
    parameters.push({ name: 'Supplemental O₂', value: input.supplementalO2 ? 'Yes' : 'No', score: s })
    total += s
    scoredCount++
  } else {
    dataGaps.push('Supplemental O₂')
  }

  // Temperature
  if (input.temperature != null) {
    const s = scoreTemperature(input.temperature)
    parameters.push({ name: 'Temperature', value: `${input.temperature}°C`, score: s })
    total += s
    scoredCount++
    if (s === 3) hasIndividual3 = true
  } else {
    dataGaps.push('Temperature')
  }

  // Systolic BP
  if (input.systolicBp != null) {
    const s = scoreSystolicBp(input.systolicBp)
    parameters.push({ name: 'Systolic BP', value: `${input.systolicBp} mmHg`, score: s })
    total += s
    scoredCount++
    if (s === 3) hasIndividual3 = true
  } else {
    dataGaps.push('Systolic BP')
  }

  // Heart Rate
  if (input.heartRate != null) {
    const s = scoreHeartRate(input.heartRate)
    parameters.push({ name: 'Heart Rate', value: `${input.heartRate} bpm`, score: s })
    total += s
    scoredCount++
    if (s === 3) hasIndividual3 = true
  } else {
    dataGaps.push('Heart Rate')
  }

  // Consciousness
  if (input.consciousness != null) {
    const s = scoreConsciousness(input.consciousness)
    parameters.push({ name: 'Consciousness', value: input.consciousness, score: s })
    total += s
    scoredCount++
    if (s === 3) hasIndividual3 = true
  } else {
    dataGaps.push('Consciousness (AVPU)')
  }

  // Need at least 3 of 7 parameters to produce a meaningful score
  if (scoredCount < 3) return null

  // Determine level — per NEWS2 spec, a single parameter score of 3
  // should trigger at least "low-medium" even if total is < 5
  let level = resolveLevel(total)
  if (hasIndividual3 && level === 'low') {
    level = 'low-medium'
  }

  return { total, level, parameters, dataGaps }
}
