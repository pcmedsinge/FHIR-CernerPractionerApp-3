/**
 * Copilot prompt chip definitions — context-aware quick-ask suggestions.
 *
 * Chips are dynamically ordered based on the patient's clinical state:
 * high NEWS2 → sepsis/deterioration first, AFib → anticoagulation first, etc.
 */

import type { BriefingData } from '../../hooks/usePatientBriefing'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptChip {
  id: string
  label: string
  /** Full prompt sent to AI (may differ from display label) */
  prompt: string
  category: 'decision' | 'diagnosis' | 'documentation' | 'guideline'
  /** Higher = shown first. Base priority overridden by context boosting. */
  priority: number
}

// ---------------------------------------------------------------------------
// Base prompt library
// ---------------------------------------------------------------------------

const BASE_PROMPTS: PromptChip[] = [
  // ── Clinical Decision Support ──
  {
    id: 'anticoag',
    label: 'Anticoagulation candidacy?',
    prompt: 'Based on this patient\'s CHA₂DS₂-VASc score, conditions, and current medications, is this patient a candidate for anticoagulation? What are the risks and benefits? Which agent would you recommend and why?',
    category: 'decision',
    priority: 50,
  },
  {
    id: 'drug-interactions',
    label: 'Drug interaction risks?',
    prompt: 'Review all current medications for this patient. Are there any significant drug-drug interactions or drug-condition contraindications? Rank them by clinical severity.',
    category: 'decision',
    priority: 45,
  },
  {
    id: 'handoff-summary',
    label: 'Summarize for handoff',
    prompt: 'Provide a concise clinical handoff summary for the incoming team. Cover: current status, active problems, what to watch for, and pending actions.',
    category: 'decision',
    priority: 40,
  },

  // ── Diagnosis & Workup ──
  {
    id: 'explain-vitals',
    label: 'Explain abnormal vitals',
    prompt: 'What are the most likely causes of this patient\'s abnormal vital signs? Consider the combination of all vitals, conditions, and medications. Provide a differential diagnosis ranked by likelihood.',
    category: 'diagnosis',
    priority: 55,
  },
  {
    id: 'additional-labs',
    label: 'What labs should I order?',
    prompt: 'Given the current clinical picture, what additional laboratory tests should be ordered? Explain the clinical rationale for each recommended test.',
    category: 'diagnosis',
    priority: 35,
  },
  {
    id: 'differential',
    label: 'Differential diagnosis',
    prompt: 'Based on all available data (vitals, labs, conditions, medications), what is the differential diagnosis for this patient\'s current presentation? Rank by probability and identify any red flags.',
    category: 'diagnosis',
    priority: 30,
  },

  // ── Documentation ──
  {
    id: 'referral-letter',
    label: 'Draft referral letter',
    prompt: 'Draft a professional referral letter to a specialist based on this patient\'s clinical data. Include relevant history, current status, reason for referral, and specific questions for the specialist. Leave the specialty name as [SPECIALTY] for me to fill in.',
    category: 'documentation',
    priority: 20,
  },
  {
    id: 'discharge-instructions',
    label: 'Discharge instructions',
    prompt: 'Write clear, patient-friendly discharge instructions for this patient. Include: medication instructions, warning signs to watch for, activity restrictions, follow-up appointments needed, and when to seek emergency care. Use 6th-grade reading level.',
    category: 'documentation',
    priority: 15,
  },
  {
    id: 'family-summary',
    label: 'Explain to patient\'s family',
    prompt: 'Write a compassionate, jargon-free summary of this patient\'s condition that I can share with the patient\'s family. Explain what is happening, what we are doing about it, and what to expect next.',
    category: 'documentation',
    priority: 10,
  },

  // ── Guideline Checks ──
  {
    id: 'sepsis-criteria',
    label: 'Sepsis criteria check',
    prompt: 'Evaluate this patient against the Sepsis-3 criteria (qSOFA and SOFA). Is this patient meeting or approaching sepsis criteria? What is the recommended bundle within the first 1-hour and 3-hour windows?',
    category: 'guideline',
    priority: 48,
  },
  {
    id: 'aha-recommendations',
    label: 'AHA guideline check',
    prompt: 'Based on this patient\'s ASCVD risk score and clinical profile, what does the AHA/ACC guideline recommend? Are there any recommended interventions or lifestyle modifications not currently addressed?',
    category: 'guideline',
    priority: 25,
  },
  {
    id: 'preventive-care',
    label: 'Missing preventive care?',
    prompt: 'Based on the patient\'s age, conditions, and current care plan, are there any recommended preventive care measures that appear to be missing? Consider cancer screenings, vaccinations, and chronic disease monitoring per USPSTF guidelines.',
    category: 'guideline',
    priority: 15,
  },
]

// ---------------------------------------------------------------------------
// Context-aware priority boosting
// ---------------------------------------------------------------------------

export function getContextualPrompts(data: BriefingData | null): PromptChip[] {
  if (!data) return BASE_PROMPTS.sort((a, b) => b.priority - a.priority)

  // Clone with adjusted priorities
  const boosted = BASE_PROMPTS.map(p => ({ ...p }))

  const news2Score = data.riskScores.news2?.total ?? 0
  const hasHighNEWS2 = news2Score >= 5
  const hasSepsisRisk = data.riskScores.qsofa?.sepsisRisk ?? false
  const hasCHA2DS2 = (data.riskScores.cha2ds2vasc?.score ?? 0) >= 2
  const hasAbnormalVitals = data.maxSeverity === 'high' || data.maxSeverity === 'moderate'
  const hasASCVDRisk = data.riskScores.ascvd && data.riskScores.ascvd.riskPercent >= 7.5

  for (const chip of boosted) {
    // Boost sepsis-related if NEWS2 high or qSOFA flagged
    if ((hasHighNEWS2 || hasSepsisRisk) && (chip.id === 'sepsis-criteria' || chip.id === 'explain-vitals')) {
      chip.priority += 50
    }

    // Boost anticoag if CHA2DS2-VASc elevated
    if (hasCHA2DS2 && chip.id === 'anticoag') {
      chip.priority += 40
    }

    // Boost vital explanation if abnormal
    if (hasAbnormalVitals && chip.id === 'explain-vitals') {
      chip.priority += 30
    }

    // Boost AHA if ASCVD risk is borderline+
    if (hasASCVDRisk && chip.id === 'aha-recommendations') {
      chip.priority += 30
    }

    // Boost drug interactions if many meds
    if (data.clinicalSummary && data.clinicalSummary.medications.length >= 5 && chip.id === 'drug-interactions') {
      chip.priority += 25
    }
  }

  return boosted.sort((a, b) => b.priority - a.priority)
}

// ---------------------------------------------------------------------------
// Category metadata for UI grouping
// ---------------------------------------------------------------------------

export const CATEGORY_META: Record<PromptChip['category'], { label: string; color: string }> = {
  decision: { label: 'Clinical Decisions', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  diagnosis: { label: 'Diagnosis & Workup', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  documentation: { label: 'Documentation', color: 'bg-green-50 text-green-700 border-green-200' },
  guideline: { label: 'Guidelines', color: 'bg-amber-50 text-amber-700 border-amber-200' },
}
