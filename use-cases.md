# PractitionerHub — Use Case Discussion & Decisions

> This document captures all use case discussions, research findings, and decisions
> made during the planning phase. It serves as the rationale-of-record for why
> certain features were included, bundled, deferred, or rejected.

---

## 1. Context & Persona

- **App Type**: SMART on FHIR EHR Launch App (Provider Persona)
- **Target User**: Clinician / Practitioner / Provider
- **EHR**: Cerner (Oracle Health) Millennium Platform, FHIR R4
- **Guiding Principle**: _"I want to see a happy practitioner who can see some value in my app"_
- **Core Differentiator**: Must offer capabilities native EHR does NOT provide; must NOT repeat what patient-facing SMART apps already do
- **User Background**: Already built an Epic SMART patient-facing app — this app must be distinctly practitioner-focused with zero overlap

---

## 2. Key Research Findings

### 2.1 SMART v1 vs v2 Analysis
- App is registered as **SMART v2** on Cerner
- Cerner metadata returns **v1-style** endpoint URLs — this is expected
- Cerner supports **both** v1 and v2 scope syntax simultaneously
- v2 scope mapping: v1 `.read` → v2 `.rs`, v1 `.write` → v2 `.cud`
- **Decision**: Stay with v2, no re-registration needed

### 2.2 Multi-Patient Access Model
- **`patient/` scopes**: Locked to single in-context patient from EHR launch
- **`user/` scopes**: Access to ALL data the logged-in practitioner is authorized to see across multiple patients
- SMART spec: _"access to specific data that a user can access... this isn't just data about the user; it's data available to that user"_
- **Cerner limitation**: No `Encounter?practitioner=X` search parameter. Must search encounters by patient, then filter by practitioner in `Encounter.participant`
- **Cerner `Patient.generalPractitioner`**: Links patients to their primary provider (Practitioner resource reference)
- **Encounter participant roles** available: Attending Physician, Consulting Physician, Referring Physician, Covering Physician

### 2.3 Cerner FHIR Resource Inventory (35+ resources)
Full list confirmed with `patient/`, `user/`, and `system/` scopes:
Account, AllergyIntolerance, Appointment, Binary, CarePlan, CareTeam, ChargeItem, Communication, Condition, Consent, Coverage, Device, DiagnosticReport, DocumentReference, Encounter, FamilyMemberHistory, Goal, Immunization, InsurancePlan, Location, Media, MedicationAdministration, MedicationDispense, MedicationRequest, NutritionOrder, Observation, Organization, Patient, Person, Practitioner, Procedure, Provenance, Questionnaire, QuestionnaireResponse, RelatedPerson, Schedule, ServiceRequest, Slot, Specimen

### 2.4 Sandbox Data Assessment

**15 test patients**, **3 practitioners**, **4 locations**, scheduling data, financial data, COVID-19 test patients.

| Data Type | Coverage | Key Patients |
|-----------|----------|-------------|
| Vitals (BP, HR, Temp, RR, SpO2) | Good | Joe, Nancy, Wilma, Fredrick |
| Labs (lipids, CBC, metabolic panel) | Good | Fredrick (30+ results), Joe (lipid panel) |
| Conditions | Moderate | Wilma (5), Fredrick (6), Nancy (3), Timmy (2) |
| Medications | Sparse | Hailey (9 meds), Joe (2 meds) — most patients have none |
| Allergies | Good | Spread across Valerie (4), Timmy (3), Wilma, Joe, Sandy |
| Appointments | Almost empty | Every patient shows "None" |
| Documents | Minimal | Document types registered; few actual documents |

**Data Strategy**: Build a Phase 0 seeding script to POST realistic clinical data via FHIR write APIs (`Observation.crus`, `Encounter.crus`, `Appointment.crus`).

---

## 3. Use Cases — Approved

### UC-1: Multi-Patient Command Center (Dashboard Module)
**Status**: ✅ APPROVED — integrated into Dashboard with Risk Scores

