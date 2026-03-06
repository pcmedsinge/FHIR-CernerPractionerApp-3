# PractitionerHub — Implementation Plan

> Phased implementation plan for a SMART on FHIR EHR Launch app (Provider Persona)
> targeting Cerner (Oracle Health) Millennium Platform, FHIR R4.
>
> **Pre-requisite**: Review and approve `agent.md` and `use-cases.md` before starting.
> **Reference Links**: See `Cerner FHIR ref .md` for SMART/Cerner endpoint and API documentation URLs.

---

## Overview

**App Name**: PractitionerHub
**Architecture**: Single React SPA with 3 integrated modules (Dashboard, AI Insights, Smart Notes)
**Tech Stack**: React + TypeScript + Vite + Tailwind CSS + OpenAI Platform
**Must-Have**: All four Section A.1 requirements from requirement.md

## Phase Tracking Board

- **Phase 0 — Project Scaffolding & Data Seeding**
  - Status: Not Started
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 1 — SMART Auth + A.1 Must-Haves**
  - Status: Not Started
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 2 — Dashboard (Command Center + Risk Scores)**
  - Status: Not Started
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 3 — AI Insights (Clinical Decision Assistant)**
  - Status: Not Started
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 4 — Smart Notes (Documentation Assistant)**
  - Status: Not Started
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 5 — Polish, Integration & End-to-End Testing**
  - Status: Not Started
  - Owner: TBD
  - Target Date: TBD
  - Notes: —

---

## QA Fixture Baseline (Acceptance Testing)

Use these canonical fixtures for deterministic verification across phases.

### Practitioner Fixtures

- **Applegate MD, Christina** (`Practitioner/593923`) — Primary launch + panel derivation tests
- **Martin, MD, Mary Cerner** (`Practitioner/11724002`) — Secondary practitioner coverage
- **Porter, Andy Cerner** (`Practitioner/4122620`) — Secondary practitioner coverage

### Patient Fixtures

- **SMART, Fredrick** (`12724070`) — Profile: Rich; Usage: Labs, conditions, risk scores, notes richness
- **SMART, Joe** (`12724067`) — Profile: Medium-Rich; Usage: Vitals CRUD, lipid trends, navigation baseline
- **SMART, Hailey** (`12724068`) — Profile: Rich medications; Usage: Interaction-heavy AI checks
- **SMART, Nancy** (`12724066`) — Profile: Medium; Usage: Supplemental panel/risk coverage
- **SMART, Wilma** (`12724065`) — Profile: Medium; Usage: Supplemental panel/risk coverage
- **SMART, Valerie** (`12724071`) — Profile: Medium; Usage: Allergy/microbiology coverage

### Sparse Fixtures (ID Confirmation Required)

- Sandy (sparse-data scenario)
- Timmy (sparse-data note-generation scenario)

---

## Phase 0 — Project Scaffolding & Data Seeding
**Estimated Effort**: S (1-2 days)
**Dependencies**: None

### 0.1 Initialize Project
1. Initialize Vite + React + TypeScript project:
   ```bash
   npm create vite@latest . -- --template react-ts
   ```
2. Install core dependencies:
   ```bash
   npm install fhirclient @types/fhir tailwindcss @tailwindcss/vite react-router-dom
   ```
3. Configure Tailwind CSS with medical-grade design system:
   - Color palette: clinical blues (`#1e40af`, `#3b82f6`), greens (`#16a34a`),
     severity reds (`#dc2626`), yellows (`#f59e0b`), neutral grays
   - Typography: Inter font family (or system font stack)
   - Shared component tokens: card radius, shadow levels, badge sizes
   - Layout: `h-screen` based, `overflow-hidden` globally

### 0.2 Project Structure
```
src/
├── auth/                    # SMART launch + token management
│   ├── launch.ts            # Entry: calls FHIR.oauth2.authorize()
│   ├── callback.ts          # Post-auth: exchanges code for token
│   └── AuthProvider.tsx     # React context for auth state
├── components/              # Shared UI components
│   ├── PatientBanner.tsx    # Conditional patient banner (A.1 Req 2)
│   ├── VitalCard.tsx        # Individual vital sign display card
│   ├── Badge.tsx            # Status/severity badge
│   ├── Modal.tsx            # Reusable modal wrapper
│   ├── Toast.tsx            # Success/error notifications
│   ├── LoadingSkeleton.tsx  # Loading placeholder
│   └── AppShell.tsx         # Main layout with navigation
├── features/
│   ├── dashboard/           # Module 1: Command Center + Risk Scores
│   │   ├── CommandCenter.tsx
│   │   ├── PatientCard.tsx
│   │   ├── PatientList.tsx
│   │   ├── VitalsPanel.tsx  # Vital signs list (A.1 Req 3)
│   │   ├── RecordVitals.tsx # Create vitals form (A.1 Req 4)
│   │   └── RiskBadge.tsx
│   ├── insights/            # Module 2: AI Clinical Decision Assistant
│   │   ├── InsightsView.tsx
│   │   ├── InsightCard.tsx
│   │   └── LabTrendChart.tsx
│   └── notes/               # Module 3: Smart Documentation Assistant
│       ├── NotesView.tsx
│       ├── SOAPEditor.tsx
│       └── ICDPanel.tsx
├── hooks/                   # Custom React hooks
│   ├── useFhirClient.ts
│   ├── usePatient.ts
│   └── usePanelPatients.ts
├── services/
│   ├── fhir/                # FHIR API service layer
│   │   ├── client.ts        # Authenticated FHIR client singleton
│   │   ├── observations.ts  # Vital signs + labs CRUD
│   │   ├── conditions.ts    # Condition queries
│   │   ├── medications.ts   # MedicationRequest queries
│   │   ├── allergies.ts     # AllergyIntolerance queries
│   │   ├── encounters.ts    # Encounter queries
│   │   ├── patients.ts      # Patient search + read
│   │   ├── practitioner.ts  # Practitioner identity
│   │   ├── documents.ts     # DocumentReference CRUD
│   │   └── patientSummary.ts # Aggregated multi-resource fetch
│   └── ai/                  # AI integration layer
│       ├── openaiPlatform.ts   # OpenAI Platform client wrapper
│       ├── clinicalAnalysis.ts # Drug interactions, lab trends
│       └── noteGenerator.ts # SOAP note generation
├── types/                   # TypeScript interfaces
│   ├── fhir.ts              # FHIR resource type extensions
│   ├── app.ts               # App-specific types
│   └── riskScores.ts        # Risk score input/output types
└── utils/                   # Pure utility functions
    ├── risk-scores/
    │   ├── news2.ts         # NEWS2 calculator
    │   ├── qsofa.ts         # qSOFA calculator
    │   ├── ascvd.ts         # ASCVD 10-year risk calculator
    │   └── cha2ds2vasc.ts   # CHA₂DS₂-VASc calculator
    ├── formatters.ts        # Date, unit, name formatters
    └── validators.ts        # Clinical range validators
```

