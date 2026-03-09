# Predictive Insights — How the AI Analysis Works

> **Reference document** for the Trajectory Predictive Insights feature (Section 2 of the Patient Trajectory overlay).

---

## Overview

The **Predictive Insights** section generates 2–3 forward-looking clinical prediction cards that tell the practitioner what might happen next and what to do about it. This is the **only AI-powered section** in the Trajectory overlay — Sections 1 (Acuity Drivers) and 3 (Acuity Timeline) are pure math.

---

## Architecture

```
PatientTrajectory.tsx  (UI — lazy loads on overlay open)
        │
        ▼
trajectoryPredictions.ts  (orchestrator)
        │
        ├──► OpenAI API (gpt-4o-mini, temperature 0.3)
        │         └──► Returns JSON array of 3 prediction cards
        │
        └──► Local Fallback (if AI unavailable or fails)
                  └──► 3 rule-based cards from trajectory data
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Lazy-loaded** | Only called when user opens the overlay — zero impact on page load |
| **temperature: 0.3** | Low creativity, high determinism — clinical content needs consistency |
| **gpt-4o-mini** | Cost-efficient, fast response, sufficient for structured JSON output |
| **Local fallback** | App remains functional even without API key or on network failure |
| **3 cards max** | Practitioner attention is scarce — quality over quantity |

---

## How the AI Prompt Works

### System Prompt (Role Definition)

The AI is told it's a **clinical decision support system** and given strict rules:

1. Generate **exactly 3** prediction cards
2. Each must be **clinically grounded** in the provided data (no hallucination)
3. Include specific **timeframes** (e.g., "Next 4–8h", "Within 12h")
4. Include **confidence percentages** (conservative range: 50–85%)
5. Recommend **actionable interventions**
6. Card assignments:
   - One addresses the **highest-risk body system**
   - One addresses **overall trajectory direction**
   - One addresses a **specific intervention or monitoring need**
7. Output **only** a JSON array — no prose, no markdown

### User Prompt (Patient Context)

The following real patient data is passed in:

| Data Point | Source | Example |
|-----------|--------|---------|
| Current Acuity Index | `trajectoryEngine.ts` | `67/100 (Moderate)` |
| Trend direction | `trajectoryEngine.ts` | `worsening` |
| 12h predicted acuity | `trajectoryEngine.ts` | `74 (range: 58–90)` |
| Vitals | FHIR Observations | `HR: 110, BP: 209/113, RR: 22, SpO₂: 94%, Temp: 41°C` |
| Body system scores | `trajectoryEngine.ts` | `Cardiovascular: 8.2/10 (+1.3), Respiratory: 6.5/10 (+0.8)` |
| Risk scores | FHIR-derived | `NEWS2: 9, qSOFA: 2` |
| Active conditions | FHIR Conditions | `Hypertension, Type 2 Diabetes, Atrial Fibrillation` |
| Current medications | FHIR MedicationRequests | `Metformin, Lisinopril, Apixaban` |
| Lab trends | FHIR Observations | `Creatinine: 2.1 mg/dL (HIGH); Glucose: 245 mg/dL (HIGH)` |

### Expected AI Response

```json
[
  {
    "headline": "Cardiovascular decompensation risk elevated",
    "detail": "With systolic BP at 209 and HR 110, combined with worsening cardiovascular score (8.2/10, +1.3 from 12h ago), there is significant risk of hypertensive crisis or cardiac event.",
    "confidence": "76%",
    "severity": "critical",
    "action": "Urgent BP management. Consider IV antihypertensive. Continuous cardiac monitoring. Repeat troponin in 4h.",
    "timeframe": "Next 4-8h"
  },
  {
    "headline": "Acuity projected to reach high-risk threshold",
    "detail": "Current trajectory shows acuity moving from 67 to projected 74 within 12h. Confidence interval upper bound reaches 90, suggesting possible rapid deterioration.",
    "confidence": "65%",
    "severity": "warning",
    "action": "Increase monitoring frequency to q2h. Place ICU step-up on standby. Reassess care plan with attending.",
    "timeframe": "Next 8-12h"
  },
  {
    "headline": "Renal function requires serial monitoring",
    "detail": "Creatinine at 2.1 (elevated) with concurrent hypertension and diabetes. Risk of acute kidney injury given hemodynamic instability.",
    "confidence": "62%",
    "severity": "warning",
    "action": "Repeat BMP in 6h. Ensure adequate hydration. Avoid nephrotoxins. Urine output monitoring.",
    "timeframe": "Next 6-8h"
  }
]
```

---

## Response Parsing

After getting the AI response:

1. **Extract JSON** — regex match for `[...]` array in the response
2. **Validate severity** — must be `critical`, `warning`, or `info` (defaults to `info`)
3. **Limit to 3 cards** — truncate if AI returns more
4. **Assign unique IDs** — `pred-0`, `pred-1`, `pred-2`

```typescript
const jsonMatch = response.content.match(/\[[\s\S]*\]/)
const raw = JSON.parse(jsonMatch[0])
return raw.slice(0, 3).map((card, i) => ({
  id: `pred-${i}`,
  headline: card.headline,
  detail: card.detail,
  confidence: card.confidence,
  severity: validateSeverity(card.severity),
  action: card.action,
  timeframe: card.timeframe,
}))
```

---

## Local Fallback (No AI)

When OpenAI is unavailable (no API key, network error, or API failure), the system generates **3 rule-based cards** from trajectory math:

### Card 1 — Trajectory Direction

| Condition | Card Content |
|-----------|-------------|
| Critical / Worsening | "Acuity projected to reach {X} within 12h" — severity: critical/warning |
| Stable | "Patient trajectory stable — acuity {X}/100" — severity: info |
| Improving | "Patient trajectory improving" — severity: info |

### Card 2 — Worst Body System

| Condition | Card Content |
|-----------|-------------|
| Any system ≥ 4.0/10 | "{System} system deteriorating/elevated ({score}/10)" |
| All systems < 4.0 | "All body systems within acceptable parameters" |

### Card 3 — Monitoring Recommendation

| Condition | Card Content |
|-----------|-------------|
| Systems with delta > +0.5 | "{N} system(s) trending adversely" — names listed |
| Systems with delta < −0.5 | "Positive response in {N} system(s)" |
| No significant deltas | "No significant system changes detected" |

---

## UI Rendering

Each card renders with:

- **Severity color coding**: Red border (critical), Amber border (warning), Blue border (info)
- **Colored severity dot** next to the headline
- **Confidence badge**: Monospace font, right-aligned
- **Timeframe pill**: Slate background, subtle
- **Action block**: Colored text on slate-50 background, stands out as the call-to-action

---

## Performance Characteristics

| Metric | Value |
|--------|-------|
| API call | Single `POST /chat/completions` |
| Model | `gpt-4o-mini` (configurable via `VITE_OPENAI_MODEL`) |
| Temperature | 0.3 |
| Typical latency | 1.5–3s |
| Trigger | On overlay open (lazy) |
| Caching | None (predictions are contextual to current data) |
| Fallback latency | Instant (pure math) |
| Cost per call | ~$0.001–0.003 (mini model, short prompt) |

---

## Source Files

| File | Purpose |
|------|---------|
| `src/services/trajectory/trajectoryPredictions.ts` | Prompt construction, API call, response parsing, local fallback |
| `src/services/ai/openaiPlatform.ts` | OpenAI HTTP client, API key management, streaming support |
| `src/features/trajectory/PatientTrajectory.tsx` | UI rendering, lazy-load trigger on overlay open |
