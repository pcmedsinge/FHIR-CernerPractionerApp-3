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
  - Status: Complete
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 1 — SMART Auth + A.1 Must-Haves**
  - Status: Complete
  - Owner: TBD
  - Target Date: TBD
  - Notes: 7/9 vitals create working (HR/RR blocked by Cerner sandbox scope limitation)
- **Phase 1.5 — Tailwind CSS Full Migration**
  - Status: Complete
  - Owner: TBD
  - Target Date: 2026-03-08
  - Notes: Tailwind v4 activated via @tailwindcss/vite plugin. All components migrated from hand-written App.css (1426 lines) to Tailwind utilities. App.css deleted. Theme tokens configured in index.css @theme block.
- **Phase 2 — Dashboard (Single-Patient Clinical Dashboard + Risk Scores)**
  - Status: Complete
  - Owner: TBD
  - Target Date: TBD
  - Notes: Simplified from multi-patient Command Center to single-patient clinical dashboard
- **Phase 3 — AI Insights (Clinical Decision Assistant)**
  - Status: Complete
  - Owner: TBD
  - Target Date: TBD
  - Notes: —
- **Phase 4 — Smart Notes (Documentation Assistant)**
  - Status: Complete
  - Owner: TBD
  - Target Date: TBD
  - Notes: Save to EHR working (DocumentReference POST). Formats: SOAP, A/P, SBAR.
- **Phase 5 — Polish, Integration & End-to-End Testing**
  - Status: In Progress
  - Owner: TBD
  - Target Date: TBD
  - Notes: Header consolidation, visual language upgrade, footer cleanup — done

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
3. Configure Tailwind CSS v4 with medical-grade design system:
   - ✅ **Activated**: `@tailwindcss/vite` plugin in `vite.config.ts`, `@import "tailwindcss"` in `src/index.css`
   - ✅ **Theme tokens** in `src/index.css` `@theme` block (CSS-based config, NOT tailwind.config.js):
     - Colors: `--color-status-normal: #16a34a`, `--color-status-warning: #f59e0b`, `--color-status-critical: #dc2626`, `--color-accent: #2563eb`, `--color-surface: #f1f5f9`, `--color-card: #ffffff`, `--color-card-border: #e2e8f0`
     - Shadows: `--shadow-card`, `--shadow-card-hover`, `--shadow-modal`, `--shadow-toast`
     - Animations: `--animate-shimmer`, `--animate-spinner`, `--animate-modal-in`, `--animate-toast-in`, `--animate-toast-out`, `--animate-save-in`
   - ✅ Custom CSS classes in `@layer components` (not expressible as pure utilities): `dialog.modal-backdrop`, `.vital-status-bar`, `.skeleton-gradient`
   - Typography: Inter font family (or system font stack)
   - Layout: `h-screen` based, `overflow-hidden` globally
   - **Rule**: All new UI must use Tailwind utility classes. No new CSS files.

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
- Optional: seed 2-3 Appointments per patient for future v2 scheduling; not required for Phase 0/Phase 1 gate
- Target patients: Joe, Fredrick, Nancy, Wilma, Hailey, Valerie
- Idempotent: checks existing data before creating duplicates
- Includes mandatory write smoke test for `Observation` create/read-back (A.1 requirement gate)
- Records smoke test result log; Phase 1 cannot start until write smoke test passes

