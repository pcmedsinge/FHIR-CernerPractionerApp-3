/**
 * ASCVD — 10-Year Atherosclerotic Cardiovascular Disease Risk
 *
 * Implements the 2013 ACC/AHA Pooled Cohort Equations.
 * Applicable to adults aged 40-79 without known ASCVD.
 *
 * Reference: Goff DC Jr et al., Circulation 2014.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ASCVDLevel = 'low' | 'borderline' | 'intermediate' | 'high'

export interface ASCVDInput {
  /** Age in years (40-79) */
  age?: number | null
  /** Biological sex */
  sex?: 'male' | 'female' | null
  /** Race (equations differ for White vs African American) */
  race?: 'white' | 'african-american' | 'other' | null
  /** Total cholesterol (mg/dL) */
  totalCholesterol?: number | null
  /** HDL cholesterol (mg/dL) */
  hdlCholesterol?: number | null
  /** Systolic blood pressure (mmHg) */
  systolicBp?: number | null
  /** Currently on blood pressure treatment */
  onBpTreatment?: boolean | null
  /** Has diabetes */
  hasDiabetes?: boolean | null
  /** Current smoker */
  isSmoker?: boolean | null
}

export interface ASCVDResult {
  /** 10-year risk percentage */
  riskPercent: number
  /** Risk level category */
  level: ASCVDLevel
  /** Parameters that were missing */
  dataGaps: string[]
}

// ---------------------------------------------------------------------------
// Pooled Cohort Equation coefficients
// ---------------------------------------------------------------------------

interface CoefficientSet {
  lnAge: number
  lnTotalChol: number
  lnHDL: number
  lnTreatedSBP: number
  lnUntreatedSBP: number
  smoking: number
  diabetes: number
  /** Interaction terms */
  lnAge_lnTotalChol: number
  lnAge_smoking: number
  lnAge_lnAge?: number
  meanCoeffSum: number
  baselineSurvival: number
}

const WHITE_FEMALE: CoefficientSet = {
  lnAge: -29.799,
  lnTotalChol: 13.540,
  lnHDL: -13.578,
  lnTreatedSBP: 2.019,
  lnUntreatedSBP: 1.957,
  smoking: 7.574,
  diabetes: 0.661,
  lnAge_lnTotalChol: -6.461,
  lnAge_smoking: -4.430,
  lnAge_lnAge: 4.884,
  meanCoeffSum: -29.1817,
  baselineSurvival: 0.9665,
}

const AA_FEMALE: CoefficientSet = {
  lnAge: 17.114,
  lnTotalChol: 0.940,
  lnHDL: -18.920,
  lnTreatedSBP: 29.291,
  lnUntreatedSBP: 27.820,
  smoking: 0.691,
  diabetes: 0.874,
  lnAge_lnTotalChol: 0,
  lnAge_smoking: 0,
  meanCoeffSum: 86.6081,
  baselineSurvival: 0.9533,
}

const WHITE_MALE: CoefficientSet = {
  lnAge: 12.344,
  lnTotalChol: 11.853,
  lnHDL: -7.990,
  lnTreatedSBP: 1.797,
  lnUntreatedSBP: 1.764,
  smoking: 7.837,
  diabetes: 0.658,
  lnAge_lnTotalChol: -2.664,
  lnAge_smoking: -1.795,
  meanCoeffSum: 61.1816,
  baselineSurvival: 0.9144,
}

const AA_MALE: CoefficientSet = {
  lnAge: 2.469,
  lnTotalChol: 0.302,
  lnHDL: -0.307,
  lnTreatedSBP: 1.916,
  lnUntreatedSBP: 1.809,
  smoking: 0.549,
  diabetes: 0.645,
  lnAge_lnTotalChol: 0,
  lnAge_smoking: 0,
  meanCoeffSum: 19.5425,
  baselineSurvival: 0.8954,
}

function getCoefficients(sex: 'male' | 'female', race: 'white' | 'african-american' | 'other'): CoefficientSet {
  const isAA = race === 'african-american'
  if (sex === 'female') return isAA ? AA_FEMALE : WHITE_FEMALE
  return isAA ? AA_MALE : WHITE_MALE
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function resolveLevel(pct: number): ASCVDLevel {
  if (pct >= 20) return 'high'
  if (pct >= 7.5) return 'intermediate'
  if (pct >= 5) return 'borderline'
  return 'low'
}

/**
 * Calculate 10-year ASCVD risk.
 * Returns null if required inputs (age, sex, totalCholesterol, HDL,
 * systolicBp) are all missing.
 */
export function calculateASCVD(input: ASCVDInput): ASCVDResult | null {
  const dataGaps: string[] = []

  if (input.age == null) dataGaps.push('Age')
  if (input.sex == null) dataGaps.push('Sex')
  if (input.race == null) dataGaps.push('Race')
  if (input.totalCholesterol == null) dataGaps.push('Total Cholesterol')
  if (input.hdlCholesterol == null) dataGaps.push('HDL Cholesterol')
  if (input.systolicBp == null) dataGaps.push('Systolic BP')
  if (input.onBpTreatment == null) dataGaps.push('BP Treatment Status')
  if (input.hasDiabetes == null) dataGaps.push('Diabetes Status')
  if (input.isSmoker == null) dataGaps.push('Smoking Status')

  // Minimum required: age, sex, totalCholesterol, HDL, systolicBp
  if (input.age == null || input.sex == null || input.totalCholesterol == null ||
      input.hdlCholesterol == null || input.systolicBp == null) {
    // Can't compute — return null if the core 5 are missing
    return null
  }

  const age = Math.max(40, Math.min(79, input.age))
  const sex = input.sex
  const race = input.race ?? 'white' // default to white equations if unknown
  const totalChol = input.totalCholesterol
  const hdl = input.hdlCholesterol
  const sbp = input.systolicBp
  const onBpTreat = input.onBpTreatment ?? false
  const diabetes = input.hasDiabetes ?? false
  const smoker = input.isSmoker ?? false

  const c = getCoefficients(sex, race)
  const lnAge = Math.log(age)
  const lnTC = Math.log(totalChol)
  const lnHDL = Math.log(hdl)
  const lnSBP = Math.log(sbp)

  let sum = 0
  sum += c.lnAge * lnAge
  sum += c.lnTotalChol * lnTC
  sum += c.lnHDL * lnHDL
  sum += (onBpTreat ? c.lnTreatedSBP : c.lnUntreatedSBP) * lnSBP
  sum += smoker ? c.smoking : 0
  sum += diabetes ? c.diabetes : 0
  sum += c.lnAge_lnTotalChol * lnAge * lnTC
  sum += c.lnAge_smoking * lnAge * (smoker ? 1 : 0)
  if (c.lnAge_lnAge) sum += c.lnAge_lnAge * lnAge * lnAge

  const risk = 1 - Math.pow(c.baselineSurvival, Math.exp(sum - c.meanCoeffSum))
  const riskPercent = Math.round(risk * 1000) / 10 // 1 decimal

  return {
    riskPercent: Math.max(0, Math.min(100, riskPercent)),
    level: resolveLevel(riskPercent),
    dataGaps,
  }
}
