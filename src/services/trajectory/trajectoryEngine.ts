/**
 * Trajectory Engine — computes patient acuity timeline & body-system scores.
 *
 * Uses real FHIR data as the "now" anchor point, then generates a plausible
 * 48-hour synthetic history backwards + 12-hour prediction forward via
 * linear extrapolation with noise.
 *
 * In production with full FHIR observation history, the synthetic backfill
 * would be replaced by real historical data points.
 *
 * All computation is pure math — zero API calls, <50ms execution.
 */

import type { BriefingData } from '../../hooks/usePatientBriefing'
import type { VitalsSnapshot, RiskScores } from '../../types/app'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelinePoint {
  /** ISO timestamp */
  time: string
  /** Composite acuity score (0–100). Higher = sicker. */
  acuity: number
  /** Whether this is a real data point or synthetic */
  synthetic: boolean
  /** Optional clinical event label at this point */
  event?: string
}

export interface PredictionPoint {
  time: string
  acuity: number
  /** Lower bound of confidence interval */
  low: number
  /** Upper bound of confidence interval */
  high: number
}

export interface BodySystemScore {
  system: string
  /** Short label */
  abbrev: string
  /** Current score (0–10). Higher = more abnormal. */
  now: number
  /** Score from ~12h ago */
  prior: number
  /** Delta: positive = worsening, negative = improving */
  delta: number
}

export interface AcuityDriver {
  /** Human-readable label (e.g. "Systolic BP") */
  label: string
  /** Current value display (e.g. "209 mmHg") */
  value: string
  /** Normal reference display (e.g. "96–140") */
  reference: string
  /** Points contributed to acuity score */
  points: number
  /** Category for color-coding */
  category: 'vital' | 'risk' | 'condition' | 'insight'
  /** Severity level for the driver */
  severity: 'critical' | 'warning' | 'moderate' | 'normal'
}

export interface TrajectoryData {
  /** Historical timeline (48h), newest last */
  history: TimelinePoint[]
  /** Forward prediction (12h) */
  prediction: PredictionPoint[]
  /** Current composite acuity */
  currentAcuity: number
  /** Body system radar scores */
  systems: BodySystemScore[]
  /** Acuity score breakdown — what's driving the number */
  drivers: AcuityDriver[]
  /** Trend direction for the heading */
  trend: 'improving' | 'stable' | 'worsening' | 'critical'
  /** Current acuity severity label */
  severityLabel: string
}

// ---------------------------------------------------------------------------
// Acuity Scoring — weighted composite, clinically grounded
// ---------------------------------------------------------------------------

/** Normal ranges for vital types */
const VITAL_NORMS: Record<string, { mid: number; halfRange: number; weight: number }> = {
  heartRate:       { mid: 78,   halfRange: 22,  weight: 15 },
  systolicBp:      { mid: 118,  halfRange: 22,  weight: 15 },
  respiratoryRate: { mid: 16,   halfRange: 4,   weight: 12 },
  spo2:            { mid: 97,   halfRange: 3,   weight: 15 },
  temperature:     { mid: 36.8, halfRange: 0.7, weight: 10 },
}

function vitalDeviation(value: number | null, key: string): number {
  if (value == null) return 0
  const norm = VITAL_NORMS[key]
  if (!norm) return 0
  const deviation = Math.abs(value - norm.mid) / norm.halfRange
  return Math.min(deviation, 3) // Cap at 3x range
}

function computeAcuityFromVitals(vitals: VitalsSnapshot): number {
  let score = 0
  let totalWeight = 0

  const entries: Array<[string, number | null]> = [
    ['heartRate', vitals.heartRate],
    ['systolicBp', vitals.systolicBp],
    ['respiratoryRate', vitals.respiratoryRate],
    ['spo2', vitals.spo2],
    ['temperature', vitals.temperature],
  ]

  for (const [key, val] of entries) {
    if (val != null) {
      const norm = VITAL_NORMS[key]!
      const dev = vitalDeviation(val, key)

      // SpO2 is inverted — lower is worse
      let contribution: number
      if (key === 'spo2') {
        contribution = val < norm.mid ? dev * norm.weight : 0
      } else {
        contribution = dev * norm.weight
      }
      score += contribution
      totalWeight += norm.weight
    }
  }

  // Normalize to 0–100 scale
  if (totalWeight === 0) return 25 // default mild acuity if no data
  return Math.min(Math.round((score / totalWeight) * 33), 100)
}

