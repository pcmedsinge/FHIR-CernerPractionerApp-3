/**
 * CHA₂DS₂-VASc — Stroke Risk Score for Atrial Fibrillation
 *
 * Estimates annual stroke risk in patients with non-valvular AF.
 * Score 0-9, higher = greater risk.
 *
 * Reference: Lip GY et al., Chest 2010.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CHA2DS2VAScInput {
  /** Age in years */
  age?: number | null
  /** Biological sex */
  sex?: 'male' | 'female' | null
  /** Congestive heart failure / LV dysfunction */
  hasChf?: boolean | null
  /** Hypertension */
  hasHypertension?: boolean | null
  /** Diabetes mellitus */
  hasDiabetes?: boolean | null
  /** Prior Stroke / TIA / thromboembolism */
  hasStrokeTia?: boolean | null
  /** Vascular disease (prior MI, PAD, aortic plaque) */
  hasVascularDisease?: boolean | null
}

export interface CHA2DS2VAScResult {
  /** Total score (0-9) */
  score: number
  /** Risk level description */
  riskLevel: 'low' | 'moderate' | 'high'
  /** Approximate annual stroke risk */
  annualStrokeRisk: string
  /** Breakdown of scored criteria */
  criteria: {
    chf: { present: boolean | null; points: number }
    hypertension: { present: boolean | null; points: number }
    age75: { present: boolean | null; points: number }
    diabetes: { present: boolean | null; points: number }
    strokeTia: { present: boolean | null; points: number }
    vascularDisease: { present: boolean | null; points: number }
    age65_74: { present: boolean | null; points: number }
    femaleSex: { present: boolean | null; points: number }
  }
  /** Parameters that were missing */
  dataGaps: string[]
}

// ---------------------------------------------------------------------------
// Approximate annual stroke risk by score (Lip et al., 2010)
// ---------------------------------------------------------------------------

const ANNUAL_RISK: Record<number, string> = {
  0: '0%',
  1: '1.3%',
  2: '2.2%',
  3: '3.2%',
  4: '4.0%',
  5: '6.7%',
  6: '9.8%',
  7: '9.6%',
  8: '6.7%',
  9: '15.2%',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate CHA₂DS₂-VASc score. Returns null if both age and sex are missing.
 */
export function calculateCHA2DS2VASc(input: CHA2DS2VAScInput): CHA2DS2VAScResult | null {
  const dataGaps: string[] = []
  let score = 0

  if (input.age == null) dataGaps.push('Age')
  if (input.sex == null) dataGaps.push('Sex')
  if (input.hasChf == null) dataGaps.push('CHF')
  if (input.hasHypertension == null) dataGaps.push('Hypertension')
  if (input.hasDiabetes == null) dataGaps.push('Diabetes')
  if (input.hasStrokeTia == null) dataGaps.push('Stroke/TIA history')
  if (input.hasVascularDisease == null) dataGaps.push('Vascular disease')

  // Need at least age or sex to produce any meaningful result
  if (input.age == null && input.sex == null) return null

  // C — CHF (+1)
  const chfPresent = input.hasChf ?? null
  const chfPoints = chfPresent ? 1 : 0
  score += chfPoints

  // H — Hypertension (+1)
  const htpPresent = input.hasHypertension ?? null
  const htpPoints = htpPresent ? 1 : 0
  score += htpPoints

  // A₂ — Age >= 75 (+2)
  const age75 = input.age != null ? input.age >= 75 : null
  const age75Points = age75 ? 2 : 0
  score += age75Points

  // D — Diabetes (+1)
  const dmPresent = input.hasDiabetes ?? null
  const dmPoints = dmPresent ? 1 : 0
  score += dmPoints

  // S₂ — Stroke/TIA (+2)
  const strokePresent = input.hasStrokeTia ?? null
  const strokePoints = strokePresent ? 2 : 0
  score += strokePoints

  // V — Vascular disease (+1)
  const vascPresent = input.hasVascularDisease ?? null
  const vascPoints = vascPresent ? 1 : 0
  score += vascPoints

  // A — Age 65-74 (+1, only if not already >= 75)
  const age65_74 = input.age != null ? (input.age >= 65 && input.age < 75) : null
  const age65_74Points = age65_74 ? 1 : 0
  score += age65_74Points

  // Sc — Female sex (+1)
  const isFemale = input.sex != null ? input.sex === 'female' : null
  const femalePoints = isFemale ? 1 : 0
  score += femalePoints

  // Risk level
  let riskLevel: 'low' | 'moderate' | 'high'
  if (score === 0) riskLevel = 'low'
  else if (score === 1) riskLevel = 'moderate'
  else riskLevel = 'high'

  return {
    score,
    riskLevel,
    annualStrokeRisk: ANNUAL_RISK[Math.min(score, 9)] ?? '>15%',
    criteria: {
      chf: { present: chfPresent, points: chfPoints },
      hypertension: { present: htpPresent, points: htpPoints },
      age75: { present: age75, points: age75Points },
      diabetes: { present: dmPresent, points: dmPoints },
      strokeTia: { present: strokePresent, points: strokePoints },
      vascularDisease: { present: vascPresent, points: vascPoints },
      age65_74: { present: age65_74, points: age65_74Points },
      femaleSex: { present: isFemale, points: femalePoints },
    },
    dataGaps,
  }
}