### 0.3 Environment Configuration
Create `.env` with all values from requirement.md Section B:
```env
VITE_FHIR_BASE_URL=https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d
VITE_CLIENT_ID=66037bbc-cc54-405b-b3fd-5fbeaeac4251
VITE_REDIRECT_URI=http://127.0.0.1:5173
VITE_AUTH_ENDPOINT=https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/personas/provider/authorize
VITE_TOKEN_ENDPOINT=https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token
VITE_SCOPES=launch openid fhirUser offline_access patient/Patient.rs patient/Observation.crus patient/Condition.rs patient/MedicationRequest.rs patient/AllergyIntolerance.rs patient/Encounter.rs patient/Procedure.rs patient/DocumentReference.crus user/Patient.rs user/Encounter.rs user/Observation.rs user/Condition.rs user/Practitioner.rs
VITE_OPENAI_API_KEY=<to-be-configured>
VITE_OPENAI_MODEL=<to-be-configured>
VITE_OPENAI_ORG_ID=<optional>
```

Also create `.env.example` (same file without secrets, committed to git).

### 0.4 Data Seeding + Write Smoke Tests (Required before Phase 1)
Create `scripts/seed-data.ts`:
- Uses authenticated FHIR client with `user/` scopes
- POSTs realistic Observations (vitals + labs) to patients with sparse data
- Creates Encounter resources linking practitioners to patients
- Seeds 2-3 Appointments per patient (for future v2 scheduling)
- Target patients: Joe, Fredrick, Nancy, Wilma, Hailey, Valerie
- Idempotent: checks existing data before creating duplicates
- Includes mandatory write smoke test for `Observation` create/read-back (A.1 requirement gate)
- Records smoke test result log; Phase 1 cannot start until write smoke test passes

### 0.5 Verification Criteria
- [ ] `npm run dev` starts without errors on `http://127.0.0.1:5173`
- [ ] Tailwind classes render correctly
- [ ] Project structure matches above layout
- [ ] `.env` populated with all Section B values
- [ ] TypeScript strict mode enabled, no `any` types
- [ ] Cerner app scope registration is complete (all scopes listed in `agent.md`) before Phase 1 entry
- [ ] Observation write smoke test passes in Cerner sandbox (create + verify retrieval)

---

## Phase 1 — SMART Auth + A.1 Must-Haves
**Estimated Effort**: M (3-5 days)
**Dependencies**: Phase 0 + scope registration complete
**Covers**: ALL four Section A.1 requirements from requirement.md

### 1.1 SMART EHR Launch — A.1 Requirement 1: "Initiate launch automatically when opened"

**File**: `src/auth/launch.ts`

Implementation:
1. Entry point that calls `FHIR.oauth2.authorize()`
2. Reads `iss` and `launch` from URL query params (provided by EHR during launch)
3. Configuration:
   ```typescript
   FHIR.oauth2.authorize({
     clientId: import.meta.env.VITE_CLIENT_ID,
     scope: import.meta.env.VITE_SCOPES,
     redirectUri: import.meta.env.VITE_REDIRECT_URI,
     // aud parameter — Cerner REQUIRES this (= FHIR base URL)
     // fhirclient sets this automatically from iss, but we ensure it explicitly
   });
   ```
4. Uses PKCE automatically (public app, no client secret)
5. If `fhirclient` auto-discovery returns different auth/token URLs than Section B
   values (due to v1 metadata), override with `.env` values:
   ```typescript
   // Fallback: if metadata discovery fails or returns unexpected URLs,
   // provide explicit endpoints from Section B
   FHIR.oauth2.authorize({
     clientId: import.meta.env.VITE_CLIENT_ID,
     scope: import.meta.env.VITE_SCOPES,
     redirectUri: import.meta.env.VITE_REDIRECT_URI,
     iss: issFromQueryParam,
     launch: launchFromQueryParam,
     // Explicit overrides from Section B if needed:
     authorizeUrl: import.meta.env.VITE_AUTH_ENDPOINT,
     tokenUrl: import.meta.env.VITE_TOKEN_ENDPOINT,
   });
   ```

**File**: `src/auth/callback.ts`
1. Calls `FHIR.oauth2.ready()` to complete token exchange
2. Extracts from token response:
   - `fhirUser` → Practitioner ID (e.g., `Practitioner/593923`)
   - `patient` → in-context patient ID (may be null for provider-only launch)
   - `need_patient_banner` → boolean flag from EHR
3. Stores auth state in React context

**File**: `src/auth/AuthProvider.tsx`
1. React Context providing to entire app:
   - `fhirClient` — authenticated FHIR client instance
   - `practitionerId` — extracted from `fhirUser` claim
   - `patientId` — in-context patient (can be null)
   - `needPatientBanner` — boolean from token
   - `isAuthenticated` — auth state flag
   - `error` — auth error state

**Routing**:
```
/launch  → triggers FHIR.oauth2.authorize()
/        → main app (post-auth), wrapped in AuthProvider
```

### 1.2 Conditional Patient Banner — A.1 Requirement 2: "Display Patient Banner (or not) depending on EHR token context"

**File**: `src/components/PatientBanner.tsx`

Implementation:
1. Reads `needPatientBanner` and `patientId` from AuthContext
2. If `needPatientBanner === true` AND `patientId` exists:
   - Fetches `Patient/{patientId}` via FHIR client
   - Renders compact top bar (fixed height ~48px) with:
     - Patient full name (family, given)
     - Date of birth + calculated age
     - Administrative gender
     - MRN (from `identifier` with system matching Cerner MRN)
   - Styling: dark header (`bg-slate-800`) with white text
3. If `needPatientBanner === false` OR `patientId` is null:
   - Returns `null` — banner not rendered
   - Full viewport height available to content below
4. Handles loading state (skeleton) and error state (fetch failure)

### 1.3 List Vital Signs — A.1 Requirement 3: "List all of the current patient's vital signs"

**File**: `src/services/fhir/observations.ts`

