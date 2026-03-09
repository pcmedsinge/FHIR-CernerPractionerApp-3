/**
 * Copilot prompt definitions — context-aware smart action cards.
 *
 * Cards are dynamically ordered and enriched based on patient acuity:
 * high NEWS2 → sepsis/deterioration elevated, abnormal vitals → explain first, etc.
 * Max 6 cards shown on welcome; 2-3 follow-ups shown after each response.
 */

import type { BriefingData } from '../../hooks/usePatientBriefing'
import { getVitalStatus } from '../../services/fhir/observations'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptUrgency = 'critical' | 'warning' | 'info'

export interface PromptCard {
  id: string
  /** Short button/card label */
  label: string
  /** One-line context shown on the card (dynamically enriched) */
  context: string
  /** Full prompt sent to AI */
  prompt: string
  category: 'decision' | 'diagnosis' | 'documentation' | 'guideline'
  /** Visual urgency level — drives border color on cards */
  urgency: PromptUrgency
  /** Higher = shown first. Adjusted by patient state. */
  priority: number
  /** Icon key for the card */
  icon: 'vitals' | 'labs' | 'differential' | 'sepsis' | 'heart' | 'pills' | 'handoff' | 'doc' | 'family' | 'shield' | 'checklist' | 'stethoscope'
}

// ---------------------------------------------------------------------------
// Base prompt library
// ---------------------------------------------------------------------------

const BASE_PROMPTS: PromptCard[] = [
  {
    id: 'explain-vitals',
    label: 'Explain Critical Vitals',
    context: 'Analyze abnormal vitals with differential',
    prompt: 'What are the most likely causes of this patient\'s abnormal vital signs? Consider the combination of all vitals, conditions, and medications. Provide a differential diagnosis ranked by likelihood.',
    category: 'diagnosis',
    urgency: 'info',
    priority: 55,
    icon: 'vitals',
  },
  {
    id: 'sepsis-criteria',
    label: 'Sepsis Protocol Check',
    context: 'Evaluate Sepsis-3 qSOFA/SOFA criteria',
    prompt: 'Evaluate this patient against the Sepsis-3 criteria (qSOFA and SOFA). Is this patient meeting or approaching sepsis criteria? What is the recommended bundle within the first 1-hour and 3-hour windows?',
    category: 'guideline',
    urgency: 'info',
    priority: 48,
    icon: 'sepsis',
  },
  {
    id: 'anticoag',
    label: 'Anticoagulation Review',
    context: 'CHA₂DS₂-VASc risk–benefit analysis',
    prompt: 'Based on this patient\'s CHA₂DS₂-VASc score, conditions, and current medications, is this patient a candidate for anticoagulation? What are the risks and benefits? Which agent would you recommend and why?',
    category: 'decision',
    urgency: 'info',
    priority: 50,
    icon: 'heart',
  },
  {
    id: 'drug-interactions',
    label: 'Drug Interaction Review',
    context: 'Check medication conflicts and contraindications',
    prompt: 'Review all current medications for this patient. Are there any significant drug-drug interactions or drug-condition contraindications? Rank them by clinical severity.',
    category: 'decision',
    urgency: 'info',
    priority: 45,
    icon: 'pills',
  },
  {
    id: 'differential',
    label: 'Differential Diagnosis',
    context: 'Ranked differentials from current data',
    prompt: 'Based on all available data (vitals, labs, conditions, medications), what is the differential diagnosis for this patient\'s current presentation? Rank by probability and identify any red flags.',
    category: 'diagnosis',
    urgency: 'info',
    priority: 30,
    icon: 'differential',
  },
  {
    id: 'additional-labs',
    label: 'Recommended Lab Orders',
    context: 'Identify gaps in current workup',
    prompt: 'Given the current clinical picture, what additional laboratory tests should be ordered? Explain the clinical rationale for each recommended test.',
    category: 'diagnosis',
    urgency: 'info',
    priority: 35,
    icon: 'labs',
  },
  {
    id: 'handoff-summary',
    label: 'Handoff Summary',
    context: 'Concise SBAR for incoming team',
    prompt: 'Provide a concise clinical handoff summary for the incoming team. Cover: current status, active problems, what to watch for, and pending actions.',
    category: 'decision',
    urgency: 'info',
    priority: 40,
    icon: 'handoff',
  },
  {
    id: 'aha-recommendations',
    label: 'AHA Guideline Check',
    context: 'ASCVD risk and AHA/ACC recommendations',
    prompt: 'Based on this patient\'s ASCVD risk score and clinical profile, what does the AHA/ACC guideline recommend? Are there any recommended interventions or lifestyle modifications not currently addressed?',
    category: 'guideline',
    urgency: 'info',
    priority: 25,
    icon: 'shield',
  },
  {
    id: 'preventive-care',
    label: 'Preventive Care Gaps',
    context: 'USPSTF screening and vaccination gaps',
    prompt: 'Based on the patient\'s age, conditions, and current care plan, are there any recommended preventive care measures that appear to be missing? Consider cancer screenings, vaccinations, and chronic disease monitoring per USPSTF guidelines.',
    category: 'guideline',
    urgency: 'info',
    priority: 15,
    icon: 'checklist',
  },
  {
    id: 'referral-letter',
    label: 'Draft Referral Letter',
    context: 'Professional referral with clinical context',
    prompt: 'Draft a professional referral letter to a specialist based on this patient\'s clinical data. Include relevant history, current status, reason for referral, and specific questions for the specialist. Leave the specialty name as [SPECIALTY] for me to fill in.',
    category: 'documentation',
    urgency: 'info',
    priority: 20,
    icon: 'doc',
  },
  {
    id: 'discharge-instructions',
    label: 'Discharge Instructions',
    context: 'Patient-friendly care instructions',
    prompt: 'Write clear, patient-friendly discharge instructions for this patient. Include: medication instructions, warning signs to watch for, activity restrictions, follow-up appointments needed, and when to seek emergency care. Use 6th-grade reading level.',
    category: 'documentation',
    urgency: 'info',
    priority: 15,
    icon: 'doc',
  },
  {
    id: 'family-summary',
    label: 'Family Explanation',
    context: 'Jargon-free summary for family members',
    prompt: 'Write a compassionate, jargon-free summary of this patient\'s condition that I can share with the patient\'s family. Explain what is happening, what we are doing about it, and what to expect next.',
    category: 'documentation',
    urgency: 'info',
    priority: 10,
    icon: 'family',
  },
]