### 0.5 Verification Criteria
- [x] `npm run dev` starts without errors on `http://127.0.0.1:5173`
- [x] Tailwind classes render correctly (v4 via `@tailwindcss/vite` + `@import "tailwindcss"`)
- [x] Project structure matches above layout
- [x] `.env` populated with all Section B values
- [x] TypeScript strict mode enabled, no `any` types
- [x] Cerner app scope registration is complete (all scopes listed in `agent.md`) before Phase 1 entry
- [x] Observation write smoke test passes in Cerner sandbox (create + verify retrieval)

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
1. Constructs FHIR `Observation` resource per **Cerner's documented requirements** (see agent.md § "Cerner FHIR Observation API Reference"):
   - **`category[0].text`**: MUST include `"Vital Signs"` — Cerner rejects without it (422).
   - **`code.text`**: MUST include the LOINC display name — Cerner rejects without it (422).
   - **`encounter`**: Include `Encounter/{id}` from SMART launch context when available — required for proper indexing/pairing.
   - **`issued`**: Set to current timestamp (when filed), distinct from `effectiveDateTime` (when measured).
   - **`identifier`**: Include a unique identifier to prevent 409 Conflict from Cerner duplicate detection.
   - **`performer`**: Include `Practitioner/{id}` when available from auth context.
   ```json
   {
     "resourceType": "Observation",
     "status": "final",
     "category": [{
       "coding": [{
         "system": "http://terminology.hl7.org/CodeSystem/observation-category",
         "code": "vital-signs",
         "display": "Vital Signs"
       }],
       "text": "Vital Signs"
     }],
     "code": {
       "coding": [{ "system": "http://loinc.org", "code": "<LOINC>", "display": "<name>" }],
       "text": "<display name>"
     },
     "subject": { "reference": "Patient/<patientId>" },
     "encounter": { "reference": "Encounter/<encounterId>" },
     "effectiveDateTime": "<ISO timestamp — when measured>",
     "issued": "<ISO timestamp — when filed (now)>",
     "identifier": [{ "system": "urn:oid:2.16.840.1.113883.3.7418", "value": "<unique-id>" }],
     "valueQuantity": { "value": "<number>", "unit": "<unit>", "system": "http://unitsofmeasure.org", "code": "<UCUM>" }
   }
   ```
2. Special handling for Blood Pressure:
   - Cerner sandbox **rejects** `Observation.component` — do NOT use component-based BP.
   - POST systolic (`8480-6`) and diastolic (`8462-4`) as **two separate Observations** with the same `effectiveDateTime`.
   - Cerner pairs them automatically on subsequent search if configured in Millennium.
   - Search for standalone BP: use `code=8480-6,8462-4` (NOT the panel code `85354-9`).
3. POSTs to `{baseUrl}/Observation` with `patient/Observation.crus` scope
4. Cerner returns **201 with empty body** — extract resource ID from `Location` response header
5. On success: Toast notification + VitalsPanel uses optimistic update (shows new value immediately)
6. On failure: Parse `OperationOutcome.issue[0].diagnostics` for user-friendly error message

**File**: `src/components/Toast.tsx`
- Success: "Vital signs recorded successfully" (green, auto-dismiss 3s)
- Error: user-friendly message based on HTTP status (422/401/400/500)

### 1.4.1 Cerner Sandbox — Confirmed Working LOINC / Code Mappings (Create)

> **Last updated**: 2026-03-08 — Based on exhaustive diagnostic testing against
> Cerner sandbox tenant `ec2458f2-1e24-41c8-b71b-0e701af7583d`.

#### ✅ Working Creates (HTTP 201) — 7 of 9 vital types

| Vital | Code System | Code | code.text | UCUM unit | Notes |
|-------|------------|------|-----------|-----------|-------|
| Temperature | LOINC | `8331-1` | Temperature Oral | `Cel` | Originally `8310-5` (generic) → 422. Switched to `8331-1` (Temperature Oral). |
| Systolic BP | LOINC | `8459-0` | Systolic Blood Pressure | `mm[Hg]` | Standalone POST (NOT component-based). Cerner pairs with diastolic. |
| Diastolic BP | LOINC | `8454-1` | Diastolic Blood Pressure | `mm[Hg]` | Standalone POST (NOT component-based). Same effectiveDateTime as systolic. |
| Weight | LOINC | `3141-9` | Weight Measured | `kg` | Originally `29463-7` (generic) → 422. Switched to `3141-9` (Body weight Measured). |
| Height | LOINC | `3137-7` | Height/Length Measured | `cm` | Originally `8302-2` (generic) → 422. Switched to `3137-7` (Body height Measured). |
| BMI | LOINC | `39156-5` | Body Mass Index Measured | `kg/m2` | Worked on first try. |
| **SpO2** | **Proprietary** | **`703498`** | **Oxygen Saturation** | `%` | **LOINC codes all fail.** Proprietary-only codeSet/72 code works. |