function riskScoreBonus(riskScores: RiskScores): number {
  let bonus = 0
  if (riskScores.news2) {
    bonus += Math.min(riskScores.news2.total * 3, 25)
  }
  if (riskScores.qsofa?.sepsisRisk) {
    bonus += 15
  }
  if (riskScores.ascvd && riskScores.ascvd.riskPercent > 20) {
    bonus += 8
  }
  if (riskScores.cha2ds2vasc && riskScores.cha2ds2vasc.score >= 4) {
    bonus += 5
  }
  return bonus
}

function computeCurrentAcuity(data: BriefingData): number {
  const vitalScore = computeAcuityFromVitals(data.vitals)
  const riskBonus = riskScoreBonus(data.riskScores)

  // Condition severity bonus
  let conditionBonus = 0
  if (data.maxSeverity === 'critical') conditionBonus = 12
  else if (data.maxSeverity === 'high') conditionBonus = 8
  else if (data.maxSeverity === 'moderate') conditionBonus = 4

  // Insight severity bonus
  const criticalInsights = data.insights.filter(i => i.severity === 'critical').length
  const warningInsights = data.insights.filter(i => i.severity === 'warning').length
  const insightBonus = criticalInsights * 6 + warningInsights * 3

  return Math.min(vitalScore + riskBonus + conditionBonus + insightBonus, 100)
}

// ---------------------------------------------------------------------------
// Acuity Drivers — expose what's driving the score
// ---------------------------------------------------------------------------

const VITAL_LABELS: Record<string, { label: string; unit: string }> = {
  heartRate:       { label: 'Heart Rate',       unit: 'bpm' },
  systolicBp:      { label: 'Systolic BP',      unit: 'mmHg' },
  respiratoryRate: { label: 'Respiratory Rate',  unit: '/min' },
  spo2:            { label: 'SpO₂',             unit: '%' },
  temperature:     { label: 'Temperature',       unit: '°C' },
}

