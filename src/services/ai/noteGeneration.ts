/**
 * Note Generation Service — AI-powered clinical note drafting.
 *
 * Takes the same PatientClinicalSummary that feeds the insight engine,
 * plus any existing AI insights and risk scores, and generates a
 * structured clinical note the practitioner can review, edit, and sign.
 *
 * Supported formats:
 *   - SOAP: Subjective, Objective, Assessment, Plan
 *   - AP:   Assessment & Plan (concise)
 *   - HANDOFF: Situation, Background, Assessment, Recommendation (SBAR)
 *
 * Design philosophy:
 *   - Note is a DRAFT — practitioner always has final edit authority
 *   - Include only data that exists; never fabricate
 *   - Flag critical items prominently within the note body
 */

import { chatCompletion, chatCompletionStream, isAIConfigured } from './openaiPlatform'
import type { PatientClinicalSummary } from '../fhir/patientSummary'
import type { ClinicalInsight, LabTrend } from './clinicalAnalysis'
import type { RiskScores } from '../../types/app'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoteFormat = 'soap' | 'ap' | 'handoff'

export interface GeneratedNote {
  /** The note text content */
  content: string
  /** Which format template was used */
  format: NoteFormat
  /** Timestamp of generation */
  generatedAt: string
  /** Token usage */
  tokenUsage: { prompt: number; completion: number; total: number } | null
  /** Error if generation failed */
  error: string | null
}

export interface NoteHistoryEntry {
  id: string
  content: string
  format: NoteFormat
  generatedAt: string
  editedAt: string | null
  /** Was this edited by the practitioner after generation? */
  wasEdited: boolean
}

// ---------------------------------------------------------------------------
// Format-specific system prompts
// ---------------------------------------------------------------------------

const FORMAT_PROMPTS: Record<NoteFormat, string> = {
  soap: `You are a clinical documentation assistant. Generate a SOAP note from the provided patient data.

Structure the note EXACTLY as:

SUBJECTIVE:
(Chief complaint context from conditions and medications. If no subjective data available, write "Per chart review - no direct patient interview documented.")

OBJECTIVE:
- Vital Signs: (list all available vitals with values and units)
- Risk Scores: (list calculated scores and their clinical significance)
- Lab Results: (flag abnormal values, include trends if available)
- Current Medications: (list with dosages if available)
- Allergies: (list with reactions if known)

ASSESSMENT:
(Clinical synthesis — connect the dots between vitals, labs, conditions, and risk scores. Highlight any critical findings from the AI analysis. Number each problem.)

PLAN:
(Concrete, actionable items for each assessment point. Include monitoring recommendations, medication adjustments to consider, follow-up timing.)`,

  ap: `You are a clinical documentation assistant. Generate a concise Assessment & Plan note from the provided patient data.

Structure the note as a numbered problem list:

For each active clinical problem:
1. [Problem Name] — brief assessment including relevant data
   - Plan: concrete next steps

End with:
MONITORING: Key parameters to track
FOLLOW-UP: Recommended timing`,

  handoff: `You are a clinical documentation assistant. Generate an SBAR handoff note from the provided patient data.

Structure the note EXACTLY as:

SITUATION:
(Who is this patient? What is the current clinical picture in 2 sentences?)

BACKGROUND:
(Relevant medical history, current medications, allergies — brief, relevant only)

ASSESSMENT:
(Current status: vitals, labs, risk scores. What concerns you? What's changed?)

RECOMMENDATION:
(What does the next provider need to do? Monitoring plan, pending items, critical watch-outs)`,
}

const BASE_RULES = `
STRICT RULES:
1. Use ONLY the data provided — never fabricate values, dates, or history.
2. If data is missing, say "not available" rather than omitting the section.
3. Mark items that are critical or out-of-range with [CRITICAL] or [ABNORMAL] tags.
4. Use standard medical abbreviations.
5. Keep the note concise but complete — aim for what fits on one screen.
6. Do NOT include patient identifiers (name, MRN, DOB) — those are in the EHR banner.
7. Include today's date/time at the top.
8. End with "This note was AI-assisted and requires practitioner review and attestation."
9. Return ONLY the note text — no JSON wrapping, no markdown formatting.`

// ---------------------------------------------------------------------------
// Build prompt from clinical context
// ---------------------------------------------------------------------------