**Pattern**: Cerner sandbox prefers "Measured" LOINC variants over generic codes. SpO2 requires proprietary code (codeSet/72 `703498`).

#### ❌ Not Working (HTTP 422) — 2 of 9 vital types

| Vital | LOINC Codes Tested | Proprietary codeSet/72 | Other Variants Tested | Conclusion |
|-------|-------------------|----------------------|----------------------|------------|
| Heart Rate | `8867-4`, `8893-0`, `69000-8`, `69001-6`, `68999-2`, `8890-6`, `76282-3` | `703511` (Peripheral Pulse Rate) | unit=/min, unit=bpm, no-UCUM-system, bare minimum, no encounter, no performer, dual category, therapy-only category | All fail with generic 422. Likely requires Provider/System persona scope. |
| Respiratory Rate | `9279-1` | `703540` (Respiratory Rate) | unit=/min, unit=br/min, bare minimum, dual category | All fail with generic 422. Same conclusion. |

#### Cerner Create Rules Discovered

1. **Mixed coding rejected**: `code.coding[]` with both proprietary (codeSet/72) AND LOINC → `"cannot contain proprietary and standard codes"`
2. **Category must be exactly 1**: Dual `therapy` + `vital-signs` → `"expected exactly 1 list item"`. Server adds extra categories post-create.
3. **Category must be vital-signs, laboratory, or imaging**: `therapy`-only → `"must be one of laboratory, vital-signs, or imaging"`
4. **valueQuantity requires all 3**: `system`, `code`, and `unit` must ALL be present together.
5. **Different patient → 403**: `patient/Observation.crus` scope is bound to in-context patient only.
6. **Cerner docs state Create is Provider/System persona only** — our app uses `patient/Observation.crus`. Most vitals work; HR/RR do not.

#### Proprietary Code Mappings (from existing observations search)

| Vital | codeSet/72 Code | Display | LOINC Equivalents | Create Status |
|-------|----------------|---------|-------------------|---------------|
| Heart Rate | `703511` | Peripheral Pulse Rate | `8867-4`, `8893-0` | ❌ 422 |
| Respiratory Rate | `703540` | Respiratory Rate | `9279-1` | ❌ 422 |
| SpO2 | `703498` | Oxygen Saturation | `2708-6`, `59408-5` | ✅ 201 |

### 1.4.2 Impact Analysis — HR & RR Create Unavailability

> Heart Rate and Respiratory Rate cannot be created via the Cerner FHIR API in the
> public sandbox using `patient/Observation.crus` scope. This impacts multiple areas.

#### A.1 Requirement 4: "Allow the user to create new vital sign entries"

- **Requirement is partially fulfilled**: 7 of 9 vital types create successfully.
- HR and RR fields are present in the form but **marked read-only** with explanation.
- The form accepts and submits all other vital types (Temp, BP, SpO2, Height, Weight, BMI).
- **Mitigation**: The form UI clearly communicates the sandbox limitation. In production with Provider persona scope (`user/Observation.crus`), these would likely work.

#### Phase 2 — Risk Scores (NEWS2, qSOFA)

| Risk Score | HR/RR Dependency | Impact |
|-----------|-----------------|--------|
| **NEWS2** | HR and RR are **2 of 7 required inputs** | Can still calculate using **existing** HR/RR observations (read works, only create is blocked). Score computes with latest available values. If no historical HR/RR exists for a patient, NEWS2 shows data gaps. |
| **qSOFA** | RR is **1 of 3 inputs** (RR ≥ 22?) | Same mitigation — uses existing RR observations. Shows data gap if none exist. |
| **ASCVD** | No dependency on HR/RR | ✅ No impact |
| **CHA₂DS₂-VASc** | No dependency on HR/RR | ✅ No impact |

**Key point**: Risk scores READ vitals, they don't CREATE them. The existing HR/RR observations in the sandbox (Peripheral Pulse Rate ×2, Respiratory Rate ×1 per search results) are sufficient for risk score calculation.