`getVitalSigns(patientId: string)` method:
1. Fetches `Observation?patient={patientId}&category=vital-signs&_sort=-date&_count=100`
2. Handles LOINC codes:
   | Vital | LOINC | Component Notes |
   |-------|-------|----------------|
   | Blood Pressure | 55284-4 | Panel with components 8480-6 (systolic) + 8462-4 (diastolic) |
   | Heart Rate | 8867-4 | |
   | Body Temperature | 8310-5 | |
   | Respiratory Rate | 9279-1 | |
   | SpO2 | 2708-6 | |
   | Height | 8302-2 | |
   | Weight | 29463-7 | |
   | BMI | 39156-5 | |
  LOINC/Cerner coding cautions:
  - Use LOINC-first matching, but support fallback aliases when LOINC is missing or partially populated.
  - Support multiple codings in `Observation.code.coding[]` and evaluate all codings before classifying.
  - Prefer `category=vital-signs` + profile hints + BP component parsing, not only code equality.
  - Maintain a configurable vital-code map that supports Cerner proprietary/local codes per tenant/site.
3. Handles Cerner pagination (follows `Bundle.link[relation=next]`)
4. Deduplicates by resource ID (Cerner may return duplicates across pages)
5. Groups by vital type, sorts each group by date descending
6. Returns typed `VitalSignGroup[]`

**File**: `src/features/dashboard/VitalsPanel.tsx`

1. Full viewport card-grid layout (CSS Grid, no scrollbar)
2. Each vital type → its own card showing:
   - Vital name + icon
   - Latest value + unit + timestamp
   - Normal range indicator (green/yellow/red based on clinical ranges)
   - Mini sparkline: last 5 readings as an SVG trend line
3. Empty state: "No vital signs recorded for this patient"
4. Loading state: skeleton cards matching card dimensions
5. Error state: retry button with error message

### 1.4 Create Vital Signs — A.1 Requirement 4: "Allow the user to create new vital sign entries"

**File**: `src/features/dashboard/RecordVitals.tsx`

1. Opens as a **modal overlay** (no page navigation — preserves no-scroll constraint)
2. Trigger: "+ Record Vitals" button on VitalsPanel
3. Input fields:
   | Field | Unit Options | Validation Range |
   |-------|-------------|-----------------|
   | Systolic BP | mmHg | 50-300 |
   | Diastolic BP | mmHg | 20-200 |
   | Heart Rate | bpm | 20-300 |
   | Temperature | °C / °F toggle | 30-45°C / 86-113°F |
   | Respiratory Rate | br/min | 4-60 |
   | SpO2 | % | 50-100 |
   | Height | cm / in toggle | 20-300cm |
   | Weight | kg / lb toggle | 0.5-500kg |
4. Auto-conversion between unit systems (°C↔°F, cm↔in, kg↔lb)
5. Pre-fills date/time with current timestamp, allows manual override
6. All fields optional — practitioner records only what they have
7. Validation: real-time clinical range checks with warning for extreme values
8. Submit → calls `createVitalSign()` for each non-empty field

**File**: `src/services/fhir/observations.ts`

`createVitalSign(patientId, vitalType, value, unit, dateTime)` method:
1. Constructs FHIR `Observation` resource:
   ```json
   {
     "resourceType": "Observation",
     "status": "final",
     "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
     "code": { "coding": [{ "system": "http://loinc.org", "code": "<LOINC>", "display": "<name>" }] },
     "subject": { "reference": "Patient/<patientId>" },
     "effectiveDateTime": "<ISO timestamp>",
     "valueQuantity": { "value": <number>, "unit": "<unit>", "system": "http://unitsofmeasure.org", "code": "<UCUM>" }
   }
   ```
2. Special handling for Blood Pressure (component observation):
   - Code: 55284-4
   - Two components: systolic (8480-6) + diastolic (8462-4) in same resource
3. POSTs to `{baseUrl}/Observation` with `patient/Observation.crus` scope
4. Returns created resource on 201 success
5. On success: Toast notification + VitalsPanel auto-refreshes

**File**: `src/components/Toast.tsx`
- Success: "Vital signs recorded successfully" (green, auto-dismiss 3s)
- Error: user-friendly message based on HTTP status (422/401/400/500)

### 1.5 Verification Criteria (Given/When/Then)

- **P1-01** — Given app opens from EHR SMART launch URL with valid `iss` + `launch`; when auth bootstrap runs; then authorization starts automatically.
- **P1-02** — Given PKCE authorization completes; when callback is processed; then access token is stored and `fhirUser` resolves.
- **P1-03** — Given token includes in-context patient and `need_patient_banner=true`; when app shell renders; then patient banner is visible.
- **P1-04** — Given token has `need_patient_banner=false` or no patient context; when app shell renders; then banner is hidden without layout break.
- **P1-05** — Given valid in-context patient; when vitals query runs; then VitalsPanel loads mapped current-patient vitals without errors.
- **P1-06** — Given sparse/missing vitals; when VitalsPanel renders; then explicit empty/limited-data state is shown.
- **P1-07** — Given practitioner submits valid vital entry; when create runs; then Observation POST succeeds and vital appears after refresh.
- **P1-08** — Given practitioner submits temperature in °F; when payload normalization runs; then stored unit handling and displayed normalized value are correct.
- **P1-09** — Given invalid/incomplete vital form input; when submit is attempted; then submit is blocked with field-level validation guidance.
- **P1-10** — Given session token expires during active use; when next protected API call runs; then refresh/re-auth recovers session without crash.
- **P1-11** — Given testing at `1920x1080`, `1366x768`, `1280x720`; when Phase 1 screens are exercised; then no viewport scrollbars appear and primary actions stay accessible.
- **P1-12** — Given Cerner returns 403 for missing-scope scenario; when protected request is attempted; then user sees clear insufficient-permissions guidance.

### 1.6 Fixture Mapping

- **P1-01, P1-02, P1-03, P1-04, P1-10, P1-12** → Practitioner launch fixture (`Practitioner/593923`)
- **P1-05, P1-07, P1-08, P1-09, P1-11** → Joe (`12724067`)
- **P1-06** → Sandy (ID confirmation required)

---

## Phase 2 — Dashboard: Multi-Patient Command Center + Risk Scores
**Estimated Effort**: L (5-8 days)
**Dependencies**: Phase 1 (auth + FHIR service layer)

### 2.1 Practitioner Panel Identification

**File**: `src/services/fhir/practitioner.ts`