function buildNotePrompt(
  summary: PatientClinicalSummary,
  insights: ClinicalInsight[],
  labTrends: LabTrend[],
  riskScores: RiskScores,
): string {
  const parts: string[] = ['PATIENT CLINICAL DATA:\n']

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
    parts.push('LAB TRENDS:')
    for (const t of labTrends) {
      const range = `[${t.referenceRange.low ?? '?'}–${t.referenceRange.high ?? '?'}]`
      const status = t.outOfRange ? '[ABNORMAL]' : ''
      const trend = t.direction === 'rising' ? '↑' : t.direction === 'falling' ? '↓' : '→'
      parts.push(`  ${t.labName}: ${t.currentValue} ${t.unit} ${trend} ${range} ${status}`)
      if (t.daysToThreshold != null) {
        parts.push(`    est. ${t.daysToThreshold}d to threshold`)
      }
    }
    parts.push('')
  }

  // AI Insights (already analyzed)
  if (insights.length > 0) {
    parts.push('AI-IDENTIFIED CLINICAL ALERTS:')
    for (const i of insights) {
      parts.push(`  [${i.severity.toUpperCase()}] ${i.headline}`)
      if (i.suggestedAction) parts.push(`    Action: ${i.suggestedAction}`)
    }
    parts.push('')
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a clinical note from the patient's clinical data.
 */
export async function generateClinicalNote(
  summary: PatientClinicalSummary,
  insights: ClinicalInsight[],
  labTrends: LabTrend[],
  riskScores: RiskScores,
  format: NoteFormat = 'soap',
): Promise<GeneratedNote> {
  if (!isAIConfigured()) {
    return {
      content: '',
      format,
      generatedAt: new Date().toISOString(),
      tokenUsage: null,
      error: 'OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env to enable note generation.',
    }
  }

  try {
    const userPrompt = buildNotePrompt(summary, insights, labTrends, riskScores)
    const systemPrompt = FORMAT_PROMPTS[format] + '\n' + BASE_RULES

    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 2000,
      },
    )

    return {
      content: response.content.trim(),
      format,
      generatedAt: new Date().toISOString(),
      tokenUsage: {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens,
      },
      error: null,
    }
  } catch (err) {
    return {
      content: '',
      format,
      generatedAt: new Date().toISOString(),
      tokenUsage: null,
      error: `Note generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Streaming variant — calls `onChunk` with each text delta as it arrives.
 * Resolves with the final GeneratedNote once the stream completes.
 *
 * @param onChunk — called with (accumulated text so far) on each delta
 */
export async function generateClinicalNoteStream(
  summary: PatientClinicalSummary,
  insights: ClinicalInsight[],
  labTrends: LabTrend[],
  riskScores: RiskScores,
  format: NoteFormat = 'soap',
  onChunk: (accumulated: string) => void,
): Promise<GeneratedNote> {
  if (!isAIConfigured()) {
    return {
      content: '',
      format,
      generatedAt: new Date().toISOString(),
      tokenUsage: null,
      error: 'OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env to enable note generation.',
    }
  }

  try {
    const userPrompt = buildNotePrompt(summary, insights, labTrends, riskScores)
    const systemPrompt = FORMAT_PROMPTS[format] + '\n' + BASE_RULES

    const response = await chatCompletionStream(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      (_delta, accumulated) => onChunk(accumulated),
      {
        temperature: 0.3,
        maxTokens: 1200,
      },
    )

    return {
      content: response.content.trim(),
      format,
      generatedAt: new Date().toISOString(),
      tokenUsage: {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens,
      },
      error: null,
    }
  } catch (err) {
    return {
      content: '',
      format,
      generatedAt: new Date().toISOString(),
      tokenUsage: null,
      error: `Note generation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Local Storage for Note History
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'practitionerhub_note_history'
const MAX_HISTORY = 10

export function saveNoteToHistory(entry: NoteHistoryEntry): void {
  try {
    const existing = getNoteHistory()
    const updated = [entry, ...existing.filter(e => e.id !== entry.id)].slice(0, MAX_HISTORY)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage may be unavailable in some EHR iframes
  }
}

export function getNoteHistory(): NoteHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as NoteHistoryEntry[]
  } catch {
    return []
  }
}

export function clearNoteHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