**What it does**: Single-screen panel overview showing patients the logged-in practitioner is already authorized to view in Cerner. Panel membership is access-derived (read-only), and practitioners can pin/unpin a personal working shortlist without changing EHR access. Each patient card displays demographics, active conditions count, latest vitals snapshot, and color-coded clinical risk score badges.

**Why it's practitioner-only**: Patient apps show ONE patient's own data. This shows a practitioner's accessible panel (authorized EHR access only) — a population-level view that exists nowhere in patient-facing apps and is cumbersome in native EHR (requires clicking through each chart individually).

**Clinical Workflow**: Practitioner opens app at start of day/shift → immediately sees who needs attention first → sorted by severity.

**FHIR Resources Used**:
- Patient (demographics, `generalPractitioner`)
- Encounter (practitioner linkage via `participant`)
- Observation (vitals, labs for risk calculations)
- Condition (active problems for risk calculations)
- MedicationRequest (for ASCVD/drug-related scoring)
- Practitioner (logged-in user identity)

**Scope Requirements**: `user/Patient.rs`, `user/Encounter.rs`, `user/Observation.rs`, `user/Condition.rs`, `user/Practitioner.rs`, `openid`, `fhirUser`

**Technical Approach**:
1. Identify practitioner from `fhirUser` token claim
2. Use `user/` scopes to fetch encounters/patients the practitioner can access (read-only; no add/assign access changes)
3. For each patient, parallel-fetch latest vitals and active conditions
4. Calculate risk scores client-side from fetched data
5. Render sorted patient card grid with optional practitioner shortlist pin/unpin

**Integrated Risk Scores** (sub-feature, not standalone):

| Score | Purpose | Inputs (from FHIR) | Output |
|-------|---------|-------------------|--------|
| NEWS2 | Acute illness severity | HR, RR, SpO2, Temp, SBP, consciousness | 0-20 score, Low/Med/High |
| qSOFA | Sepsis screening | RR ≥22, altered mentation, SBP ≤100 | 0-3 score |
| ASCVD | 10-year cardiovascular risk | Age, gender, cholesterol, HDL, SBP, diabetes, smoking | Percentage |
| CHA₂DS₂-VASc | Stroke risk (atrial fib) | CHF, HTN, age, diabetes, stroke hx, vascular disease, sex | 0-9 score |