`getPractitioner(practitionerId)`:
- Fetches `Practitioner/{id}` to get logged-in practitioner details (name, role)

`getPanelPatients(practitionerId)`:
- **Strategy A**: Fetch recent Encounters via `user/Encounter.rs` scope
  - `Encounter?status=in-progress,finished&_count=50&_sort=-date`
  - Extract unique patient references from `Encounter.subject`
  - Filter encounters where `Encounter.participant` contains the logged-in practitioner
- **Strategy B**: Search Patients via `user/Patient.rs` scope
  - Fetch patients, check `Patient.generalPractitioner` for practitioner match
- Combine both strategies, deduplicate by patient ID
- Return `PanelPatient[]` with demographics
- Read-only panel derivation only: do not create/assign practitioner-patient access relationships

**File**: `src/hooks/usePanelPatients.ts`
- React hook wrapping `getPanelPatients()`
- Caches results, polls every 5 minutes for updates
- Exposes `patients`, `isLoading`, `error`, `refetch`

### 2.2 Command Center Dashboard UI

**File**: `src/features/dashboard/CommandCenter.tsx`
- Full-viewport grid layout: `h-screen` minus banner height (if shown)
- Layout (CSS Grid):
  ```
  ┌──────────────────┬────────────────────────────────────────┐
  │  Practitioner     │  Patient Cards Grid (2-3 columns)      │
  │  Info Card        │                                        │
  │                   │  ┌──────────┐ ┌──────────┐ ┌────────┐ │
  │  ──────────────   │  │ Patient 1│ │ Patient 2│ │ Pat. 3 │ │
  │  Patient List     │  │ vitals   │ │ vitals   │ │ vitals │ │
  │  (sortable,       │  │ risks    │ │ risks    │ │ risks  │ │
  │   searchable)     │  └──────────┘ └──────────┘ └────────┘ │
  │                   │                                        │
  │  ──────────────   │  ┌──────────┐ ┌──────────┐            │
  │  Sort: Severity   │  │ Patient 4│ │ Patient 5│            │
  │  Filter: Name     │  │ ...      │ │ ...      │            │
  │                   │  └──────────┘ └──────────┘            │
  └──────────────────┴────────────────────────────────────────┘
    20% width                      80% width
  ```
- In-context patient (from EHR launch) highlighted with accent border
- No scroll: if too many patients, use compact card mode or pagination dots
- Optional personal shortlist: practitioner can pin/unpin patients for quick access ordering (no access changes)

**File**: `src/features/dashboard/PatientCard.tsx`
- Compact card per patient:
  - Row 1: Name, Age, Gender
  - Row 2: Key vitals snapshot (BP, HR, Temp as compact values)
  - Row 3: Risk score badges (NEWS2, qSOFA, ASCVD, CHA₂DS₂-VASc)
  - Left border color = highest severity among risk scores
- Click → navigates to AI Insights (Phase 3) for that patient

**File**: `src/features/dashboard/PatientList.tsx`
- Left sidebar patient list remains scroll-free; for large panels use compact rows + pagination controls
- Sort options: Name (A-Z), Severity (highest first), Last Updated
- Search filter by name/MRN
- In-context patient pinned to top

### 2.3 Risk Score Calculators

**File**: `src/utils/risk-scores/news2.ts`
- National Early Warning Score 2
- Inputs: RR, SpO2, supplemental O2 (bool), Temp, SBP, HR, consciousness (AVPU)
- Scoring per NEWS2 parameter tables
- Output: `{ total: number, level: 'low' | 'low-medium' | 'medium' | 'high', parameters: {...} }`
- Returns `null` for any missing required input with `dataGaps: string[]`

**File**: `src/utils/risk-scores/qsofa.ts`
- Quick SOFA
- Inputs: RR (≥22?), altered mentation (GCS<15?), SBP (≤100?)
- Output: `{ score: 0-3, sepsisRisk: boolean }`

**File**: `src/utils/risk-scores/ascvd.ts`
- 10-year ASCVD Risk (Pooled Cohort Equations)
- Inputs: age, gender, race, total cholesterol, HDL, SBP, BP treatment, diabetes, smoking
- Sources: Patient (age, gender), Observation (cholesterol, HDL, SBP), Condition (diabetes), Social History observation (smoking)
- Output: `{ riskPercent: number, level: 'low' | 'borderline' | 'intermediate' | 'high' }`

**File**: `src/utils/risk-scores/cha2ds2vasc.ts`
- CHA₂DS₂-VASc Stroke Risk
- Inputs: CHF, hypertension, age, diabetes, stroke/TIA history, vascular disease, sex
- Sources: Condition (comorbidities), Patient (age, sex)
- Output: `{ score: 0-9, riskLevel: string, annualStrokeRisk: string }`

**File**: `src/features/dashboard/RiskBadge.tsx`
- Compact colored badge: `NEWS2: 7` in red, `ASCVD: 12%` in yellow, etc.
- Green (low risk), Yellow (moderate), Red (high)
- Gray with "?" when insufficient data
- Hover tooltip: shows score breakdown and data gaps

### 2.4 Verification Criteria (Given/When/Then)

- **P2-01** — Given authenticated practitioner context; when dashboard panel retrieval initializes; then panel set equals deduped Encounter+Patient strategy output.
- **P2-02** — Given retrieval runs under `user/` scopes; when calls are inspected during load/refresh; then no create/update/assign panel calls occur and access stays read-only.
- **P2-03** — Given practitioner identity is available; when dashboard provider context renders; then practitioner info card shows resolved logged-in identity.
- **P2-04** — Given panel includes seeded and sparse patients; when cards render; then each card shows Name/Age/Gender plus latest vitals snapshot fields.
- **P2-05** — Given in-context launch patient exists; when panel is shown/sorted; then in-context patient is highlighted and pinned per ordering rules.
- **P2-06** — Given required risk inputs exist for at least one patient; when risk badges render; then NEWS2, qSOFA, ASCVD, CHA₂DS₂-VASc format and severity colors are correct.
- **P2-07** — Given one patient lacks required risk inputs; when risk badges/details render; then gray `?` and visible data-gap explanation appear.
- **P2-08** — Given mixed-severity panel patients; when sorting by Severity and Last Updated; then highest severity appears first with deterministic tie handling.
- **P2-09** — Given user enters Name/MRN terms; when search filter is applied; then filtering is case-insensitive with explicit no-match state.
- **P2-10** — Given user pins/unpins shortlist entries; when order updates and view refreshes; then shortlist order changes without altering accessible panel membership.
- **P2-11** — Given dashboard tested at `1920x1080`, `1366x768`, `1280x720` under high volume; when layout is exercised; then layout remains scroll-free via compact mode and/or pagination.
- **P2-12** — Given user clicks patient card; when navigation triggers; then route behavior is unambiguous and matches phase destination.

