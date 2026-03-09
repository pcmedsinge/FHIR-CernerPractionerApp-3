/**
 * AI Clinical Analysis — the brain of Phase 3.
 *
 * Takes a PatientClinicalSummary and produces practitioner-focused insights:
 * - Drug-drug and drug-condition interactions
 * - Lab trend analysis with trajectory prediction
 * - Critical clinical alerts
 *
 * Design philosophy: "3-second scan rule"
 * - Max 3 insight cards — only what could cause harm if missed
 * - No "info" tier — if it's not yellow or red, it doesn't show
 * - Lab trends only for problematic trends heading toward danger
 * - "All Clear" when nothing urgent
 */

import { chatCompletion, isAIConfigured } from './openaiPlatform'
import type { PatientClinicalSummary } from '../fhir/patientSummary'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightSeverity = 'critical' | 'warning'

export interface ClinicalInsight {
  id: string
  severity: InsightSeverity
  /** One-line headline a practitioner can scan in 2 seconds */
  headline: string
  /** 2-3 sentence explanation (hidden by default, shown on click) */
  detail: string
  /** E.g. "AHA Guidelines 2023", "FDA Black Box Warning" */
  source: string
  /** Concrete next step: "Order creatinine recheck", "Review dosage" */
  suggestedAction: string
  /** Category for icons */
  category: 'interaction' | 'trend' | 'contraindication' | 'guideline'
}

export interface LabTrend {
  labName: string
  direction: 'rising' | 'falling' | 'stable'
  currentValue: number
  unit: string
  referenceRange: { low: number | null; high: number | null }
  /** Estimated days until crossing reference range boundary, null if stable */
  daysToThreshold: number | null
  /** Whether current value is already out of range */
  outOfRange: boolean
  /** Data points for charting (oldest first) */
  dataPoints: Array<{ date: string; value: number }>
}

export interface ClinicalAnalysisResult {
  /** Max 3 insight cards, ranked by urgency */
  insights: ClinicalInsight[]
  /** Lab trends worth flagging (only problematic ones) */
  labTrends: LabTrend[]
  /** True if nothing urgent was found */
  allClear: boolean
  /** Token usage for the AI request */
  tokenUsage: { prompt: number; completion: number; total: number } | null
  /** Any errors during analysis */
  error: string | null
}

// ---------------------------------------------------------------------------
// System prompt — instructs AI to be selective and practitioner-focused
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a clinical decision support assistant for healthcare providers.
You will receive FHIR-sourced patient data. Your job is to find ONLY the most critical
actionable items — things that could cause harm if the practitioner doesn't see them.

STRICT RULES:
1. Return AT MOST 3 insights. If there are fewer critical/warning items, return fewer.
2. Only "critical" or "warning" severity — no informational items.
3. "critical" = immediate patient safety concern (dangerous interaction, value about to cross life-threatening threshold)
4. "warning" = should be addressed this visit (borderline values, guideline deviation, dose review needed)
5. Each insight must have a concrete suggested action the practitioner can take in 30 seconds.
6. Cite specific clinical guidelines (AHA, ACC, KDIGO, FDA, etc.) when applicable.
7. Never make definitive diagnoses — use "consider", "evaluate", "review".
8. Keep headlines under 80 characters.
9. If nothing is clinically urgent, return an empty insights array.

For lab trends:
1. Only flag labs with a clear problematic trajectory (approaching critical threshold) or already out of range.
2. Estimate days to threshold based on the trend if 3+ data points exist.
3. Ignore stable in-range labs entirely.

