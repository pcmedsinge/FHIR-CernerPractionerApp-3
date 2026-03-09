/**
 * Copilot Service — manages the AI conversation with full patient context.
 *
 * Builds a system prompt that injects the patient's clinical data,
 * then streams responses back to the UI.
 */

import { chatCompletionStream, type ChatMessage } from '../ai/openaiPlatform'
import type { PatientClinicalSummary } from '../fhir/patientSummary'
import type { ClinicalInsight, LabTrend } from '../ai/clinicalAnalysis'
import type { RiskScores } from '../../types/app'

// ---------------------------------------------------------------------------
// Build clinical context string (shared logic with noteGeneration)
// ---------------------------------------------------------------------------

function buildClinicalContext(
  summary: PatientClinicalSummary,
  insights: ClinicalInsight[],
  labTrends: LabTrend[],
  riskScores: RiskScores,
): string {
  const parts: string[] = ['PATIENT CLINICAL DATA (from EHR — FHIR resources):\n']

  // Vitals
  if (summary.vitals.length > 0) {
    parts.push('VITAL SIGNS:')
    for (const group of summary.vitals) {
      if (group.readings.length === 0) continue
      const latest = group.readings[0]
      parts.push(`  ${group.label}: ${latest.displayValue} ${latest.unit} (${new Date(latest.timestamp).toLocaleString()})`)
    }
    parts.push('')
  }

  // Risk Scores
  const scores: string[] = []
  if (riskScores.news2) scores.push(`NEWS2: ${riskScores.news2.total} (${riskScores.news2.level})`)
  if (riskScores.qsofa) scores.push(`qSOFA: ${riskScores.qsofa.score}/3${riskScores.qsofa.sepsisRisk ? ' [SEPSIS RISK]' : ''}`)
  if (riskScores.ascvd) scores.push(`ASCVD 10yr: ${riskScores.ascvd.riskPercent}% (${riskScores.ascvd.level})`)
  if (riskScores.cha2ds2vasc) scores.push(`CHA₂DS₂-VASc: ${riskScores.cha2ds2vasc.score} (${riskScores.cha2ds2vasc.riskLevel})`)
  if (scores.length > 0) {
    parts.push('RISK SCORES:')
    scores.forEach(s => parts.push(`  ${s}`))
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

  // Lab Trends
  if (labTrends.length > 0) {
    parts.push('LAB RESULTS & TRENDS:')
    for (const t of labTrends) {
      const range = `[ref: ${t.referenceRange.low ?? '?'}–${t.referenceRange.high ?? '?'}]`
      const status = t.outOfRange ? ' [ABNORMAL]' : ''
      const trend = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→'
      parts.push(`  ${t.labName}: ${t.currentValue} ${t.unit} ${trend} ${range}${status}`)
    }
    parts.push('')
  }

  // AI Insights already generated
  if (insights.length > 0) {
    parts.push('PREVIOUSLY IDENTIFIED CLINICAL ALERTS:')
    for (const i of insights) {
      parts.push(`  [${i.severity.toUpperCase()}] ${i.headline}`)
      if (i.suggestedAction) parts.push(`    Suggested: ${i.suggestedAction}`)
    }
    parts.push('')
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const COPILOT_SYSTEM_BASE = `You are a clinical decision support assistant integrated into an EHR (Electronic Health Record) system called PractitionerHub. You are conversing directly with a licensed healthcare practitioner.

YOUR ROLE:
- Provide evidence-based clinical reasoning using the patient data provided below
- Cite clinical guidelines where applicable (AHA, USPSTF, Sepsis-3, etc.)
- Flag critical findings prominently with [CRITICAL] or [WARNING] tags
- Be concise but thorough — practitioners have limited time
- When uncertain, clearly state the level of uncertainty
- Never fabricate clinical data — use ONLY what is provided

FORMATTING RULES:
- Use clear section headers (e.g., ASSESSMENT:, RECOMMENDATION:)
- Use bullet points for lists
- Bold key findings by wrapping in **asterisks**
- Keep answers focused and actionable
- If the question is outside the scope of available data, say what additional information would be needed

IMPORTANT:
- You are a decision SUPPORT tool — final clinical judgment belongs to the practitioner
- Do not provide definitive diagnoses — frame as differentials with reasoning
- Always end with a brief disclaimer: "Clinical AI assistant — verify independently before acting."

`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CopilotContext {
  summary: PatientClinicalSummary
  insights: ClinicalInsight[]
  labTrends: LabTrend[]
  riskScores: RiskScores
}

/**
 * Stream a copilot response with full patient context.
 * Maintains conversational history for multi-turn interactions.
 *
 * @param userMessage  The practitioner's question
 * @param chatHistory  Previous messages in this session (excludes system prompt)
 * @param context      Patient clinical data from the briefing
 * @param onChunk      Called with accumulated text on each streaming delta
 * @returns            The complete assistant response text
 */
export async function streamCopilotResponse(
  userMessage: string,
  chatHistory: ChatMessage[],
  context: CopilotContext,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const clinicalData = buildClinicalContext(
    context.summary,
    context.insights,
    context.labTrends,
    context.riskScores,
  )

  const systemPrompt = COPILOT_SYSTEM_BASE + '\n' + clinicalData

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: userMessage },
  ]

  const response = await chatCompletionStream(
    messages,
    (_delta, accumulated) => onChunk(accumulated),
    {
      temperature: 0.4,
      maxTokens: 1500,
    },
  )

  return response.content.trim()
}