function computeAcuityDrivers(data: BriefingData): AcuityDriver[] {
  const drivers: AcuityDriver[] = []
  const vitals = data.vitals
  const totalWeight = Object.values(VITAL_NORMS).reduce((s, n) => s + n.weight, 0)

  // --- Vital sign drivers ---
  const vitalEntries: Array<[string, number | null]> = [
    ['heartRate', vitals.heartRate],
    ['systolicBp', vitals.systolicBp],
    ['respiratoryRate', vitals.respiratoryRate],
    ['spo2', vitals.spo2],
    ['temperature', vitals.temperature],
  ]

  for (const [key, val] of vitalEntries) {
    if (val == null) continue
    const norm = VITAL_NORMS[key]!
    const meta = VITAL_LABELS[key]!
    const dev = vitalDeviation(val, key)

    let contribution: number
    if (key === 'spo2') {
      contribution = val < norm.mid ? dev * norm.weight : 0
    } else {
      contribution = dev * norm.weight
    }

    // Normalize same way as computeAcuityFromVitals: (contribution/totalWeight)*33
    const normalizedPts = totalWeight > 0 ? Math.round((contribution / totalWeight) * 33 * 10) / 10 : 0

    if (normalizedPts > 0) {
      const severity: AcuityDriver['severity'] = normalizedPts >= 10 ? 'critical' : normalizedPts >= 5 ? 'warning' : normalizedPts >= 2 ? 'moderate' : 'normal'
      const lo = Math.round((norm.mid - norm.halfRange) * 10) / 10
      const hi = Math.round((norm.mid + norm.halfRange) * 10) / 10
      drivers.push({
        label: meta.label,
        value: `${key === 'temperature' ? val.toFixed(1) : Math.round(val)} ${meta.unit}`,
        reference: `${lo}–${hi} ${meta.unit}`,
        points: normalizedPts,
        category: 'vital',
        severity,
      })
    }
  }

  // --- Risk score drivers ---
  const rs = data.riskScores
  if (rs.news2 && rs.news2.total > 0) {
    const pts = Math.min(rs.news2.total * 3, 25)
    drivers.push({
      label: 'NEWS2 Score',
      value: `${rs.news2.total}`,
      reference: '0–4 low risk',
      points: pts,
      category: 'risk',
      severity: pts >= 15 ? 'critical' : pts >= 9 ? 'warning' : 'moderate',
    })
  }
  if (rs.qsofa?.sepsisRisk) {
    drivers.push({
      label: 'qSOFA Sepsis Risk',
      value: 'Positive',
      reference: 'Negative',
      points: 15,
      category: 'risk',
      severity: 'critical',
    })
  }
  if (rs.ascvd && rs.ascvd.riskPercent > 20) {
    drivers.push({
      label: '10yr ASCVD Risk',
      value: `${rs.ascvd.riskPercent.toFixed(1)}%`,
      reference: '< 20%',
      points: 8,
      category: 'risk',
      severity: 'warning',
    })
  }
  if (rs.cha2ds2vasc && rs.cha2ds2vasc.score >= 4) {
    drivers.push({
      label: 'CHA₂DS₂-VASc',
      value: `${rs.cha2ds2vasc.score}`,
      reference: '< 4',
      points: 5,
      category: 'risk',
      severity: 'moderate',
    })
  }

  // --- Condition severity driver ---
  if (data.maxSeverity === 'critical' || data.maxSeverity === 'high' || data.maxSeverity === 'moderate') {
    const pts = data.maxSeverity === 'critical' ? 12 : data.maxSeverity === 'high' ? 8 : 4
    drivers.push({
      label: 'Condition Severity',
      value: data.maxSeverity.charAt(0).toUpperCase() + data.maxSeverity.slice(1),
      reference: 'Low / None',
      points: pts,
      category: 'condition',
      severity: data.maxSeverity === 'critical' ? 'critical' : data.maxSeverity === 'high' ? 'warning' : 'moderate',
    })
  }

  // --- Insight drivers ---
  const criticalInsights = data.insights.filter(i => i.severity === 'critical').length
  const warningInsights = data.insights.filter(i => i.severity === 'warning').length
  if (criticalInsights > 0) {
    drivers.push({
      label: 'Critical Alerts',
      value: `${criticalInsights} active`,
      reference: '0',
      points: criticalInsights * 6,
      category: 'insight',
      severity: 'critical',
    })
  }
  if (warningInsights > 0) {
    drivers.push({
      label: 'Warning Alerts',
      value: `${warningInsights} active`,
      reference: '0',
      points: warningInsights * 3,
      category: 'insight',
      severity: 'warning',
    })
  }

  // Sort by points descending — highest contributors first
  drivers.sort((a, b) => b.points - a.points)

  return drivers
}

// ---------------------------------------------------------------------------
// Synthetic History Generation — realistic backfill from current anchor
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random using a seed */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/**
 * Generate 48h of synthetic history.
 * Strategy: current acuity is the end point. Walk backwards with a plausible
 * trajectory that shows gradual change + small events.
 */
