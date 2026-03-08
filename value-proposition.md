# Value Proposition: Why a Practitioner Would Pay for This App

## The Core Question

> What can a SMART on FHIR side-car app deliver in a **single patient context** that the
> native EHR (Cerner/Oracle Health, Epic, etc.) cannot — and would a practitioner pay for it?

---

## What the EHR Already Does Well (Don't Compete Here)

- Patient demographics, problem lists, med lists, allergy lists
- Order entry (meds, labs, imaging)
- Basic vital sign charting
- Scheduling, messaging, billing codes
- Basic CDS alerts (drug-allergy, duplicate order)

Practitioners won't pay for a second way to see what they already see. The value has
to come from **synthesis, intelligence, and time savings** that the EHR vendor hasn't
built (or has built poorly).

---

## The $-Value Framework

Every feature should pass this test:

| Lever | Question | $ Impact |
|-------|----------|----------|
| **Time saved** | Does it eliminate manual work the practitioner does today? | $3-7/min of clinician time saved |
| **Error avoided** | Does it catch something the practitioner might miss? | $10K-500K per avoided adverse event |
| **Revenue captured** | Does it surface billable codes or documentation gaps? | $50-200 per encounter uplift |
| **Burnout reduced** | Does it reduce cognitive load or after-hours charting? | Hard to quantify but drives adoption |

---

## High-Value Features — Ranked by Practitioner Impact

### 1. **Clinical Risk Snapshot** (Already Built — Phase 2)

**What it does**: Computes NEWS2, qSOFA, ASCVD, CHA₂DS₂-VASc from live FHIR data
in a single glance.

**Why EHRs don't do this well**: Most EHRs show raw vitals. They don't compute
composite early-warning scores and present them as an at-a-glance severity dashboard.
Practitioners manually mental-math NEWS2 during rounds.

**$ Value**:
- NEWS2 automation saves ~30 seconds per patient encounter × 20 patients/day = **10 min/day**
- qSOFA catch of sepsis risk → early intervention saves **$20K-50K** per missed sepsis case
- Estimated value: **$150-300/month** in time savings alone

**Status**: ✅ Complete — vitals tiles + risk badges + detail cards

---

### 2. **AI-Powered Clinical Decision Support** (Phase 3 — Planned)

**What it does**: Analyzes the patient's full clinical picture (conditions, meds,
labs, vitals, allergies) and surfaces:
- Drug-drug interactions the EHR's basic CDS missed (complex multi-drug)
- Lab trends heading toward critical thresholds (with projected dates)
- Guideline-based recommendations personalized to this patient's comorbidities

**Why EHRs don't do this well**: EHR CDS is rule-based and fires too many
low-value alerts (alert fatigue). EHRs check pairwise drug interactions but miss
complex multi-drug scenarios. They don't project lab trends or correlate conditions
with guideline recommendations contextually.

**$ Value**:
- Drug interaction catch: **$10K-100K** per prevented adverse drug event
- Lab trend prediction: earlier intervention saves **$5K-20K** per prevented ICU admission
- Alert fatigue reduction: practitioners dismiss 50-90% of EHR CDS alerts.
  An AI that only fires meaningful alerts is worth **$200-500/month** in cognitive load savings
- Estimated value: **$500-1,000/month** per practitioner

---

### 3. **Smart Documentation / SOAP Note Generation** (Phase 4 — Planned)

**What it does**: Auto-generates a complete SOAP note from the patient's FHIR data,
with:
- Pre-filled Subjective, Objective, Assessment, Plan sections
- Per-section regeneration and manual editing
- ICD-10 code suggestions with confidence scores
- One-click save to FHIR as DocumentReference

**Why EHRs don't do this well**: Documentation is the #1 driver of physician burnout.
EHR templates are static and require manual filling. Most EHRs have no AI-assisted
documentation natively. Practitioners spend 2+ hours/day on documentation.

**$ Value**:
- Average SOAP note takes 5-10 minutes manually. AI draft reduces to 1-2 minutes review.
  At 20 patients/day: **60-160 minutes saved daily**
- At $3-5/min for physician time: **$180-800/day** → **$4,000-16,000/month**
- ICD-10 code capture: surfacing missed billable codes adds **$50-200/encounter**
- This is the **single highest-value feature** in the entire app
- Estimated value: **$4,000-16,000/month** per practitioner

---

### 4. **Vitals Trend Micro-Charts** (Enhancement to Phase 2 — Not Yet Built)

**What it does**: Inline sparkline charts next to each vital showing the last 5-10
readings over time. At a glance, the practitioner sees: is blood pressure trending up?
Is SpO2 declining? Is temperature spiking?

**Why EHRs don't do this well**: Most EHRs show vitals as a flat table or a single
latest value. Seeing a trend requires clicking into a separate flowsheet view, finding
the right parameter, and mentally plotting the trajectory.

**$ Value**:
- Trend recognition 5-10 seconds faster per vital × 5 vitals × 20 patients = **8-16 min/day**
- Pattern recognition (declining SpO2 over 3 days) → early intervention
- Estimated value: **$100-200/month** (mostly time + cognitive load)

