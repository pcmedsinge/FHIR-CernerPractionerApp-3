/**
 * qSOFA — Quick Sequential Organ Failure Assessment
 *
 * Bedside screening tool for sepsis risk. Score 0-3.
 * A score >= 2 suggests possible sepsis and warrants further assessment.
 *
 * Reference: Singer et al., JAMA 2016; Seymour et al., JAMA 2016.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QSofaInput {
  /** Respiratory rate (breaths/min) — positive if >= 22 */
  respiratoryRate?: number | null
  /** Systolic blood pressure (mmHg) — positive if <= 100 */
  systolicBp?: number | null
  /** Glasgow Coma Scale score — positive if < 15 (altered mentation) */
  gcs?: number | null
}

export interface QSofaResult {
  /** Total qSOFA score (0-3) */
  score: number
  /** True if score >= 2 (sepsis likely) */
  sepsisRisk: boolean
  /** Which criteria were met */
  criteria: {
    highRespiratoryRate: boolean | null
    lowSystolicBp: boolean | null
    alteredMentation: boolean | null
  }
  /** Parameters that were missing */
  dataGaps: string[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate qSOFA score. Returns null if no parameters are available.
 * Partial scoring is supported — missing parameters are treated as
 * "not assessable" (neither positive nor negative).
 */
export function calculateQSofa(input: QSofaInput): QSofaResult | null {
  const dataGaps: string[] = []
  let score = 0
  let available = 0

  // Respiratory rate >= 22
  let highRR: boolean | null = null
  if (input.respiratoryRate != null) {
    highRR = input.respiratoryRate >= 22
    if (highRR) score++
    available++
  } else {
    dataGaps.push('Respiratory Rate')
  }

  // Systolic BP <= 100
  let lowSBP: boolean | null = null
  if (input.systolicBp != null) {
    lowSBP = input.systolicBp <= 100
    if (lowSBP) score++
    available++
  } else {
    dataGaps.push('Systolic BP')
  }

  // Altered mentation (GCS < 15)
  let alteredMent: boolean | null = null
  if (input.gcs != null) {
    alteredMent = input.gcs < 15
    if (alteredMent) score++
    available++
  } else {
    dataGaps.push('GCS / Consciousness')
  }

  if (available === 0) return null

  return {
    score,
    sepsisRisk: score >= 2,
    criteria: {
      highRespiratoryRate: highRR,
      lowSystolicBp: lowSBP,
      alteredMentation: alteredMent,
    },
    dataGaps,
  }
}