### 2.5 Fixture Mapping

- **P2-01, P2-02, P2-03** → Practitioner launch fixture (`Practitioner/593923`)
- **P2-04, P2-05, P2-09, P2-10, P2-11, P2-12** → Joe (`12724067`)
- **P2-06, P2-08** → Fredrick (`12724070`)
- **P2-07** → Sandy (ID confirmation required)
- **Supplemental panel coverage** → Nancy (`12724066`), Wilma (`12724065`), Valerie (`12724071`)

---

## Phase 3 — AI Insights: Clinical Decision Assistant
**Estimated Effort**: L (5-8 days)
**Dependencies**: Phase 1 (auth + FHIR services). Can partially overlap with Phase 2.

### 3.1 Multi-Resource Data Aggregation

**File**: `src/services/fhir/patientSummary.ts`

`getComprehensiveSummary(patientId)`:
1. Parallel-fetches ALL clinical data using `Promise.allSettled()`:
   - `Condition?patient={id}&clinical-status=active` (active conditions)
   - `MedicationRequest?patient={id}&status=active` (current medications)
   - `AllergyIntolerance?patient={id}&clinical-status=active` (active allergies)
   - `Observation?patient={id}&category=vital-signs&_sort=-date&_count=20` (recent vitals)
   - `Observation?patient={id}&category=laboratory&_sort=-date&_count=50` (recent labs)
   - `Procedure?patient={id}&_sort=-date&_count=10` (recent procedures)
   - `Encounter?patient={id}&_sort=-date&_count=10` (recent encounters)
2. Returns typed `PatientClinicalSummary` object
3. Gracefully handles partial failures (if one resource fails, others still return)
4. Includes metadata: how many resources returned, any fetch errors

### 3.2 AI Integration

**File**: `src/services/ai/openaiPlatform.ts`
- OpenAI Platform client wrapper
- Configuration from `.env`: API key, model, and optional organization ID
- OpenAI Organization ID is optional and only used if your account setup requires it.
- MVP security caveat: client-side API key usage is allowed only for sandbox/prototype validation; prototype may send PHI to OpenAI Platform for testing and is not production/HIPAA-ready. Production hardening should migrate to backend proxy before release.
- System prompt:
  ```
  You are a clinical decision support assistant for healthcare providers.
  Analyze the following FHIR-sourced patient data and provide evidence-based
  insights. Rules:
  - Always cite clinical guidelines (e.g., AHA, ACC, KDIGO)
  - Never make definitive diagnoses — suggest "considerations"
  - Flag potential drug interactions with severity level
  - Identify lab trends heading toward critical values
  - Prioritize findings by clinical urgency
  - Return structured JSON, not free-form text
  ```
- Request/response format: structured JSON with typed fields
- Rate limiting: max 3 concurrent requests, exponential backoff on 429
- Timeout: 30 seconds per request
- Error handling: graceful fallback messaging

**File**: `src/services/ai/clinicalAnalysis.ts`

Three analysis functions, each returning structured results:

`analyzeDrugInteractions(medications, conditions, allergies)`:
- Input: active MedicationRequests + Conditions + AllergyIntolerances
- Output: `{ interactions: Array<{ drugs: string[], severity: 'high'|'moderate'|'low', description: string, recommendation: string }> }`

`analyzeLabTrends(observations)`:
- Input: all lab Observations sorted by date
- Output: `{ trends: Array<{ labName: string, direction: 'rising'|'falling'|'stable', currentValue: number, referenceRange: {low, high}, daysToThreshold: number | null, concern: string }> }`

`generateClinicalInsights(summary)`:
- Input: full `PatientClinicalSummary`
- Output: `{ insights: Array<{ category: 'interaction'|'trend'|'contraindication'|'guideline'|'info', severity: 'critical'|'warning'|'info', title: string, description: string, affectedResources: string[], suggestedAction: string }> }`

### 3.3 AI Insights UI

**File**: `src/features/insights/InsightsView.tsx`
- Full patient detail view (displayed when patient is selected from dashboard)
- Layout (no scroll):
  ```
  ┌────────────────────────────────────────────────────────────┐
  │ ← Back to Dashboard    Patient: Joe SMART, 49M    → Notes │
  ├──────────────┬───────────────────────┬───────────────────── │
  │ Clinical     │  AI Insights          │ Trends              │
  │ Summary      │                       │                     │
  │              │  ┌─ Critical ────────┐ │ ┌─ Creatinine ──┐  │
  │ Conditions:  │  │ Drug interaction  │ │ │ [chart]       │  │
  │ • Diabetes   │  │ warfarin + ...    │ │ └───────────────┘  │
  │ • CKD        │  └──────────────────┘ │                     │
  │              │                       │ ┌─ Glucose ─────┐  │
  │ Medications: │  ┌─ Warning ────────┐ │ │ [chart]       │  │
  │ • metformin  │  │ eGFR trending ↓  │ │ └───────────────┘  │
  │ • lisinopril │  │ Consider dose adj│ │                     │
  │              │  └──────────────────┘ │ ┌─ LDL ─────────┐  │
  │ Allergies:   │                       │ │ [chart]       │  │
  │ • Peanuts    │  ┌─ Info ───────────┐ │ └───────────────┘  │
  │              │  │ Guideline note   │ │                     │
  │              │  └──────────────────┘ │                     │
  ├──────────────┴───────────────────────┴─────────────────────┤
  │ 30% width       40% width              30% width           │
  └────────────────────────────────────────────────────────────┘
  ```

**File**: `src/features/insights/InsightCard.tsx`
- Individual insight card with:
  - Severity icon: 🔴 Critical, 🟡 Warning, 🔵 Info
  - Title + short description
  - Affected resources listed as chips
  - Suggested action text
  - Expandable detail with AI reasoning (accordion)

**File**: `src/features/insights/LabTrendChart.tsx`
- Lightweight SVG line chart per lab/vital
- Green band showing reference range
- Points outside range shown in red
- X-axis: dates; Y-axis: values
- No external charting library — pure SVG for minimal bundle size

### 3.4 Verification Criteria (Given/When/Then)