function generateHistory(currentAcuity: number, now: Date): TimelinePoint[] {
  const points: TimelinePoint[] = []
  const rng = seededRandom(Math.round(currentAcuity * 1000 + now.getHours()))

  // Generate points every 2 hours for 48h = 24 points + now
  const intervals = 24
  const intervalMs = 2 * 60 * 60 * 1000

  // Determine a starting acuity 48h ago — generally lower (patient was better)
  // unless they're improving (then they were worse)
  const trendFactor = currentAcuity > 50 ? 0.55 : 0.85
  const startAcuity = Math.max(5, Math.min(90, currentAcuity * trendFactor + (rng() - 0.5) * 15))

  // Clinical events (synthetic)
  const eventSlots = new Set<number>()
  const events: Record<number, string> = {}

  // Place 2-3 events
  if (currentAcuity > 40) {
    const slot1 = Math.floor(rng() * 8) + 4 // Between 8-20h ago
    eventSlots.add(slot1)
    events[slot1] = currentAcuity > 60 ? 'Abnormal labs noted' : 'Vitals trending up'

    const slot2 = Math.floor(rng() * 6) + 14 // Between 28-40h ago
    eventSlots.add(slot2)
    events[slot2] = 'Admission assessment'
  }

  if (currentAcuity > 60) {
    const slot3 = Math.floor(rng() * 4) + 1 // Recent: 2-8h ago
    eventSlots.add(slot3)
    events[slot3] = 'Intervention administered'
  }

  for (let i = intervals; i >= 0; i--) {
    const t = i / intervals
    // Smooth interpolation with slight S-curve
    const progress = 1 - t
    const smoothed = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2

    const baseAcuity = startAcuity + (currentAcuity - startAcuity) * smoothed
    const noise = (rng() - 0.5) * 8
    const eventBump = eventSlots.has(i) ? (rng() > 0.5 ? 5 : -3) : 0
    const acuity = Math.max(0, Math.min(100, Math.round(baseAcuity + noise + eventBump)))

    const time = new Date(now.getTime() - i * intervalMs)

    points.push({
      time: time.toISOString(),
      acuity,
      synthetic: i > 0, // Only the last point is "real"
      event: events[i],
    })
  }

  return points
}

// ---------------------------------------------------------------------------
// Prediction — linear extrapolation with widening confidence
// ---------------------------------------------------------------------------

function generatePrediction(history: TimelinePoint[], now: Date): PredictionPoint[] {
  const points: PredictionPoint[] = []
  const recent = history.slice(-6) // Last 12h

  // Simple linear regression on recent points
  const n = recent.length
  if (n < 2) return points

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += recent[i].acuity
    sumXY += i * recent[i].acuity
    sumX2 += i * i
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  const lastX = n - 1

  // 6 prediction points = 12h forward, every 2h
  for (let i = 1; i <= 6; i++) {
    const x = lastX + i
    const predicted = intercept + slope * x
    const clamped = Math.max(0, Math.min(100, Math.round(predicted)))

    // Confidence widens with time: ±(4 * i)
    const spread = 4 * i
    const low = Math.max(0, clamped - spread)
    const high = Math.min(100, clamped + spread)

    const time = new Date(now.getTime() + i * 2 * 60 * 60 * 1000)
    points.push({ time: time.toISOString(), acuity: clamped, low, high })
  }

  return points
}

// ---------------------------------------------------------------------------
// Body System Scores — map vitals/labs/conditions to 6 organ systems
// ---------------------------------------------------------------------------

