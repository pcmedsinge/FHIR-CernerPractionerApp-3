/**
 * Trajectory AI Predictions — lazy-loaded OpenAI analysis.
 *
 * Generates 2-3 forward-looking clinical prediction cards based on
 * the computed trajectory and patient data. Only called when the
 * user expands the Trajectory section — zero impact on page load.
 */

import { chatCompletion, isAIConfigured, type ChatMessage } from '../ai/openaiPlatform'
import type { TrajectoryData } from './trajectoryEngine'
import type { BriefingData } from '../../hooks/usePatientBriefing'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PredictionCard {
  id: string
  /** One-line prediction headline */
  headline: string
  /** 1-2 sentence clinical reasoning */
  detail: string
  /** Confidence as percentage string, e.g. "72%" */
  confidence: string
  /** Severity drives card accent color */
  severity: 'critical' | 'warning' | 'info'
  /** Recommended action */
  action: string
  /** Time horizon, e.g. "Next 4-8h" */
  timeframe: string
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildPrompt(trajectory: TrajectoryData, data: BriefingData): ChatMessage[] {
  const vitals = data.vitals
  const conditions = data.clinicalSummary?.conditions?.conditions?.map(c =>
    c.code?.text ?? c.code?.coding?.[0]?.display ?? 'Unknown'
  ).join(', ') || 'None documented'

  const meds = data.clinicalSummary?.medications?.map(m => m.name).join(', ') || 'None documented'

  const labSummary = data.labTrends.map(t => {
    const dir = t.currentValue > (t.referenceRange?.high ?? Infinity) ? 'HIGH'
      : t.currentValue < (t.referenceRange?.low ?? -Infinity) ? 'LOW' : 'normal'
    return `${t.labName}: ${t.currentValue} ${t.unit ?? ''} (${dir})`
  }).join('; ') || 'No lab trends'

  const systemScores = trajectory.systems.map(s =>
    `${s.system}: ${s.now}/10 (${s.delta > 0 ? '+' : ''}${s.delta})`
  ).join(', ')

  const riskScoreSummary = [
    data.riskScores.news2 ? `NEWS2: ${data.riskScores.news2.total}` : null,
    data.riskScores.qsofa ? `qSOFA: ${data.riskScores.qsofa.score}` : null,
  ].filter(Boolean).join(', ') || 'Not computed'

  return [
    {
      role: 'system',
      content: `You are a clinical decision support system generating predictive insights for a hospitalized patient. 
Your task is to analyze trajectory data and generate exactly 3 forward-looking prediction cards.

RULES:
- Each prediction must be clinically grounded in the provided data
- Include specific timeframes (e.g., "Next 4-8h", "Within 12h")
- Include confidence percentages (be conservative — 50-85% range)
- Recommend actionable interventions
- One prediction should address the HIGHEST-risk body system
- One prediction should address overall trajectory direction
- One prediction should address a specific intervention or monitoring need

Output EXACTLY this JSON array format (no other text):
[
  {
    "headline": "...",
    "detail": "...",
    "confidence": "XX%",
    "severity": "critical|warning|info",
    "action": "...",
    "timeframe": "..."
  }
]`
    },
    {
      role: 'user',
      content: `PATIENT TRAJECTORY DATA:

Current Acuity Index: ${trajectory.currentAcuity}/100 (${trajectory.severityLabel})
Trend: ${trajectory.trend}
Predicted acuity in 12h: ${trajectory.prediction.length > 0 ? trajectory.prediction[trajectory.prediction.length - 1].acuity : 'N/A'} (range: ${trajectory.prediction.length > 0 ? `${trajectory.prediction[trajectory.prediction.length - 1].low}-${trajectory.prediction[trajectory.prediction.length - 1].high}` : 'N/A'})

VITALS:
- HR: ${vitals.heartRate ?? 'N/A'} bpm
- BP: ${vitals.bloodPressure ?? 'N/A'}
- RR: ${vitals.respiratoryRate ?? 'N/A'}/min
- SpO2: ${vitals.spo2 ?? 'N/A'}%
- Temp: ${vitals.temperature ?? 'N/A'}°C

BODY SYSTEMS (0=normal, 10=severe):
${systemScores}

RISK SCORES: ${riskScoreSummary}
CONDITIONS: ${conditions}
MEDICATIONS: ${meds}
LAB TRENDS: ${labSummary}

Generate 3 prediction cards.`
    }
  ]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getTrajectoryPredictions(
  trajectory: TrajectoryData,
  data: BriefingData,
): Promise<PredictionCard[]> {
  if (!isAIConfigured()) {
    return getLocalPredictions(trajectory)
  }

  try {
    const messages = buildPrompt(trajectory, data)
    const response = await chatCompletion(messages, { temperature: 0.3 })

    // Parse JSON from response
    const jsonMatch = response.content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const raw = JSON.parse(jsonMatch[0]) as Array<{
      headline: string
      detail: string
      confidence: string
      severity: string
      action: string
      timeframe: string
    }>

    return raw.slice(0, 3).map((card, i) => ({
      id: `pred-${i}`,
      headline: card.headline,
      detail: card.detail,
      confidence: card.confidence,
      severity: (['critical', 'warning', 'info'].includes(card.severity) ? card.severity : 'info') as PredictionCard['severity'],
      action: card.action,
      timeframe: card.timeframe,
    }))
  } catch (err) {
    console.warn('[TrajectoryPredictions] AI failed, using local fallback:', err)
    return getLocalPredictions(trajectory)
  }
}

// ---------------------------------------------------------------------------
// Local fallback — rule-based predictions when AI is unavailable
// ---------------------------------------------------------------------------

function getLocalPredictions(trajectory: TrajectoryData): PredictionCard[] {
  const cards: PredictionCard[] = []

  // Trajectory direction card
  const future12h = trajectory.prediction.length > 0
    ? trajectory.prediction[trajectory.prediction.length - 1].acuity
    : trajectory.currentAcuity

  if (trajectory.trend === 'critical' || trajectory.trend === 'worsening') {
    cards.push({
      id: 'pred-trajectory',
      headline: `Acuity projected to reach ${future12h} within 12h`,
      detail: `Current acuity ${trajectory.currentAcuity}/100 with ${trajectory.trend} trajectory. Prediction range: ${trajectory.prediction.length > 0 ? `${trajectory.prediction[trajectory.prediction.length - 1].low}–${trajectory.prediction[trajectory.prediction.length - 1].high}` : 'N/A'}.`,
      confidence: trajectory.trend === 'critical' ? '78%' : '65%',
      severity: trajectory.trend === 'critical' ? 'critical' : 'warning',
      action: 'Consider increasing monitoring frequency and reassessing care plan.',
      timeframe: 'Next 8-12h',
    })
  } else {
    cards.push({
      id: 'pred-trajectory',
      headline: `Patient trajectory ${trajectory.trend} — acuity ${trajectory.currentAcuity}/100`,
      detail: `Projected acuity in 12h: ${future12h}/100. Trajectory is ${trajectory.trend === 'improving' ? 'trending toward stabilization' : 'within expected bounds'}.`,
      confidence: '70%',
      severity: 'info',
      action: trajectory.trend === 'improving' ? 'Continue current management. Consider step-down criteria.' : 'Maintain surveillance. No immediate escalation needed.',
      timeframe: 'Next 8-12h',
    })
  }

  // Worst body system card
  const worstSystem = [...trajectory.systems].sort((a, b) => b.now - a.now)[0]
  if (worstSystem && worstSystem.now >= 4) {
    const worsening = worstSystem.delta > 0.5
    cards.push({
      id: 'pred-system',
      headline: `${worstSystem.system} system ${worsening ? 'deteriorating' : 'elevated'} (${worstSystem.now.toFixed(1)}/10)`,
      detail: `${worstSystem.system} score is ${worstSystem.now.toFixed(1)}/10${worsening ? `, worsened from ${worstSystem.prior.toFixed(1)} over 12h` : ''}. This is the highest-risk organ system.`,
      confidence: worsening ? '72%' : '60%',
      severity: worstSystem.now >= 7 ? 'critical' : 'warning',
      action: `Focused ${worstSystem.system.toLowerCase()} assessment recommended. Review related diagnostics and interventions.`,
      timeframe: 'Next 4-8h',
    })
  } else {
    cards.push({
      id: 'pred-system',
      headline: 'All body systems within acceptable parameters',
      detail: 'No organ system scores exceed the moderate threshold. Multi-system assessment is stable.',
      confidence: '75%',
      severity: 'info',
      action: 'Standard monitoring protocol. Reassess per clinical judgment.',
      timeframe: 'Next 8-12h',
    })
  }

  // Monitoring recommendation card
  const improvingSystems = trajectory.systems.filter(s => s.delta < -0.5)
  const worseningSystems = trajectory.systems.filter(s => s.delta > 0.5)

  if (worseningSystems.length > 0) {
    cards.push({
      id: 'pred-monitoring',
      headline: `${worseningSystems.length} system${worseningSystems.length > 1 ? 's' : ''} trending adversely`,
      detail: `${worseningSystems.map(s => s.system).join(', ')} showing negative trend over 12h. Recommend targeted re-evaluation.`,
      confidence: '68%',
      severity: 'warning',
      action: `Order targeted diagnostics for ${worseningSystems.map(s => s.system.toLowerCase()).join(', ')}. Consider specialist consult if trend continues.`,
      timeframe: 'Next 4-6h',
    })
  } else if (improvingSystems.length > 0) {
    cards.push({
      id: 'pred-monitoring',
      headline: `Positive response in ${improvingSystems.length} system${improvingSystems.length > 1 ? 's' : ''}`,
      detail: `${improvingSystems.map(s => s.system).join(', ')} improving. Current interventions appear effective.`,
      confidence: '71%',
      severity: 'info',
      action: 'Continue current management. Document response to treatment.',
      timeframe: 'Next 8-12h',
    })
  } else {
    cards.push({
      id: 'pred-monitoring',
      headline: 'No significant system changes detected',
      detail: 'All body system deltas are within normal variation. Patient appears hemodynamically stable.',
      confidence: '73%',
      severity: 'info',
      action: 'Routine monitoring. Reassess at next scheduled interval.',
      timeframe: 'Next 8-12h',
    })
  }

  return cards
}