**Discussion Notes**:
- Originally proposed as separate "Clinical Risk Scoring Engine" use case
- Clinician willingness-to-pay analysis: ranked low as standalone (#4), but essential when integrated into dashboard
- MELD score deferred — Cerner sandbox lacks INR values
- Risk badges show "?" with gray color when insufficient data exists

---

### UC-2: AI Clinical Decision Assistant (AI Insights Module)
**Status**: ✅ APPROVED — bundled into AI Insights module

**What it does**: When practitioner drills into a specific patient, AI analyzes the complete FHIR record across multiple resources and surfaces:
- Drug-drug interaction alerts
- Drug-condition contraindications (e.g., metformin + eGFR < 30)
- Lab trend anomalies heading toward critical thresholds
- Clinical guideline-based suggestions
- Cross-resource insights that single-resource EHR alerts miss

**Why it's practitioner-only**: Requires cross-resource clinical reasoning that patient portals never perform. Acts as a safety net — reduces cognitive load during busy shifts. Also legally defensible ("my decision support system flagged this").

**FHIR Resources Used**:
- Patient, Observation (vitals + labs), Condition, MedicationRequest, AllergyIntolerance, DiagnosticReport, Immunization, Procedure, Encounter

**Scope Requirements**: All `patient/` read scopes for in-context patient data

**AI Architecture**:
- **Provider**: OpenAI Platform (GPT models) for prototype usage.
- **Data handling**: FHIR data structured into clinical context prompt; prototype may send PHI for testing and is not a production/HIPAA-ready posture.
- **System prompt**: Clinical decision support role with guidelines citation requirement; never makes definitive diagnoses — suggests considerations
- **Response format**: Structured JSON for UI rendering (not free text)

**Clinician WTP Ranking**: #2 — "It protects me" safety net value (~$30-50/month)

**Discussion Notes**:
- User confirmed Cloud AI (no hardware for local inference)
- Cross-resource reasoning is the key differentiator from native EHR alerts (which tend to be single-resource, high-false-positive)
- Must handle "insufficient data" gracefully for sparse patient records
- Optional post-MVP enhancement: feature-flagged agentic orchestration (read-only sequencing of fixed analysis steps), with no autonomous write-back

---

### UC-3: Smart Documentation Assistant (Smart Notes Module)
**Status**: ✅ APPROVED — bundled into Smart Notes module

**What it does**: AI generates SOAP note drafts from the patient's FHIR data:
- **S**ubjective: from conditions, encounter reason
- **O**bjective: today's vitals, recent labs, physical exam findings
- **A**ssessment: AI-synthesized clinical assessment combining conditions + data
- **P**lan: suggested next steps based on clinical guidelines

Also suggests ICD-10 codes based on documented conditions.

**Why it's practitioner-only**: Documentation is the #1 cause of physician burnout (2 hours EHR documentation per 1 hour of direct patient care). This is pure practitioner workflow optimization. Patient apps don't generate clinical notes.

**FHIR Resources Used**:
- Patient, Observation, Condition, MedicationRequest, AllergyIntolerance, Encounter, Procedure
- DocumentReference (write — to save generated notes back to FHIR)

**Scope Requirements**: All `patient/` read scopes + `patient/DocumentReference.crus` for saving notes

**AI Architecture**: Same OpenAI Platform service as UC-2 for prototype usage, with note-generation-specific prompts; prototype may send PHI for testing and is not production/HIPAA-ready. ICD-10 suggestion via SNOMED-to-ICD mapping + AI inference.

**Clinician WTP Ranking**: #1 — "This is getting home to see your kids an hour earlier" (~$50-100/month)

**Discussion Notes**:
- Highest willingness-to-pay among all use cases — saves 30-60 minutes per shift
- Generates FROM existing FHIR data, so works even with limited sandbox data
- Practitioner must always review/edit before saving — AI never auto-submits notes
- Each SOAP section independently regenerable
- Optional post-MVP enhancement: feature-flagged agentic orchestration for draft refinement (read-only context gathering + suggestion generation only)

---

## 4. Use Cases — Deferred

### UC-4: Scheduling & Workload Intelligence
**Status**: ⏸️ DEFERRED TO v2

**What it would do**: Pre-visit prep dashboard showing tomorrow's appointments with auto-pulled patient summaries. Post-visit task tracker. Schedule-based workload visualization.

**Current scope note**: Overdue/post-visit task tracking is out of current v1 bundle scope unless explicitly approved later.

**Why deferred**:
- Ranked #5 (lowest) in clinician willingness-to-pay
- Cerner sandbox has almost zero appointment data — every test patient shows "Appointments: None"
- Overlaps with existing clinic workflows (MAs handle pre-visit review, EHR has native task lists)
- Adds development complexity without proportional user delight
- Can be v2 feature to justify price increase ("We added pre-visit prep!")

**FHIR Resources**: Appointment, Schedule, Slot, Encounter

---

## 5. Use Cases — Rejected

| Use Case | Reason Rejected |
|----------|----------------|
| **Preventive Care Gap Analyzer** | Patient portals already send reminders for screenings/immunizations; overlaps heavily with patient-facing apps including user's own Epic app |
| **Family History Profiler** | Data-entry heavy; low unique practitioner value; FamilyMemberHistory resource rarely populated in sandbox |
| **Standalone Vital Signs Viewer** | This is what patient-facing apps already do (including user's Epic patient app); not differentiated for practitioner persona |
| **Standalone Risk Scoring App** | Low willingness-to-pay as standalone; much higher value when integrated INTO dashboard as visual badges |

---

## 6. Bundling Decision

### Decision: ONE Premium App, THREE Integrated Modules

```
PractitionerHub
├── Module 1: Dashboard (Command Center + Risk Scores)  — Home screen
├── Module 2: AI Insights (Clinical Decision Assistant)  — Patient detail screen
└── Module 3: Smart Notes (Documentation Assistant)       — Encounter closure screen
```

### Rationale

**Workflow alignment**: The three modules follow a natural clinical workflow:
1. **Start of day** → Dashboard: see accessible panel patients, identify priorities
2. **Select patient** → AI Insights: deep dive, review cross-resource analysis
3. **End encounter** → Smart Notes: generate documentation, close out
4. **Repeat** → back to Dashboard, next patient

**Single launch**: One SMART EHR launch = one OAuth flow = no context switching between apps

**Higher perceived value**: One app at $49-79/month vs three apps at $30/each ($90 total) — bundled feels like better deal

**Reduced app fatigue**: Clinicians want ONE tool they live in all day, not three tools to remember

### Pricing Analysis (from clinician perspective)

| Approach | Price | Clinician Reaction |
|----------|-------|-------------------|
| 3 separate apps @ $30/each | $90/month total | "Too many apps, too expensive" |
| 1 bundled app, 3 features | $79/month | "One app does everything? Worth it" |
| Free tier (Dashboard) + Paid (AI+Notes) | Free → $59/month | "Let me try... ok I'm hooked" |

---

## 7. A.1 Must-Have Requirements Coverage

These four requirements from requirement.md Section A.1 are non-negotiable and covered in Phase 1:

| A.1 Requirement | Implementation | Phase |
|---|---|---|
| Initiate launch automatically when opened | SMART EHR Launch with PKCE via `fhirclient` library | Phase 1 |
| Display Patient Banner (or not) per EHR token context | Conditional rendering based on `need_patient_banner` token flag | Phase 1 |
| List all current patient's vital signs | VitalsPanel component with LOINC-coded Observation queries | Phase 1 |
| Allow user to create new vital sign entries | RecordVitals modal form → POST Observation with `patient/Observation.crus` | Phase 1 |

---

## 8. Technical Research Summary

### SMART on FHIR Scopes
- **`patient/` scopes**: Locked to single patient from launch context. Used for in-context patient clinical data.
- **`user/` scopes**: Panel-wide access. SMART spec says: _"access to specific data that a user can access... this isn't just data about the user; it's data available to that user."_
- **`system/` scopes**: Backend service access — rejected for this app (too broad, not user-context-aware)

### Cerner API Capabilities Confirmed
- Encounter search params: `_count`, `_id`, `_lastUpdated`, `_revinclude`, `account`, `date`, `identifier`, `patient`, `status`, `subject` — NO `practitioner` param
- Patient search params: `_id`, `_count`, `name`, `family`, `given`, `identifier`, `birthdate`, `phone`, `email`, `gender`, `address-postalcode`
- Observation supports category filtering: `vital-signs`, `laboratory`
- CORS enabled for all origins
- JSON only (no XML support)
- Pagination via Bundle `next` links
- Observation coding can vary by site; implementation should support LOINC-first with fallback aliases/proprietary codes

### Vital Sign LOINC Codes (for Phase 1)
| Vital | LOINC Code |
|-------|-----------|
| Blood Pressure (panel) | 55284-4 |
| Systolic BP | 8480-6 |
| Diastolic BP | 8462-4 |
| Heart Rate | 8867-4 |
| Body Temperature | 8310-5 |
| Respiratory Rate | 9279-1 |
| Oxygen Saturation (SpO2) | 2708-6 |
| Height | 8302-2 |
| Weight | 29463-7 |
| BMI | 39156-5 |