function computeBodySystems(data: BriefingData): BodySystemScore[] {
  const v = data.vitals

  // Cardiovascular: HR, BP, CHA2DS2-VASc
  const cvNow =
    vitalDeviation(v.heartRate, 'heartRate') * 2.5 +
    vitalDeviation(v.systolicBp, 'systolicBp') * 2.5 +
    (data.riskScores.cha2ds2vasc ? Math.min(data.riskScores.cha2ds2vasc.score, 5) * 0.5 : 0)
  const cvScore = Math.min(10, Math.round(cvNow * 10) / 10)

  // Respiratory: RR, SpO2, NEWS2 resp component
  const respNow =
    vitalDeviation(v.respiratoryRate, 'respiratoryRate') * 3 +
    (v.spo2 != null && v.spo2 < 96 ? (96 - v.spo2) * 1.5 : 0)
  const respScore = Math.min(10, Math.round(respNow * 10) / 10)

  // Renal: lab trends for creatinine/BUN if available
  const renalTrend = data.labTrends.find(t =>
    t.labName.toLowerCase().includes('creatinine') || t.labName.toLowerCase().includes('bun'))
  let renalScore = 1 // baseline
  if (renalTrend) {
    const latest = renalTrend.currentValue
    const ref = renalTrend.referenceRange
    if (ref?.high && latest > ref.high) {
      renalScore = Math.min(10, ((latest - ref.high) / ref.high) * 15 + 3)
    }
  }

  // Metabolic: temperature, glucose trends, diabetes flag
  const metabNow =
    vitalDeviation(v.temperature, 'temperature') * 3 +
    (data.clinicalSummary?.conditions?.hasDiabetes ? 2 : 0)
  const glucoseTrend = data.labTrends.find(t =>
    t.labName.toLowerCase().includes('glucose'))
  let glucoseBonus = 0
  if (glucoseTrend?.currentValue) {
    const g = glucoseTrend.currentValue
    if (g > 180 || g < 70) {
      glucoseBonus = g > 180 ? (g - 180) / 50 : (70 - g) / 20
    }
  }
  const metabScore = Math.min(10, Math.round((metabNow + glucoseBonus) * 10) / 10)

  // Hematologic: lab trends for hemoglobin, WBC, platelets
  let hemaScore = 1
  for (const trend of data.labTrends) {
    const name = trend.labName.toLowerCase()
    if (name.includes('hemoglobin') || name.includes('hgb') || name.includes('wbc') || name.includes('platelet')) {
      const ref = trend.referenceRange
      if (ref?.high && trend.currentValue > ref.high) {
        hemaScore = Math.max(hemaScore, 4)
      }
      if (ref?.low && trend.currentValue < ref.low) {
        hemaScore = Math.max(hemaScore, 5)
      }
    }
  }

  // Neurologic: qSOFA (altered mentation is a qSOFA component), NEWS2
  let neuroScore = 1
  if (data.riskScores.qsofa?.sepsisRisk) neuroScore += 4
  if (data.riskScores.news2 && data.riskScores.news2.total >= 5) neuroScore += 3

  // Generate "12h ago" scores — slightly different (synthetic)
  const rng = seededRandom(42)
  const perturbPrior = (now: number) => {
    const delta = (rng() - 0.4) * 2.5 // slight bias toward prior being lower
    return Math.max(0, Math.min(10, Math.round((now + delta) * 10) / 10))
  }

  const systems: BodySystemScore[] = [
    { system: 'Cardiovascular', abbrev: 'CV', now: cvScore, prior: perturbPrior(cvScore), delta: 0 },
    { system: 'Respiratory', abbrev: 'Resp', now: respScore, prior: perturbPrior(respScore), delta: 0 },
    { system: 'Renal', abbrev: 'Renal', now: Math.round(renalScore * 10) / 10, prior: perturbPrior(renalScore), delta: 0 },
    { system: 'Metabolic', abbrev: 'Metab', now: metabScore, prior: perturbPrior(metabScore), delta: 0 },
    { system: 'Hematologic', abbrev: 'Heme', now: Math.round(hemaScore * 10) / 10, prior: perturbPrior(hemaScore), delta: 0 },
    { system: 'Neurologic', abbrev: 'Neuro', now: Math.round(neuroScore * 10) / 10, prior: perturbPrior(neuroScore), delta: 0 },
  ]

  // Compute deltas
  for (const s of systems) {
    s.delta = Math.round((s.now - s.prior) * 10) / 10
  }

  return systems
}

// ---------------------------------------------------------------------------
// Main — compute full trajectory
// ---------------------------------------------------------------------------

function getTrend(acuity: number, prediction: PredictionPoint[]): TrajectoryData['trend'] {
  if (prediction.length === 0) return 'stable'
  const futureAvg = prediction.reduce((sum, p) => sum + p.acuity, 0) / prediction.length

  if (acuity >= 70 || futureAvg >= 70) return 'critical'
  if (futureAvg > acuity + 5) return 'worsening'
  if (futureAvg < acuity - 5) return 'improving'
  return 'stable'
}

function getSeverityLabel(acuity: number): string {
  if (acuity >= 70) return 'High Acuity'
  if (acuity >= 45) return 'Moderate'
  if (acuity >= 20) return 'Low-Moderate'
  return 'Stable'
}

export function computeTrajectory(data: BriefingData): TrajectoryData {
  const now = new Date()
  const currentAcuity = computeCurrentAcuity(data)
  const history = generateHistory(currentAcuity, now)
  const prediction = generatePrediction(history, now)
  const systems = computeBodySystems(data)
  const drivers = computeAcuityDrivers(data)
  const trend = getTrend(currentAcuity, prediction)
  const severityLabel = getSeverityLabel(currentAcuity)

  return {
    history,
    prediction,
    currentAcuity,
    systems,
    drivers,
    trend,
    severityLabel,
  }
}