Return ONLY valid JSON matching this schema:
{
  "insights": [
    {
      "severity": "critical" | "warning",
      "headline": "string (max 80 chars)",
      "detail": "string (2-3 sentences)",
      "source": "string (guideline reference)",
      "suggestedAction": "string (concrete next step)",
      "category": "interaction" | "trend" | "contraindication" | "guideline"
    }
  ],
  "labTrends": [
    {
      "labName": "string",
      "direction": "rising" | "falling",
      "currentValue": number,
      "unit": "string",
      "referenceRange": { "low": number | null, "high": number | null },
      "daysToThreshold": number | null,
      "outOfRange": boolean
    }
  ]
}`

// ---------------------------------------------------------------------------
// Build user prompt from clinical summary
// ---------------------------------------------------------------------------

function buildUserPrompt(summary: PatientClinicalSummary): string {
  const parts: string[] = ['Patient Clinical Data:\n']

  // Vitals
  if (summary.vitals.length > 0) {
    parts.push('RECENT VITALS:')
    for (const group of summary.vitals) {
      if (group.readings.length === 0) continue
      const latest = group.readings[0]
      parts.push(`  ${group.label}: ${latest.displayValue} ${latest.unit} (${latest.timestamp})`)
    }
    parts.push('')
  }

  // Conditions
  if (summary.conditions.conditions.length > 0) {
    parts.push('ACTIVE CONDITIONS:')
    for (const c of summary.conditions.conditions) {
      const name = c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown'
      parts.push(`  - ${name}`)
    }
    parts.push('')
  }

  // Medications
  if (summary.medications.length > 0) {
    parts.push('ACTIVE MEDICATIONS:')
    for (const m of summary.medications) {
      const dosage = m.dosage ? ` (${m.dosage})` : ''
      parts.push(`  - ${m.name}${dosage}`)
    }
    parts.push('')
  }

  // Allergies
  if (summary.allergies.length > 0) {
    parts.push('ALLERGIES:')
    for (const a of summary.allergies) {
      const severity = a.criticality ? ` [${a.criticality}]` : ''
      const reactions = a.reactions.length > 0 ? ` → ${a.reactions.join(', ')}` : ''
      parts.push(`  - ${a.substance}${severity}${reactions}`)
    }
    parts.push('')
  }

  // Labs (provide data points for trend analysis)
  if (summary.labs.length > 0) {
    parts.push('RECENT LAB RESULTS (grouped, newest first):')
    for (const group of summary.labs) {
      if (group.readings.length === 0) continue
      const range = group.referenceRange
        ? ` [Ref: ${group.referenceRange.low ?? '?'}–${group.referenceRange.high ?? '?'}]`
        : ''
      parts.push(`  ${group.name} (${group.unit ?? ''})${range}:`)
      for (const r of group.readings.slice(0, 10)) { // Max 10 data points per lab
        parts.push(`    ${r.timestamp}: ${r.value}`)
      }
    }
    parts.push('')
  }

  if (parts.length <= 1) {
    parts.push('Limited clinical data available for this patient.')
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Local (non-AI) trend analysis — runs even without OpenAI key
// ---------------------------------------------------------------------------

/**
 * Generate rule-based clinical alerts from vitals data.
 * These ALWAYS run regardless of AI availability — critical safety net.
 */
function generateLocalVitalsInsights(summary: PatientClinicalSummary): ClinicalInsight[] {
  const insights: ClinicalInsight[] = []
  let idx = 0

  // Helper: get latest numeric value for a vital type
  const getLatest = (label: string): { value: number; display: string; unit: string } | null => {
    const group = summary.vitals.find(g => g.label.toLowerCase().includes(label.toLowerCase()))
    if (!group || group.readings.length === 0) return null
    const r = group.readings[0]
    const val = r.numericValue ?? (r.displayValue ? parseFloat(r.displayValue) : null)
    if (val == null || isNaN(val)) return null
    return { value: val, display: r.displayValue, unit: r.unit }
  }

  // --- Respiratory Rate ---
  const rr = getLatest('respiratory')
  if (rr) {
    if (rr.value >= 30) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'critical',
        headline: `Respiratory Rate critically elevated: ${rr.display} ${rr.unit}`,
        detail: `RR of ${rr.value} is significantly above normal range (12-20 br/min). This may indicate respiratory distress, sepsis, or metabolic acidosis. Immediate assessment required.`,
        source: 'NEWS2 Clinical Guidelines',
        suggestedAction: 'Assess breathing pattern, check ABG, evaluate for cause of tachypnea',
        category: 'guideline',
      })
    } else if (rr.value > 20) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'warning',
        headline: `Respiratory Rate elevated: ${rr.display} ${rr.unit}`,
        detail: `RR of ${rr.value} is above normal range (12-20 br/min). Monitor closely for worsening.`,
        source: 'NEWS2 Clinical Guidelines',
        suggestedAction: 'Re-check RR in 1 hour, assess respiratory effort',
        category: 'guideline',
      })
    }
  }

  // --- SpO2 ---
  const spo2 = getLatest('spo')
  if (spo2) {
    if (spo2.value < 92) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'critical',
        headline: `SpO₂ critically low: ${spo2.display}${spo2.unit}`,
        detail: `Oxygen saturation of ${spo2.value}% is below 92%. Risk of tissue hypoxia and organ damage. Supplemental oxygen and urgent evaluation required.`,
        source: 'BTS Oxygen Guidelines, NEWS2',
        suggestedAction: 'Apply supplemental O₂, target SpO₂ 94-98%, escalate if not improving',
        category: 'guideline',
      })
    } else if (spo2.value < 95) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'warning',
        headline: `SpO₂ below normal: ${spo2.display}${spo2.unit}`,
        detail: `Oxygen saturation of ${spo2.value}% is below normal range (95-100%). Monitor trend and consider supplemental oxygen.`,
        source: 'BTS Oxygen Guidelines',
        suggestedAction: 'Monitor SpO₂ continuously, assess respiratory status',
        category: 'guideline',
      })
    }
  }

  // --- Temperature ---
  const temp = getLatest('temperature')
  if (temp) {
    if (temp.value >= 40) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'critical',
        headline: `Hyperthermia: ${temp.display} ${temp.unit}`,
        detail: `Temperature of ${temp.value}°C is dangerously elevated. Risk of febrile seizures and organ damage. Consider sepsis workup and active cooling measures.`,
        source: 'Surviving Sepsis Campaign Guidelines',
        suggestedAction: 'Blood cultures, start empiric antibiotics if sepsis suspected, active cooling',
        category: 'guideline',
      })
    } else if (temp.value > 37.2) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'warning',
        headline: `Fever: ${temp.display} ${temp.unit}`,
        detail: `Temperature of ${temp.value}°C is above normal (36.1-37.2°C). Investigate source of fever.`,
        source: 'Clinical Practice Guidelines',
        suggestedAction: 'Assess for infection source, consider antipyretics if symptomatic',
        category: 'guideline',
      })
    } else if (temp.value < 35) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'critical',
        headline: `Hypothermia: ${temp.display} ${temp.unit}`,
        detail: `Temperature of ${temp.value}°C indicates hypothermia. Risk of cardiac arrhythmias and coagulopathy.`,
        source: 'Clinical Practice Guidelines',
        suggestedAction: 'Active rewarming, continuous cardiac monitoring, check coagulation',
        category: 'guideline',
      })
    }
  }

  // --- Heart Rate ---
  const hr = getLatest('heart')
  if (hr) {
    if (hr.value >= 130 || hr.value < 40) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'critical',
        headline: hr.value >= 130 ? `Severe tachycardia: ${hr.display} ${hr.unit}` : `Severe bradycardia: ${hr.display} ${hr.unit}`,
        detail: hr.value >= 130
          ? `Heart rate of ${hr.value} bpm far exceeds normal (60-100). Assess for hemodynamic compromise, arrhythmia, or underlying cause.`
          : `Heart rate of ${hr.value} bpm is critically low. Assess for heart block, medication effect, or vagal cause.`,
        source: 'AHA/ACC Guidelines',
        suggestedAction: hr.value >= 130 ? 'ECG, assess hemodynamic stability, identify and treat cause' : 'ECG, assess perfusion, review medications, consider atropine/pacing',
        category: 'guideline',
      })
    } else if (hr.value > 100 || hr.value < 60) {
      insights.push({
        id: `local-vital-${idx++}`,
        severity: 'warning',
        headline: hr.value > 100 ? `Tachycardia: ${hr.display} ${hr.unit}` : `Bradycardia: ${hr.display} ${hr.unit}`,
        detail: `Heart rate of ${hr.value} bpm is outside normal range (60-100 bpm).`,
        source: 'Clinical Practice Guidelines',
        suggestedAction: 'Assess symptoms, review medications, consider ECG',
        category: 'guideline',
      })
    }
  }

  // --- Blood Pressure (systolic from display value) ---
  const bp = summary.vitals.find(g => g.label.toLowerCase().includes('blood pressure'))
  if (bp && bp.readings.length > 0) {
    const bpStr = bp.readings[0].displayValue
    const match = bpStr.match(/(\d+)\s*\/\s*(\d+)/)
    if (match) {
      const systolic = parseInt(match[1], 10)
      const diastolic = parseInt(match[2], 10)
      if (systolic >= 180 || diastolic >= 120) {
        insights.push({
          id: `local-vital-${idx++}`,
          severity: 'critical',
          headline: `Hypertensive urgency: ${bpStr} mmHg`,
          detail: `Blood pressure of ${bpStr} indicates hypertensive urgency/emergency. Assess for end-organ damage (headache, chest pain, visual changes).`,
          source: 'AHA/ACC 2017 Hypertension Guidelines',
          suggestedAction: 'Assess for target organ damage, consider IV antihypertensive if emergency',
          category: 'guideline',
        })
      } else if (systolic < 90 || diastolic < 60) {
        insights.push({
          id: `local-vital-${idx++}`,
          severity: 'critical',
          headline: `Hypotension: ${bpStr} mmHg`,
          detail: `Blood pressure of ${bpStr} indicates hypotension. Assess for shock, hemorrhage, dehydration, or medication effect.`,
          source: 'Surviving Sepsis Campaign Guidelines',
          suggestedAction: 'IV fluid bolus, assess perfusion, identify cause, consider vasopressors',
          category: 'guideline',
        })
      }
    }
  }

  // Return max 3, prioritizing critical over warning
  insights.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === 'critical' ? -1 : 1
  })
  return insights.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Common clinical reference ranges — fallback when FHIR data lacks them
// ---------------------------------------------------------------------------

const COMMON_REF_RANGES: Array<{ patterns: string[]; low: number | null; high: number | null }> = [
  // Chemistry
  { patterns: ['glucose',  'blood glucose'],        low: 70,    high: 100   },
  { patterns: ['creatinine'],                        low: 0.6,   high: 1.2   },
  { patterns: ['bun', 'blood urea nitrogen', 'urea nitrogen'], low: 7, high: 20 },
  { patterns: ['sodium', 'na'],                      low: 136,   high: 145   },
  { patterns: ['potassium', 'k'],                    low: 3.5,   high: 5.0   },
  { patterns: ['chloride', 'cl'],                    low: 98,    high: 106   },
  { patterns: ['co2', 'bicarbonate', 'hco3'],        low: 23,    high: 29    },
  { patterns: ['calcium', 'ca'],                     low: 8.5,   high: 10.5  },
  { patterns: ['albumin'],                           low: 3.5,   high: 5.5   },
  { patterns: ['total protein'],                     low: 6.0,   high: 8.3   },
  { patterns: ['bilirubin'],                         low: 0.1,   high: 1.2   },
  { patterns: ['alkaline phosphatase', 'alp', 'alk phos'], low: 44, high: 147 },
  { patterns: ['alt', 'alanine aminotransferase', 'sgpt'],  low: 7,  high: 56  },
  { patterns: ['ast', 'aspartate aminotransferase', 'sgot'], low: 10, high: 40 },
  // Hematology
  { patterns: ['hemoglobin', 'hgb', 'hb'],          low: 12.0,  high: 17.5  },
  { patterns: ['hematocrit', 'hct'],                 low: 36,    high: 50    },
  { patterns: ['wbc', 'white blood cell', 'leukocyte'], low: 4.5, high: 11.0 },
  { patterns: ['platelet', 'plt'],                   low: 150,   high: 400   },
  { patterns: ['mcv', 'mean corpuscular volume'],    low: 80,    high: 100   },
  // Coagulation
  { patterns: ['inr'],                               low: null,  high: 1.1   },
  { patterns: ['pt', 'prothrombin time'],            low: 11,    high: 13.5  },
  // Cardiac
  { patterns: ['troponin'],                          low: null,  high: 0.04  },
  { patterns: ['bnp', 'b-type natriuretic'],         low: null,  high: 100   },
  // Thyroid
  { patterns: ['tsh'],                               low: 0.4,   high: 4.0   },
  // Renal
  { patterns: ['gfr', 'egfr', 'glomerular'],        low: 60,    high: null  },
]

function getCommonReferenceRange(labName: string): { low: number | null; high: number | null } | null {
  const lower = labName.toLowerCase()
  for (const entry of COMMON_REF_RANGES) {
    if (entry.patterns.some(p => lower.includes(p))) {
      return { low: entry.low, high: entry.high }
    }
  }
  return null
}

export function analyzeLabTrendsLocally(summary: PatientClinicalSummary): LabTrend[] {
  const trends: LabTrend[] = []

  for (const group of summary.labs) {
    if (group.readings.length === 0) continue
    if (group.readings[0].value == null) continue

    // Use FHIR reference range, or fall back to common clinical ranges
    const ref = group.referenceRange ?? getCommonReferenceRange(group.name)
    const readings = group.readings
      .filter(r => r.value != null)
      .map(r => ({
        date: r.timestamp,
        value: r.value!,
      }))
      .reverse() // Oldest first for charting

    if (readings.length === 0) continue

    const latest = readings[readings.length - 1].value

    // Flag if current value is out of reference range
    const isOutOfRange = ref
      ? (ref.low != null && latest < ref.low) || (ref.high != null && latest > ref.high)
      : false

    // Calculate trend direction (needs 2+ readings)
    let direction: 'rising' | 'falling' | 'stable' = 'stable'
    let daysToThreshold: number | null = null

    if (readings.length >= 2) {
      const previous = readings[readings.length - 2].value
      const diff = latest - previous
      const pctChange = previous !== 0 ? Math.abs(diff / previous) : 0
      if (pctChange > 0.05) { // >5% change is meaningful
        direction = diff > 0 ? 'rising' : 'falling'
      }

      // Estimate days to threshold (simple linear extrapolation)
      if (direction !== 'stable' && ref && readings.length >= 3) {
        const first = readings[0]
        const last = readings[readings.length - 1]
        const daysBetween = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (86_400_000)
        if (daysBetween > 0) {
          const ratePerDay = (last.value - first.value) / daysBetween
          if (ratePerDay !== 0) {
            if (direction === 'rising' && ref.high != null && latest < ref.high) {
              daysToThreshold = Math.round((ref.high - latest) / ratePerDay)
            } else if (direction === 'falling' && ref.low != null && latest > ref.low) {
              daysToThreshold = Math.round((latest - ref.low) / Math.abs(ratePerDay))
            }
            // Only keep positive estimates
            if (daysToThreshold != null && daysToThreshold <= 0) daysToThreshold = null
          }
        }
      }
    }

    // Include lab if: out of range, trending, OR no reference range available
    // (if we can't verify it's normal, practitioner should see it)
    const noRefAvailable = !ref || (ref.low == null && ref.high == null)
    if (direction === 'stable' && !isOutOfRange && !noRefAvailable) continue

    trends.push({
      labName: group.name,
      direction,
      currentValue: latest,
      unit: group.unit ?? '',
      referenceRange: ref ?? { low: null, high: null },
      daysToThreshold,
      outOfRange: isOutOfRange,
      dataPoints: readings,
    })
  }

  // Sort: out-of-range first, then by severity of trend
  trends.sort((a, b) => {
    if (a.outOfRange !== b.outOfRange) return a.outOfRange ? -1 : 1
    if (a.daysToThreshold != null && b.daysToThreshold != null) return a.daysToThreshold - b.daysToThreshold
    return 0
  })

  // Max 4 trend charts to keep UI clean
  return trends.slice(0, 4)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run clinical analysis on a patient summary.
 *
 * If OpenAI is configured: sends data to AI for insight generation + uses
 * local trend analysis for charts.
 * If OpenAI is NOT configured: returns local-only analysis (lab trends,
 * basic rule-based alerts from risk scores already on the dashboard).
 */
export async function analyzeClinicalData(
  summary: PatientClinicalSummary,
): Promise<ClinicalAnalysisResult> {
  // Always compute local lab trends (no AI needed)
  const localTrends = analyzeLabTrendsLocally(summary)

  // Always compute local vitals alerts — critical safety net
  const localVitalsInsights = generateLocalVitalsInsights(summary)

  // If AI is not configured, return local-only results
  if (!isAIConfigured()) {
    const allClear = localVitalsInsights.length === 0 && localTrends.every(t => !t.outOfRange)
    return {
      insights: localVitalsInsights,
      labTrends: localTrends,
      allClear,
      tokenUsage: null,
      error: localVitalsInsights.length > 0 ? null : 'OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env to enable AI insights.',
    }
  }

  try {
    const userPrompt = buildUserPrompt(summary)
    const response = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.2,
        maxTokens: 1500,
        responseFormat: { type: 'json_object' },
      },
    )

    // Parse AI response
    let parsed: { insights?: unknown[]; labTrends?: unknown[] }
    try {
      parsed = JSON.parse(response.content)
    } catch {
      const allClear = localVitalsInsights.length === 0 && localTrends.every(t => !t.outOfRange)
      return {
        insights: localVitalsInsights,
        labTrends: localTrends,
        allClear,
        tokenUsage: { prompt: response.usage.promptTokens, completion: response.usage.completionTokens, total: response.usage.totalTokens },
        error: 'AI returned invalid JSON. Using local analysis only.',
      }
    }

    // Validate and extract insights (max 3)
    const insights: ClinicalInsight[] = (Array.isArray(parsed.insights) ? parsed.insights : [])
      .slice(0, 3)
      .filter((i): i is Record<string, unknown> =>
        typeof i === 'object' && i != null &&
        typeof (i as Record<string, unknown>).headline === 'string' &&
        typeof (i as Record<string, unknown>).severity === 'string',
      )
      .map((i, idx) => ({
        id: `ai-insight-${idx}`,
        severity: ((i.severity === 'critical' ? 'critical' : 'warning') as InsightSeverity),
        headline: String(i.headline).slice(0, 100),
        detail: String(i.detail ?? ''),
        source: String(i.source ?? ''),
        suggestedAction: String(i.suggestedAction ?? ''),
        category: (['interaction', 'trend', 'contraindication', 'guideline'].includes(String(i.category))
          ? String(i.category)
          : 'guideline') as ClinicalInsight['category'],
      }))

    // Merge AI lab trends with local ones (prefer local for chart data points, AI for predictions)
    const aiLabTrends = Array.isArray(parsed.labTrends) ? parsed.labTrends : []
    const mergedTrends = localTrends.map(local => {
      const aiMatch = aiLabTrends.find(
        (ai): ai is Record<string, unknown> =>
          typeof ai === 'object' && ai != null &&
          typeof (ai as Record<string, unknown>).labName === 'string' &&
          String((ai as Record<string, unknown>).labName).toLowerCase() === local.labName.toLowerCase(),
      )
      if (aiMatch && typeof aiMatch.daysToThreshold === 'number') {
        return { ...local, daysToThreshold: aiMatch.daysToThreshold as number }
      }
      return local
    })

    // Merge: AI insights first, then local vital alerts not already covered by AI
    const aiHeadlinesLower = new Set(insights.map(i => i.headline.toLowerCase()))
    const uniqueLocalInsights = localVitalsInsights.filter(
      li => !aiHeadlinesLower.has(li.headline.toLowerCase()) &&
            !insights.some(ai => ai.headline.toLowerCase().includes(li.headline.split(':')[0].toLowerCase())),
    )
    const mergedInsights = [...insights, ...uniqueLocalInsights].slice(0, 3)

    const allClear = mergedInsights.length === 0 && mergedTrends.every(t => !t.outOfRange)

    return {
      insights: mergedInsights,
      labTrends: mergedTrends,
      allClear,
      tokenUsage: {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens,
      },
      error: null,
    }
  } catch (err) {
    const allClear = localVitalsInsights.length === 0 && localTrends.every(t => !t.outOfRange)
    return {
      insights: localVitalsInsights,
      labTrends: localTrends,
      allClear,
      tokenUsage: null,
      error: localVitalsInsights.length > 0 ? null : `AI analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
