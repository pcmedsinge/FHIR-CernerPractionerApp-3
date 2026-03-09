# PractitionerHub — Extension Implementation Plan

## Feature: AI Clinical Copilot ("Chat With the Chart")

### Vision
Transform PractitionerHub from a read-only clinical dashboard into an **interactive AI assistant** that already knows the patient. The practitioner asks natural-language questions and receives patient-specific clinical reasoning — no copy-paste, no context switching.

> *"Instead of reading a dashboard, you talk to it."*

### Why This Is Groundbreaking
- **Context-aware from the start**: Unlike ChatGPT, the Copilot already has the patient's vitals, conditions, medications, allergies, labs, and risk scores loaded. Zero manual data entry.
- **Clinical decision support that gets used**: Traditional CDS = rule-based pop-ups that get dismissed 96% of the time. Conversational CDS = the practitioner asks when they need it.
- **No synthetic data required**: Uses the exact same real FHIR data already loaded by the Briefing tab.
- **Zero risk to existing app**: Lives in a separate tab — Briefing code is completely untouched.

---

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  AppShell Header                                      │
│  [Briefing] [AI Copilot]              Patient Banner  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Tab = "Briefing"  → PatientBriefing (unchanged)     │
│  Tab = "Copilot"   → ClinicalCopilot (new)           │
│                                                       │
└──────────────────────────────────────────────────────┘
```

**Key Principle**: The Copilot shares data with Briefing via the same `usePatientBriefing` hook — no duplicate FHIR fetches.

---

### UI Design

#### Layout
- **Top area**: Context-aware quick-ask prompt chips (dynamically ordered by patient acuity)
- **Chat area**: Scrollable conversation thread (user bubbles + AI response cards)
- **Bottom**: Free-text input + Send button

#### Quick-Ask Prompt Categories

**Clinical Decision Support:**
- "Is this patient a candidate for anticoagulation?"
- "What drug interactions should I watch for?"
- "Summarize the clinical picture for handoff"

**Diagnosis & Workup:**
- "What could explain the abnormal vitals?"
- "What additional labs should I order?"
- "Differential diagnosis for this presentation"

**Documentation:**
- "Draft a referral letter to Pulmonology"
- "Write discharge instructions for this patient"
- "Summarize this encounter for the patient's family"

**Guideline Checks:**
- "Is this patient meeting sepsis criteria?"
- "What does AHA recommend for this risk profile?"
- "Any missing preventive care?"

**Context-Aware Ordering**: If NEWS2 is high → sepsis/deterioration prompts surface first. If patient has AFib → anticoagulation prompts surface. If SpO₂ is low → respiratory prompts surface.

#### AI Response Format
- Structured markdown-like rendering (headers, bullet points, bold key terms)
- Clinical citations where applicable (e.g., "Per AHA 2024 Guidelines…")
- [CRITICAL] and [WARNING] tag highlighting (reuse existing NotePreview styling)
- Streaming responses (reuse existing `chatCompletionStream`)

---

### Technical Implementation

#### New Files
```
src/features/copilot/
  ClinicalCopilot.tsx        — Main copilot component (chat UI + prompt chips)
  CopilotMessage.tsx         — Individual message bubble/card renderer
  copilotPrompts.ts          — Prompt chip definitions + context-aware ordering
  copilotService.ts          — System prompt + context injection + chat history
```

#### Modified Files
```
src/App.tsx                  — Add tab bar, conditionally render Briefing or Copilot
src/components/AppShell.tsx  — Support tab navigation in header
```

#### NOT Modified
```
src/features/briefing/*      — ZERO changes
src/hooks/usePatientBriefing.ts — ZERO changes (shared, read-only consumption)
src/services/ai/*            — Reuse existing OpenAI streaming infrastructure
```

#### Data Flow
```
usePatientBriefing (existing hook)
       │
       ├── PatientBriefing (Briefing tab — unchanged)
       │
       └── ClinicalCopilot (Copilot tab — new)
               │
               ├── Reads: data.clinicalSummary, data.riskScores, data.insights, etc.
               │
               ├── Builds system prompt with full patient context
               │
               └── Streams OpenAI responses via chatCompletionStream (existing)
```

#### System Prompt Strategy
The copilot system prompt includes:
1. Role: "You are a clinical decision support assistant for a practitioner"
2. Full patient context: vitals, conditions, meds, allergies, labs, risk scores
3. Rules: cite guidelines, never fabricate data, flag uncertainty, use clinical language
4. Conversational history: maintains multi-turn context within the session

---

### Estimation
- **Implementation**: ~2-3 hours
- **Risk to existing features**: Zero (separate tab, no shared mutable state)
- **Dependencies**: Existing OpenAI key, existing FHIR data from hook

---

### Production Enhancements (Future)
In a production deployment, the Copilot could additionally support:
- **Voice input** (Whisper API for dictation)
- **Multi-patient context** ("Compare this patient's trajectory with similar cases")
- **Order entry integration** ("Order this lab" → pre-fill CPOE)
- **Audit trail** (log all AI interactions for compliance)
- **RAG with hospital protocols** (ground responses in institution-specific guidelines)
- **Specialty-specific prompt libraries** (Cardiology, Pulmonology, etc.)