- **P3-01** — Given rich-data patient (Fredrick) is selected; when insights run; then at least one interaction, one trend, and one guideline/info card render.
- **P3-02** — Given sparse-data patient is selected; when insights run; then limited-data state appears without unhandled error.
- **P3-03** — Given one FHIR resource fetch fails during summary build; when summary assembly completes; then partial results render and failure is non-blocking.
- **P3-04** — Given AI returns structured payload; when UI binds response; then only schema-valid structured fields render (no raw text blob).
- **P3-05** — Given labs include in-range and out-of-range values; when trend charts render; then reference band and out-of-range points display correctly.
- **P3-06** — Given normal network conditions; when insight request executes; then response meets agreed latency target for typical patient.
- **P3-07** — Given user navigates Dashboard → Insights → Notes → Insights; when navigation executes; then selected patient context persists end-to-end.
- **P3-08** — Given Insights tested at `1920x1080`, `1366x768`, `1280x720`; when layout is exercised; then no viewport scrollbars appear.

### 3.5 Fixture Mapping

- **P3-01, P3-04** → Fredrick (`12724070`)
- **P3-02** → Sandy (ID confirmation required)
- **P3-03** → Fredrick (`12724070`) with one simulated partial resource failure
- **P3-05, P3-06, P3-07, P3-08** → Joe (`12724067`)
- **Interaction-heavy scenario coverage** → Hailey (`12724068`)

---

## Phase 4 — Smart Notes: Documentation Assistant
**Estimated Effort**: M-L (4-6 days)
**Dependencies**: Phase 3 (reuses AI service layer + patient summary service)

### 4.1 SOAP Note Generation

**File**: `src/services/ai/noteGenerator.ts`

`generateSOAPNote(patientSummary, encounterContext)`:
- AI prompt generates four SOAP sections:
  - **S (Subjective)**: Chief complaint from encounter reason, review of conditions
  - **O (Objective)**: Today's vitals (formatted), recent pertinent labs, physical exam placeholders
  - **A (Assessment)**: Clinical assessment synthesizing S+O data, differential considerations
  - **P (Plan)**: Guideline-based recommendations, follow-up suggestions
- Returns `SOAPNote` object with each section as editable string
- Each section generated independently (allows per-section regeneration)

**File**: `src/services/ai/icdSuggester.ts`

`suggestICDCodes(conditions, assessment)`:
- Maps active FHIR Conditions (SNOMED CT codes) → ICD-10-CM codes
- AI augments with additional codes inferred from clinical context
- Returns `Array<{ code: string, display: string, confidence: 'high'|'medium'|'low', source: 'mapped'|'inferred' }>`
- Top 5-8 suggestions, sorted by confidence

### 4.2 Smart Notes UI

**File**: `src/features/notes/NotesView.tsx`
- Split view layout (no scroll):
  ```
  ┌──────────────────────────────────────────────────────────────┐
  │ ← Back to Insights    Patient: Joe SMART    💾 Save Note    │
  ├───────────────────────────┬──────────────────────────────────┤
  │ Source Data (read-only)   │  SOAP Note Editor               │
  │                           │                                  │
  │ Patient: Joe SMART, 49M   │  ┌─ S: Subjective ──────── 🔄 ┐ │
  │                           │  │ Patient presents with...    │ │
  │ Today's Vitals:           │  │ [editable text area]        │ │
  │ • BP: 133/89 mmHg        │  └─────────────────────────────┘ │
  │ • HR: 88 bpm             │                                  │
  │ • Temp: 35.9°C           │  ┌─ O: Objective ──────── 🔄 ┐  │
  │ • RR: 22 br/min          │  │ Vitals: BP 133/89...       │  │
  │ • SpO2: 99%              │  │ [editable text area]       │  │
  │                           │  └────────────────────────────┘  │
  │ Active Conditions:        │                                  │
  │ • (none documented)       │  ┌─ A: Assessment ─────── 🔄 ┐  │
  │                           │  │ [editable text area]       │  │
  │ Active Medications:       │  └────────────────────────────┘  │
  │ • levofloxacin            │                                  │
  │ • Vancomycin              │  ┌─ P: Plan ──────────── 🔄 ┐   │
  │                           │  │ [editable text area]       │  │
  │ Allergies:                │  └────────────────────────────┘  │
  │ • Peanuts                 │                                  │
  │                           │  ICD-10 Codes: [E11.65] [N18.3] │
  ├───────────────────────────┴──────────────────────────────────┤
  │ 40% width                   60% width                        │
  └──────────────────────────────────────────────────────────────┘
  ```

**File**: `src/features/notes/SOAPEditor.tsx`
- Four collapsible sections: S, O, A, P
- Each section:
  - AI-generated text in an editable `<textarea>` (auto-height within allocated space)
  - 🔄 "Regenerate" button — re-prompts AI for just that section
  - Visual indicator: "AI-generated" badge (dims after manual edit → "Modified")
  - Character count display

**File**: `src/features/notes/ICDPanel.tsx`
- Horizontal bar below SOAP editor showing suggested ICD-10 codes
- Each code as a chip/tag: `E11.65 - Type 2 DM with hyperglycemia` with confidence dot
- Click chip to toggle inclusion/exclusion
- "+ Search" button for manual ICD-10 code lookup (text search against common codes)

### 4.3 Save Note to FHIR

**File**: `src/services/fhir/documents.ts`

`saveNote(patientId, soapNote, icdCodes)`:
1. Constructs DocumentReference resource:
   ```json
   {
     "resourceType": "DocumentReference",
     "status": "current",
     "type": { "coding": [{ "system": "http://loinc.org", "code": "11488-4", "display": "Consult Note" }] },
     "subject": { "reference": "Patient/<patientId>" },
     "author": [{ "reference": "Practitioner/<practitionerId>" }],
     "date": "<ISO timestamp>",
     "content": [{
       "attachment": {
         "contentType": "text/plain",
         "data": "<base64-encoded SOAP note>"
       }
     }]
   }
   ```
2. Confirmation dialog before saving ("This will create a clinical note. Continue?")
3. POSTs to `{baseUrl}/DocumentReference` with `patient/DocumentReference.crus` scope
4. Toast on success: "Clinical note saved successfully"
5. Returns to AI Insights view or Dashboard after save

### 4.4 Verification Criteria (Given/When/Then)