#### Phase 3 — AI Insights

- AI analysis fetches vitals via `getVitalSigns()` which READs — no create dependency.
- Lab trends, drug interactions, clinical insights are unaffected.

#### Phase 4 — Smart Notes

- No dependency on vital sign creation.

#### Workarounds & Production Path

1. **Sandbox**: HR/RR read-only. Risk scores use historical data. App clearly marks limitation.
2. **Production**: Register app with Provider persona → server grants `user/Observation.crus` → HR/RR creates should work.
3. **Alternative sandbox approach**: If a Cerner support ticket can enable Provider scope in sandbox, HR/RR may start working immediately (the codes are confirmed mapped by Cerner engineer Fenil Desani).

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

## Phase 2 — Dashboard: Single-Patient Clinical Dashboard + Risk Scores
**Estimated Effort**: M (3-5 days)
**Dependencies**: Phase 1 (auth + FHIR service layer)

> **Design Decision**: The original plan called for a multi-patient Command Center with
> practitioner panel discovery. This was dropped because (a) Cerner sandbox only grants
> `patient/` scopes — never `user/` scopes — making panel discovery impossible in the
> sandbox, and (b) SMART on FHIR patient-context launches inherently serve one patient
> at a time, so multi-patient UI adds near-zero production value. The app now focuses
> entirely on enriching the single in-context patient view.

### 2.1 Practitioner Identity

**File**: `src/services/fhir/practitioner.ts`

`getPractitioner(practitionerId, token)`:
- Fetches `Practitioner/{id}` to get logged-in practitioner details (name, role)

`getPractitionerDisplayName(practitioner)`:
- Extracts human-readable display name from Practitioner resource
- Falls back through `name[].text`, `given + family`, `family`, then `"Practitioner"`

### 2.2 Patient Demographics

**Inline in**: `src/hooks/usePatientDashboard.ts`

`getPatientDemographics(patientId, token)`:
- Fetches `Patient/{id}` for `gender` and `birthDate`
- Computes age from birthDate for age-dependent risk scores (ASCVD, CHA₂DS₂-VASc)

### 2.3 Clinical Dashboard UI

**File**: `src/features/dashboard/ClinicalDashboard.tsx`
- Single-patient clinical overview with three sections:
  ```
  ┌────────────────────────────────────────────────────┐
  │  Header: Dr. [Name]  │  📋 Record Vitals  │  🔄   │
  ├────────────────────────────────────────────────────┤
  │  Vitals Overview (responsive tile grid)            │
  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
  │  │  BP  │ │  HR  │ │ Temp │ │ SpO2 │ │  RR  │    │
  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘    │
  ├────────────────────────────────────────────────────┤
  │  Active Conditions (chip pills: CHF, HTN, DM…)    │
  ├────────────────────────────────────────────────────┤
  │  Risk Assessment                                    │
  │  Badge row: [NEWS2: 5] [qSOFA: 1] [ASCVD: 8%]    │
  │  Detail cards grid:                                 │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
  │  │ NEWS2    │ │ qSOFA    │ │ ASCVD    │           │
  │  │ details  │ │ details  │ │ details  │           │
  │  └──────────┘ └──────────┘ └──────────┘           │
  └────────────────────────────────────────────────────┘
  ```
- Responsive: 3-column at desktop, 2-column at tablet, single at mobile
- "Record Vitals" button switches to Phase 1 vitals recording view
- Refresh button re-fetches all data
- All styling uses Tailwind utility classes (no CSS class prefixes — `cd-*` prefix removed during Tailwind migration)

**File**: `src/features/dashboard/RiskBadge.tsx`
- Compact colored badge: `NEWS2: 7` in red, `ASCVD: 12%` in yellow, etc.
- Green (low risk), Yellow (moderate), Red (high)
- Gray with "?" when insufficient data
- Hover tooltip: shows score breakdown and data gaps