// ---------------------------------------------------------------------------
// Context-aware priority boosting + dynamic enrichment
// ---------------------------------------------------------------------------

export function getContextualPrompts(data: BriefingData | null): PromptCard[] {
  if (!data) return BASE_PROMPTS.sort((a, b) => b.priority - a.priority)

  const boosted = BASE_PROMPTS.map(p => ({ ...p }))

  const news2Score = data.riskScores.news2?.total ?? 0
  const news2Level = data.riskScores.news2?.level ?? 'Low'
  const hasHighNEWS2 = news2Score >= 5
  const hasSepsisRisk = data.riskScores.qsofa?.sepsisRisk ?? false
  const cha2Score = data.riskScores.cha2ds2vasc?.score ?? 0
  const hasCHA2DS2 = cha2Score >= 2
  const hasAbnormalVitals = data.maxSeverity === 'high' || data.maxSeverity === 'moderate'
  const ascvdRisk = data.riskScores.ascvd?.riskPercent
  const hasASCVDRisk = ascvdRisk != null && ascvdRisk >= 7.5
  const medCount = data.clinicalSummary?.medications?.length ?? 0

  // Find critical vitals for enrichment
  const criticalVitals: string[] = []
  for (const vg of data.vitalGroups) {
    if (vg.readings.length > 0) {
      const r = vg.readings[0]
      const status = getVitalStatus(vg.type, r.numericValue)
      if (status === 'critical' || status === 'warning') {
        criticalVitals.push(`${vg.label} ${r.displayValue}${r.unit ? ' ' + r.unit : ''}`)
      }
    }
  }

  for (const card of boosted) {
    // ── Sepsis pathway ──
    if ((hasHighNEWS2 || hasSepsisRisk) && card.id === 'sepsis-criteria') {
      card.priority += 50
      card.urgency = 'critical'
      card.context = `NEWS2: ${news2Score} (${news2Level})${hasSepsisRisk ? ' — qSOFA flagged' : ''}`
    }

    // ── Critical vitals ──
    if (hasAbnormalVitals && card.id === 'explain-vitals') {
      card.priority += 40
      card.urgency = data.maxSeverity === 'high' ? 'critical' : 'warning'
      if (criticalVitals.length > 0) {
        card.context = criticalVitals.slice(0, 3).join(', ')
      }
    }

    // ── Anticoagulation ──
    if (hasCHA2DS2 && card.id === 'anticoag') {
      card.priority += 40
      card.urgency = 'warning'
      card.context = `CHA₂DS₂-VASc: ${cha2Score} — evaluate candidacy`
    }

    // ── Drug interactions ──
    if (medCount >= 5 && card.id === 'drug-interactions') {
      card.priority += 25
      card.urgency = 'warning'
      card.context = `${medCount} active medications — check conflicts`
    }

    // ── AHA cardiovascular ──
    if (hasASCVDRisk && card.id === 'aha-recommendations') {
      card.priority += 30
      card.urgency = 'warning'
      card.context = `ASCVD 10yr: ${ascvdRisk?.toFixed(1)}% — review statin therapy`
    }
  }

  return boosted.sort((a, b) => b.priority - a.priority)
}

// ---------------------------------------------------------------------------
// Follow-up suggestions (shown after a response, context-aware)
// ---------------------------------------------------------------------------

/**
 * Given the set of already-asked prompt IDs, return 2-3 relevant follow-ups.
 */
export function getFollowUpPrompts(
  askedIds: Set<string>,
  data: BriefingData | null,
): PromptCard[] {
  const all = getContextualPrompts(data)
  return all.filter(p => !askedIds.has(p.id)).slice(0, 3)
}
