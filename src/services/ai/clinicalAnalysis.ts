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

export function analyzeLabTrendsLocally(summary: PatientClinicalSummary): LabTrend[] {
  const trends: LabTrend[] = []

  for (const group of summary.labs) {
    if (group.readings.length < 2) continue
    if (group.readings[0].value == null) continue

    const ref = group.referenceRange
    const readings = group.readings
      .filter(r => r.value != null)
      .map(r => ({
        date: r.timestamp,
        value: r.value!,
      }))
      .reverse() // Oldest first for charting

    if (readings.length < 2) continue

    const latest = readings[readings.length - 1].value
    const previous = readings[readings.length - 2].value
    const diff = latest - previous

    // Only flag problematic trends
    const isOutOfRange = ref
      ? (ref.low != null && latest < ref.low) || (ref.high != null && latest > ref.high)
      : false

    // Calculate trend direction
    let direction: 'rising' | 'falling' | 'stable' = 'stable'
    const pctChange = previous !== 0 ? Math.abs(diff / previous) : 0
    if (pctChange > 0.05) { // >5% change is meaningful
      direction = diff > 0 ? 'rising' : 'falling'
    }

    // Estimate days to threshold (simple linear extrapolation)
    let daysToThreshold: number | null = null
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

    // Skip stable, in-range labs — practitioner doesn't care
    if (direction === 'stable' && !isOutOfRange) continue

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

  // If AI is not configured, return local-only results
  if (!isAIConfigured()) {
    return {
      insights: [],
      labTrends: localTrends,
      allClear: localTrends.every(t => !t.outOfRange),
      tokenUsage: null,
      error: 'OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env to enable AI insights.',
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
      return {
        insights: [],
        labTrends: localTrends,
        allClear: localTrends.every(t => !t.outOfRange),
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

    const allClear = insights.length === 0 && mergedTrends.every(t => !t.outOfRange)

    return {
      insights,
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
    return {
      insights: [],
      labTrends: localTrends,
      allClear: localTrends.every(t => !t.outOfRange),
      tokenUsage: null,
      error: `AI analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