**Implementation effort**: S (1-2 days) — pure SVG sparklines, data already fetched

---

### 5. **Contextual Guideline References** (Enhancement to Phase 2/3)

**What it does**: Based on the patient's conditions and risk scores, surfaces
relevant clinical guideline snippets:
- "AHA/ACC 2019: For ASCVD risk >7.5%, consider moderate-intensity statin"
- "Surviving Sepsis 2021: qSOFA ≥2 — initiate sepsis workup within 1 hour"
- "ESC 2020: CHA₂DS₂-VASc ≥2 in males — recommend OAC therapy"

**Why EHRs don't do this**: EHR CDS fires generic alerts. It doesn't say "because
this patient's ASCVD is 12%, AHA guideline X section Y recommends Z." The
practitioner has to look up guidelines separately.

**$ Value**:
- Guideline adherence improvement: reduces malpractice risk, improves outcomes
- Time saved looking up guidelines: ~2-3 min/encounter for complex patients
- Estimated value: **$200-400/month** per practitioner

---

### 6. **Documentation Quality Score** (Enhancement to Phase 4)

**What it does**: Before saving a note, the AI scores the documentation for:
- Completeness (are all SOAP sections filled?)
- Specificity (are conditions documented at highest specificity ICD-10 level?)
- Medical necessity justification strength
- Missing problem terms that should be documented based on the clinical data

**Why EHRs don't do this**: EHRs do post-hoc coding audits. They don't give
real-time feedback to the practitioner while they're still in the note.

**$ Value**:
- Higher specificity coding directly increases reimbursement: **$50-300/encounter**
- Reduced claim denials: average denial costs $25-50 to rework
- Estimated value: **$1,000-6,000/month** per practitioner

---

## Value Summary Table

| Feature | Phase | Status | Monthly $/Practitioner | Build Effort |
|---------|-------|--------|----------------------|--------------|
| Clinical Risk Snapshot | 2 | ✅ Done | $150-300 | — |
| Vitals Trend Sparklines | 2+ | Not built | $100-200 | S (1-2d) |
| Contextual Guidelines | 2/3 | Not built | $200-400 | S-M (2-3d) |
| AI Clinical Decision Support | 3 | Planned | $500-1,000 | L (5-8d) |
| Smart SOAP Note Generation | 4 | Planned | $4,000-16,000 | M-L (4-6d) |
| Documentation Quality Score | 4+ | Not built | $1,000-6,000 | M (2-4d) |
| **Total potential** | | | **$5,950-23,900/mo** | |

---

## What Would Make a Practitioner *Demand* This App?

The killer combination is **Phases 3+4 together**: AI insights + smart documentation.

Here's why:

1. **The practitioner opens your app** because it shows them risk scores they can't
   see in the EHR (Phase 2). This is the **hook**.

2. **They stay in your app** because the AI surfaces a drug interaction or lab trend
   they didn't notice (Phase 3). This builds **trust**.

3. **They can't live without your app** because it writes their notes for them
   (Phase 4). This creates **dependency**.

The note generation alone is worth more than everything else combined. A practitioner
who saves 1-2 hours of documentation per day will fight to keep this app. That's the
"force them to consider" value.

---

## Recommended Build Priority

1. ✅ Phase 2 — Clinical Dashboard (DONE — the hook)
2. **Phase 2.5 — Vitals Trend Sparklines** (1-2 days — quick visual win)
3. **Phase 3 — AI Clinical Decision Support** (5-8 days — builds trust)
4. **Phase 4 — Smart SOAP Notes** (4-6 days — creates dependency)
5. **Phase 4.5 — Documentation Quality Score** (2-4 days — maximizes revenue capture)

Total remaining effort: ~14-22 days to build a **$6K-24K/month per practitioner** value proposition.

---

## Competitive Positioning

| Competitor | What They Do | What We Do Better |
|-----------|-------------|-------------------|
| **Native EHR CDS** | Rule-based alerts, high alert fatigue | AI-powered, contextual, low-noise |
| **Nuance DAX** | Ambient listening → notes | We work from structured FHIR data (more reliable than audio transcription for accuracy) |
| **Abridge** | Audio → clinical documentation | Same as above — plus we integrate risk scores |
| **Suki** | Voice-based note generation | We don't require voice — works silently during rounds |
| **None of them** | Embedded in EHR workflow via SMART | We launch from within the EHR — zero context switching |

The SMART on FHIR launch is our moat: we're **inside the EHR**, not a separate app.
The practitioner never leaves their workflow. That's the fundamental UX advantage.

---

## Pricing Model Suggestion

| Tier | Features | Price |
|------|----------|-------|
| **Free** | Risk scores dashboard only (Phase 2) | $0 |
| **Pro** | + AI insights + trend charts | $99-199/mo |
| **Enterprise** | + Smart notes + ICD suggestions + quality score | $499-999/mo |

At $499/mo for a tool that saves $5K-16K/mo in physician time, the ROI is 10-30x.
That's an easy sell to any practice or health system.