- **P4-01** — Given patient selected for note generation; when SOAP generation runs; then S/O/A/P sections populate and remain editable.
- **P4-02** — Given user manually edits one SOAP section; when section state updates; then only edited section shows Modified state.
- **P4-03** — Given user regenerates one section; when regeneration completes; then only target section changes and others remain unchanged.
- **P4-04** — Given conditions + assessment context exist; when ICD suggestion executes; then top suggestions include confidence and mapped/inferred source.
- **P4-05** — Given user toggles ICD chips; when inclusion set updates; then final note payload contains only selected ICD codes.
- **P4-06** — Given user confirms save; when document save executes; then DocumentReference create succeeds with success feedback.
- **P4-07** — Given user cancels confirmation dialog; when save flow is canceled; then no DocumentReference create call is made.
- **P4-08** — Given sparse-data patient is selected; when note generation executes; then note includes explicit limited-data handling without failure.
- **P4-09** — Given Notes tested at `1920x1080`, `1366x768`, `1280x720`; when layout is exercised; then no viewport scrollbars appear.
- **P4-10** — Given AI-generated note is displayed pre-finalization; when user attempts save; then practitioner review/edit is completed before final save.

### 4.5 Fixture Mapping

- **P4-01, P4-04, P4-10** → Fredrick (`12724070`)
- **P4-02, P4-03, P4-05, P4-06, P4-07, P4-09** → Joe (`12724067`)
- **P4-08** → Timmy (ID confirmation required)

---

## Phase 5 — Polish, Integration & End-to-End Testing
**Estimated Effort**: M (3-5 days)
**Dependencies**: Phase 2, 3, 4 all complete

### 5.1 Navigation & Flow Integration

**File**: `src/components/AppShell.tsx`
- Main layout wrapper with tab/navigation bar
- Three primary views: Dashboard | AI Insights | Smart Notes
- Tab bar at top (compact, below patient banner if shown)
- Smooth transitions between modules
- Patient context preserved across navigation
- Keyboard shortcuts: `Alt+D` (Dashboard), `Alt+I` (Insights), `Alt+N` (Notes)
- Breadcrumb: Dashboard → [Patient Name] → AI Insights → Smart Notes

### 5.2 Design System Finalization
- Audit all components for consistent Tailwind class usage
- Verify color palette consistency (no hardcoded hex values outside config)
- Dark mode toggle (practitioners working night shifts) — optional nice-to-have
- Responsive breakpoints: 1920x1080 (primary), 1366x768 (secondary), 1280x720 (minimum)
- All layouts must remain scroll-free at minimum resolution
- ARIA labels on all interactive elements
- Focus management for modal open/close
- Color contrast: minimum 4.5:1 ratio (WCAG AA)

### 5.3 Error Handling & Edge Cases
- Token expiry → auto-refresh using `offline_access` scope
- Network failure → retry with exponential backoff (max 3 retries) + user notification
- FHIR server 500 → "EHR service temporarily unavailable" message
- FHIR server 401 → re-trigger auth flow
- FHIR server 403 → "Insufficient permissions" with scope guidance
- AI service timeout → "AI analysis unavailable" with option to retry
- Empty data states for every component (patients, vitals, conditions, insights, etc.)
- Cerner `DataAbsentReason` extension → displayed as "Not available" (not an error)

### 5.4 Scope Registration Audit (Must Already Be Complete)
**Action**: Confirm Cerner Code Console app registration remains correct.

Scope registration is a Phase 0/Phase 1 entry gate and must already be complete before this phase.

Audit checks:
- All scopes listed in `agent.md` are present in Code Console registration.
- Token payloads still include required claims (`fhirUser`, launch/patient context as applicable).
- No unexpected permission regressions in existing scenarios.

### 5.5 End-to-End Test Scenarios

- **1. Full workflow**
  - Steps: Launch → Dashboard → Select Fredrick → AI Insights → Smart Notes → Save
  - Expected result: Complete flow in <60 seconds
- **2. Vital sign CRUD**
  - Steps: Dashboard → View Joe vitals → Record new BP 120/80 → Verify in list
  - Expected result: New vital appears after save
- **3. Patient banner toggle**
  - Steps: Launch with banner=true → verify visible; launch with banner=false → verify hidden
  - Expected result: Banner follows EHR instruction
- **4. Multi-patient view**
  - Steps: Dashboard → verify multiple patients from panel
  - Expected result: Panel patients rendered with scores
- **5. AI with rich data**
  - Steps: Select Hailey (9 meds) → AI Insights → check for interaction alerts
  - Expected result: AI flags immunosuppressant interactions
- **6. AI with sparse data**
  - Steps: Select Sandy (no data) → AI Insights
  - Expected result: Graceful "limited data" message
- **7. Note generation**
  - Steps: Select Joe → Smart Notes → generate → edit S section → save
  - Expected result: Note saved with edits intact
- **8. Error recovery**
  - Steps: Disconnect network → attempt action → reconnect → retry
  - Expected result: Retry succeeds, no data loss
- **9. Resolution test**
  - Steps: Run at `1920x1080`, `1366x768`, and `1280x720`
  - Expected result: No scrollbars at all tested resolutions

### 5.6 Verification Criteria
- [ ] Complete workflow (scenario 1) under 60 seconds
- [ ] No scrollbars visible at 1920x1080, 1366x768, and 1280x720
- [ ] All 9 test scenarios pass
- [ ] All test patients render without JavaScript errors
- [ ] Token refresh works after 30-minute idle
- [ ] Keyboard navigation functional throughout app
- [ ] All loading states use skeletons (no spinners)
- [ ] All error states show user-friendly messages with retry options

### 5.7 Integration Acceptance Criteria (Given/When/Then)

- **P5-01** — Given valid launch context + seeded patients; when full workflow runs; then Launch → Dashboard → Insights → Notes → Save completes within SLA.
- **P5-02** — Given patient is selected in Dashboard; when switching modules; then same patient context persists across modules/breadcrumbs.
- **P5-03** — Given network drops during in-progress action; when retry after reconnect runs; then action recovers without state loss.
- **P5-04** — Given token expires during active workflow; when protected call triggers auth handling; then session recovers via refresh/re-auth and flow resumes.
- **P5-05** — Given permission-denied response occurs; when protected operation is attempted; then clear insufficient-permissions fallback message appears.
- **P5-06** — Given AI timeout occurs; when retry is performed; then retry path works and editable local state is preserved.
- **P5-07** — Given app tested at `1920x1080`, `1366x768`, `1280x720`; when major screens are exercised; then no viewport scrollbars appear.
- **P5-08** — Given keyboard-only navigation; when traversing modules/modals; then focus order, ARIA labels, and modal focus return are correct.