**File**: `src/hooks/usePatientDashboard.ts`
- React hook orchestrating all clinical data fetching
- Fires in parallel: practitioner name, patient demographics, vitals, conditions
- Computes risk scores from fetched data
- Extracts condition flags for display
- Auto-polls every 5 minutes
- Returns: `{ practitionerName, patientData, isLoading, error, refetch }`

### 2.4 Risk Score Calculators

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
- Output: `{ riskPercent: number, level: 'low' | 'borderline' | 'intermediate' | 'high' }`

**File**: `src/utils/risk-scores/cha2ds2vasc.ts`
- CHA₂DS₂-VASc Stroke Risk
- Inputs: CHF, hypertension, age, diabetes, stroke/TIA history, vascular disease, sex
- Output: `{ score: 0-9, riskLevel: string, annualStrokeRisk: string }`

### 2.5 Verification Criteria (Given/When/Then)

- **P2-01** — Given authenticated practitioner context; when dashboard loads; then practitioner name is displayed in the header.
- **P2-02** — Given in-context patient has vitals; when dashboard renders; then vitals tile grid shows latest values for BP, HR, Temp, SpO2, RR.
- **P2-03** — Given patient has active conditions (CHF, HTN, DM, etc.); when dashboard renders; then condition flag chips are displayed.
- **P2-04** — Given required risk inputs exist; when risk assessment renders; then NEWS2, qSOFA, ASCVD, CHA₂DS₂-VASc badges and detail cards show correct values and severity colors.
- **P2-05** — Given patient lacks some risk inputs; when risk badges render; then gray `?` and visible data-gap explanation appear.
- **P2-06** — Given patient has birthDate and gender in FHIR resource; when risk scores compute; then age/sex-dependent scores (ASCVD, CHA₂DS₂-VASc) use real demographics.
- **P2-07** — Given user clicks "Record Vitals"; when navigation triggers; then app switches to Phase 1 vitals recording view.
- **P2-08** — Given user clicks refresh; when data re-fetches; then latest vitals and conditions are shown.
- **P2-09** — Given dashboard tested at 1920×1080 and 1366×768; when layout renders; then responsive grid adapts appropriately.

### 2.6 Fixture Mapping

- **P2-01** → Practitioner launch fixture (`Practitioner/593923`)
- **P2-02, P2-07, P2-08** → Joe (`12724067`)
- **P2-03, P2-04** → Fredrick (`12724070`) — has conditions + vitals
- **P2-05** → Sandy (sparse data patient)

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
  - Steps: Launch → Dashboard → Review Risk Scores → AI Insights → Smart Notes → Save
  - Expected result: Complete flow in <60 seconds
- **2. Vital sign CRUD**
  - Steps: Dashboard → View Joe vitals → Record new BP 120/80 → Verify in list
  - Expected result: New vital appears after save
- **3. Patient banner toggle**
  - Steps: Launch with banner=true → verify visible; launch with banner=false → verify hidden
  - Expected result: Banner follows EHR instruction
- **4. Dashboard clinical overview**
  - Steps: Launch → Dashboard → verify vitals tiles, conditions, risk scores
  - Expected result: All clinical data rendered for in-context patient
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
  - Deliverable: Dashboard (Single-Patient Clinical Dashboard + Risk Scores)
  - Effort: M (3-5d)
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
- **Phase 2 Exit**: All `P2-*` acceptance rows pass, including patient demographics fetch and risk score computation.
- **Phase 3 Exit**: All `P3-*` acceptance rows pass, including structured-output checks and latency target.
- **Phase 4 Exit**: All `P4-*` acceptance rows pass, including review-before-save and save/cancel API behavior.
- **Phase 5 Exit**: All `P5-*` acceptance rows and all scenario checks pass.
- **Fixture Readiness Gate**: Sparse fixture IDs (Sandy, Timmy) must be confirmed before Phase 3/4 sign-off; if unavailable, substitute with documented equivalent sparse fixtures.

---

## Risks & Mitigations

- **`user/` scopes not available in Cerner sandbox**
  - Impact: Originally blocked multi-patient panel discovery — resolved by dropping multi-patient approach
  - Resolution: App uses only `patient/` scopes with single in-context patient
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