### 5.8 Fixture Mapping

- **P5-01, P5-03** → Fredrick (`12724070`)
- **P5-02, P5-04, P5-07** → Joe (`12724067`)
- **P5-05** → Practitioner launch fixture (`Practitioner/593923`) with simulated 403 path
- **P5-06** → Hailey (`12724068`)
- **P5-08** → Practitioner launch fixture (`Practitioner/593923`)

---

## Phase Summary

- **Phase 0**
  - Deliverable: Project scaffold + data seeding
  - Effort: S (1-2d)
  - Dependencies: None
  - Parallelizable: —
- **Phase 1**
  - Deliverable: SMART Auth + A.1 must-haves (launch, banner, vitals R/W)
  - Effort: M (3-5d)
  - Dependencies: Phase 0
  - Parallelizable: —
- **Phase 2**
  - Deliverable: Dashboard (Command Center + Risk Scores)
  - Effort: L (5-8d)
  - Dependencies: Phase 1
  - Parallelizable: Yes, with Phase 3
- **Phase 3**
  - Deliverable: AI Insights (Clinical Decision Assistant)
  - Effort: L (5-8d)
  - Dependencies: Phase 1
  - Parallelizable: Yes, with Phase 2
- **Phase 4**
  - Deliverable: Smart Notes (Documentation Assistant)
  - Effort: M-L (4-6d)
  - Dependencies: Phase 3
  - Parallelizable: —
- **Phase 5**
  - Deliverable: Polish + Integration + E2E Testing
  - Effort: M (3-5d)
  - Dependencies: All above
  - Parallelizable: —
- **Total estimated**: ~21-34 days

```
Phase 0 ──→ Phase 1 ──┬──→ Phase 2 ──┬──→ Phase 5
                       │              │
                       └──→ Phase 3 ──┤
                              │       │
                              └──→ Phase 4 ──┘
```

## Agentic AI Addendum (v1.5, Feature-Flagged)

This addendum defines a constrained, post-MVP option to introduce agentic behavior without changing current MVP scope.

### Scope Decision

- **MVP (current plan)**: Keep deterministic AI pipelines from Phases 3-4.
- **v1.5 option**: Add feature-flagged, read-only orchestration over fixed tool steps.
- **Out of scope for v1.5**: Autonomous write-back to FHIR, self-directed task execution, or unsupervised clinical actions.

### Value vs. Complexity

- **Deterministic prompt + structured JSON (current MVP)**
  - Complexity: Low
  - Expected value: High
  - Recommendation: Keep as baseline
- **Constrained orchestration agent (fixed step graph, read-only tools)**
  - Complexity: Medium
  - Expected value: Medium-High
  - Recommendation: Candidate for v1.5
- **Fully autonomous clinical agent (dynamic planning + actions)**
  - Complexity: Very High
  - Expected value: Uncertain for MVP users
  - Recommendation: Do not include in v1/v1.5

### Guardrails (Mandatory for Any Agentic Mode)

- Read-only access to patient context retrieval and synthesis steps.
- No automatic FHIR writes; practitioner approval remains mandatory before any save action.
- Deterministic schema output for every step (no free-form-only terminal output).
- Trace log for each orchestration step (inputs, tool used, output summary, failures).
- Safe fallback path: if orchestration fails or times out, revert to current deterministic flow.

### v1.5 Acceptance Criteria (If Enabled)

- **AGA-01** — Given agentic feature flag is OFF; when practitioner opens AI Insights/Smart Notes; then existing non-agentic flow is unchanged.
- **AGA-02** — Given agentic feature flag is ON; when practitioner requests analysis; then orchestrator runs only approved read-only steps in predefined order.
- **AGA-03** — Given agentic mode is ON; when step requests write/update action; then action is blocked with explicit "practitioner review required" message.
- **AGA-04** — Given agentic mode is ON; when step fails (timeout/API/tool); then flow degrades to deterministic baseline with preserved draft/context.
- **AGA-05** — Given agentic mode is ON; when response is rendered; then output is valid structured JSON for module schema.
- **AGA-06** — Given agentic mode is ON; when session completes; then step-level trace log is available for non-production audit/debug.

### Integration Placement

- Execute only after Phase 5 sign-off as a **v1.5 track**.
- Implement behind a runtime flag (example: `VITE_ENABLE_AGENTIC_MODE=false`).
- Reuse existing Phase 3/4 services; add orchestration as a wrapper, not a replacement.

### Phase Exit Gates

- **Phase 0 Exit**: Environment/config complete, dev startup clean, TypeScript checks pass, full scope registration verified, and Observation create/read smoke test pass recorded.
- **Phase 1 Exit**: All `P1-*` acceptance rows pass at `1920x1080`, `1366x768`, and `1280x720`.
- **Phase 2 Exit**: All `P2-*` acceptance rows pass, including read-only panel derivation and shortlist behavior.
- **Phase 3 Exit**: All `P3-*` acceptance rows pass, including structured-output checks and latency target.
- **Phase 4 Exit**: All `P4-*` acceptance rows pass, including review-before-save and save/cancel API behavior.
- **Phase 5 Exit**: All `P5-*` acceptance rows and all scenario checks pass.
- **Fixture Readiness Gate**: Sparse fixture IDs (Sandy, Timmy) must be confirmed before Phase 3/4 sign-off; if unavailable, substitute with documented equivalent sparse fixtures.

---

## Risks & Mitigations

- **`user/` scopes may not return panel patients as expected in sandbox**
  - Impact: Blocks Phase 2 dashboard
  - Mitigation: Test early in Phase 1; fallback to hardcoded patient IDs for demo
- **Cerner sandbox data too sparse for compelling AI insights**
  - Impact: Weakens Phase 3/4 demos
  - Mitigation: Phase 0 data seeding script addresses this
- **OpenAI Platform latency > 5 seconds**
  - Impact: Poor UX
  - Mitigation: Implement streaming responses; show partial results as they arrive
- **Cerner token expiry during AI processing**
  - Impact: Lost work
  - Mitigation: Save AI results locally; retry with refreshed token
- **Scope registration changes take time to propagate**
  - Impact: Blocks testing
  - Mitigation: Register all scopes upfront in Phase 0, before any coding
- **FHIR write operations (vitals, notes) rejected by sandbox**
  - Impact: Blocks A.1 Req 4 + Phase 4
  - Mitigation: Test write operations in Phase 0 seeding; adjust resource format if needed
