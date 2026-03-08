# Agent Guidelines — PractitionerHub

## Behavioral Rules
- NEVER push to GitHub without explicit user permission
- NEVER create files without explicit user permission during planning phases
- Ask before making structural changes to project layout
- When unsure, ask — don't assume
- Always reference requirement.md Section B for Cerner configuration values
- For official Cerner/SMART URLs, use `Cerner FHIR ref .md`
- Always reference this file at the start of every implementation session

## Implementation Compliance (Execution Gate)
- Before closing any phase, verify implementation against this file and `implementation-plan.md` acceptance criteria.
- Any intentional deviation must be documented explicitly in this file under **Temporary Exceptions** before moving to next phase.
- Scope/architecture/security decisions in this file are authoritative unless the user explicitly overrides them.

## Pre-Implementation Research Gate (Mandatory)
**BEFORE writing any FHIR create, update, or search code for a new resource type:**
1. **Find Cerner's official examples**: Check `Cerner FHIR ref .md` for the GitHub source links, then read the `_CREATE`, `_UPDATE`, and search examples for that resource in `r4_examples_observation.rb` (or equivalent file for other resources).
2. **Read the Implementation Notes**: Check the resource's `.md` file on GitHub for Cerner-specific quirks, required fields, and search parameter limitations.
3. **Compare every field**: Your POST payload must include every field present in Cerner's official example. Missing fields like `code.text`, `category.text`, or `encounter` cause 422 errors or silent indexing failures.
4. **Document findings in agent.md**: Add a reference section (like "Cerner FHIR Observation API Reference") before writing implementation code.
5. **This gate applies to**: Observation, Condition, Encounter, Patient, MedicationRequest, AllergyIntolerance, DocumentReference, Appointment, and any other FHIR resource used in the app.

### Temporary Exceptions
- ~~**Styling rule exception (active in Phase 1 scaffold):** Current app shell/auth status UI uses `src/App.css` and `src/index.css` for bootstrap speed. This is temporary and must be migrated to Tailwind utility classes/components before Phase 2 sign-off.~~ **RESOLVED** — Tailwind CSS v4 fully activated and all components migrated (2026-03-08). `App.css` deleted. See Completed Milestones below.

## Project Identity
- **App Name**: PractitionerHub
- **Type**: SMART on FHIR EHR Launch (Provider Persona)
- **EHR Target**: Cerner (Oracle Health) Millennium, FHIR R4
- **Architecture**: Single bundled app with 3 integrated modules:
  1. Dashboard (Multi-Patient Command Center + Risk Scores)
  2. AI Insights (Clinical Decision Assistant)
  3. Smart Notes (Documentation Assistant)

## Technology Stack (from requirement.md Section C)
- **Language**: TypeScript (strict mode)
- **Framework**: React 19 (functional components + hooks only)
- **Build Tool**: Vite 7 with `@tailwindcss/vite` plugin
- **Styling**: Tailwind CSS v4 only — utility-first, no `App.css`, no CSS modules
  - Config lives in `src/index.css` via `@import "tailwindcss"` + `@theme` block (Tailwind v4 CSS-based config, NOT `tailwind.config.js`)
  - Semantic color tokens: `status-normal`, `status-warning`, `status-critical`, `accent`, `surface`, `card`, `card-border`, etc.
  - Custom animation tokens: `shimmer`, `spinner`, `modal-in`, `toast-in`, `toast-out`, `save-in`
  - Only 3 custom CSS classes kept in `@layer components` (can't be Tailwind utilities): `dialog.modal-backdrop`, `.vital-status-bar`, `.skeleton-gradient`
  - **Rule**: All new UI must use Tailwind utility classes. Never create new CSS files.
- **Backend** (if needed): C# minimal API (for AI proxy / API key protection)
- **AI**: OpenAI Platform (GPT models) for prototype use; PHI/compliance risk accepted for MVP testing only.

## Cerner Configuration (from requirement.md Section B)
- **Base URL**: `https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d`
- **Client ID**: `66037bbc-cc54-405b-b3fd-5fbeaeac4251`
- **Authorization Endpoint**: `https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/personas/provider/authorize`
- **Token Endpoint**: `https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token`
- **Callback URL**: `http://127.0.0.1:5173`
- **App ID**: `b4ae40b3-e888-4821-87f8-0586abb29cef`
- **Application Type**: Provider
- **Access Type**: Offline
- **Privacy**: Public (no client secret)
- **SMART Version**: SMART v2
- **Grant Type**: Authorization Code with PKCE

## Cerner-Specific Technical Rules
- Cerner metadata returns v1-style endpoint URLs despite v2 registration — this is expected and works fine
- Always pass `aud` parameter in authorize call (= FHIR base URL) — Cerner requires this
- Use PKCE (public app, no client secret)
- Cerner does NOT support wildcard scopes — list each resource scope explicitly
- Cerner does NOT support `Encounter?practitioner=X` search parameter — must search encounters by patient then filter by practitioner in `Encounter.participant`
- Handle Cerner pagination: always follow `Bundle.link[relation=next]` URLs, never construct pagination URLs manually
- Cerner returns `DataAbsentReason` extension for missing required fields — handle gracefully in all resource parsing
- Cerner may return duplicate resource IDs across pages — deduplicate by resource ID, keep latest version
- Cerner may return proprietary/local observation codes or partial codings; implement tolerant vital-sign mapping with configurable code aliases and category/profile fallbacks
- The `Patient.generalPractitioner` field links patients to their primary practitioner
- `Encounter.participant` contains practitioner references with roles: Attending Physician, Consulting Physician, Referring Physician, Covering Physician
- Open endpoint (no auth): `https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d` — for metadata/testing only

## Cerner FHIR Observation API Reference

Source: https://github.com/cerner/fhir.cerner.com/blob/main/content/millennium/r4/clinical/diagnostics/observation.md
and https://github.com/cerner/fhir.cerner.com/blob/main/lib/resources/example_json/r4_examples_observation.rb

### Observation Search Rules
- The `code` parameter searches **only** `Observation.code` (not components).
- For Blood Pressure: search by the **panel code** `85354-9`. Using component codes `8480-6` (Systolic) or `8462-4` (Diastolic) will NOT return component-based BP resources.
- If POSTing systolic/diastolic as standalone Observations (not as BP components), search by their individual codes `8480-6` / `8462-4` will work.
- Bare LOINC codes work in `code` param: `code=8867-4,8310-5` — no system prefix required.
- **"Searching records with vital-signs category by code with proprietary system will result in empty response."** — use LOINC system only.
- `code` may be a comma-separated list: `code=8867-4,8310-5,9279-1`
- Per-code queries are faster than broad `category=vital-signs` queries on Cerner's index.
- Maximum `_count=200`. Default is 50.
- Pagination: social history always on first page; subsequent pages sorted by effective date desc.

### Observation Create (POST) — Required Fields
Cerner rejects POSTs missing required fields with **422 Unprocessable Entity**.

**Mandatory fields for vital-signs:**
| Field | Requirement | Notes |
|-------|-------------|-------|
| `resourceType` | `"Observation"` | |
| `status` | `"final"` | |
| `category[0].coding[0].system` | `http://terminology.hl7.org/CodeSystem/observation-category` | |
| `category[0].coding[0].code` | `vital-signs` | |
| `category[0].coding[0].display` | `Vital Signs` | |
| **`category[0].text`** | **`"Vital Signs"` — REQUIRED by Cerner** | Missing this causes 422 or indexing failures |
| `code.coding[0].system` | `http://loinc.org` | |
| `code.coding[0].code` | LOINC code (e.g. `8867-4`) | |
| `code.coding[0].display` | Display name (e.g. `Heart rate`) | |
| **`code.text`** | **Display name — REQUIRED by Cerner** | Missing this causes 422 |
| `subject.reference` | `Patient/{id}` | |
| `effectiveDateTime` | ISO 8601 timestamp | When measurement was taken |
| `issued` | ISO 8601 timestamp | When observation was recorded/filed |
| `valueQuantity.value` | Numeric value | |
| `valueQuantity.unit` | Display unit (e.g. `degC`, `%`, `mmHg`) | |
| `valueQuantity.system` | `http://unitsofmeasure.org` | |
| `valueQuantity.code` | UCUM code (e.g. `Cel`, `mm[Hg]`, `/min`) | |

**Strongly recommended fields:**
| Field | Requirement | Notes |
|-------|-------------|-------|
| `encounter.reference` | `Encounter/{id}` | From SMART launch context. Cerner uses this for proper indexing and pairing. |
| `identifier` | Unique identifier | Prevents 409 Conflict from duplicate detection |
| `performer` | Practitioner reference | All Cerner examples include this |

### Observation Create — Blood Pressure
- Cerner supports component-based BP with panel code `85354-9` and systolic/diastolic components.
- **However, Cerner sandbox may reject `Observation.component`** — in that case, POST systolic (`8480-6`) and diastolic (`8462-4`) as two separate standalone Observations with the same `effectiveDateTime`.
- Cerner will pair standalone systolic/diastolic on subsequent search **if configured in Millennium** (Blood Pressure Event Set Pairing Hierarchy).
- Search for BP panel: use `code=85354-9` (returns component-based). For standalone: use `code=8480-6,8462-4`.

### Observation Create — Cerner Example (Temperature)
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
    "coding": [{
      "system": "http://loinc.org",
      "code": "8331-1"
    }],
    "text": "Temperature Oral"
  },
  "subject": { "reference": "Patient/12457981" },
  "encounter": { "reference": "Encounter/97845408" },
  "effectiveDateTime": "2020-04-03T19:21:00.000Z",
  "issued": "2020-04-03T19:21:40.000Z",
  "performer": [{ "reference": "Practitioner/11638321" }],
  "valueQuantity": {
    "value": 37.20,
    "unit": "degC",
    "system": "http://unitsofmeasure.org",
    "code": "Cel"
  }
}
```

### Observation Create — Response
- Returns **201 Created** with empty body.
- Resource ID is in the `Location` header: `Location: .../Observation/L-197392513`
- `ETag` header contains version for subsequent updates.

### UCUM Code Reference (for valueQuantity.code)
| Display Unit | UCUM Code |
|-------------|----------|
| bpm / br/min | `/min` |
| degC / °C | `Cel` |
| degF / °F | `[degF]` |
| % | `%` |
| cm | `cm` |
| in | `[in_i]` |
| kg | `kg` |
| lb | `[lb_av]` |
| kg/m² | `kg/m2` |
| mmHg | `mm[Hg]` |
| L/min | `L/min` |

### Cerner Eventual Consistency
- Cerner uses a CQRS pattern: primary write store is separate from search index.
- A newly-created Observation is immediately readable by direct `GET /Observation/{id}`.
- It may take 30-120 seconds (occasionally longer) to appear in search queries (`GET /Observation?patient=X&code=Y`).
- Design UI to show optimistic updates immediately; do NOT rely solely on search refresh.

### Supported Vital Signs for Create
See: https://wiki.cerner.com/pages/releaseview.action?spaceKey=reference&title=Understand%20Supported%20Vital%20Signs%20in%20the%20FHIR%20Observation%20Resource

### Lessons Learned (from Phase 1.4 implementation)
1. Missing `code.text` and `category[0].text` causes 422 errors and/or search indexing failures on Cerner.
2. Cerner sandbox rejects `Observation.component` for Blood Pressure — must POST as two separate resources.
3. `encounter.reference` should always be included when available from SMART launch context.
4. Use `identifier` with a unique value to prevent 409 Conflict from Cerner's duplicate detection.
5. `issued` should be set to current timestamp (when filed), not the measurement time (`effectiveDateTime`).
6. Cerner returns 201 with empty body — extract resource ID from `Location` header.
7. Do NOT use system-qualified LOINC codes in search (`code=http://loinc.org|8867-4`) — bare codes work and system-qualified with unencoded `|` breaks the query.

## Scope Strategy
- `patient/` scopes — for in-context patient data (single patient from EHR launch)
- `user/` scopes — for multi-patient panel access (authorized, access-derived patient set)
- Panel membership is read-only and access-derived from EHR data; do not create/assign access relationships in app logic
- Optional personal shortlist is allowed (pin/unpin ordering only), without changing EHR access permissions
- `openid fhirUser` — for practitioner identity from token
- `launch` — required for EHR launch flow
- `offline_access` — for token refresh capability
- Use SMART v2 scope syntax: `.rs` (read+search), `.crus` (create+read+update+search), `.cruds` (all)
- NOT v1 syntax: `.read`, `.write`

### Required Scopes (register on Cerner Code Console)
```
launch openid fhirUser offline_access
patient/Patient.rs
patient/Observation.crus
patient/Condition.rs
patient/MedicationRequest.rs
patient/AllergyIntolerance.rs
patient/Encounter.rs
patient/Procedure.rs
patient/DocumentReference.crus
user/Patient.rs
user/Encounter.rs
user/Observation.rs
user/Condition.rs
user/Practitioner.rs
```

## UI Design Rules (from requirement.md Section C)
- **NO scrollbars on any screen** — use viewport-height layouts (`h-screen`, `overflow-hidden`)
- Screen should accommodate/use real estate for one page — design accordingly
- Consistent colors and fonts across all screens
- Clinical color palette: blues/greens for normal, yellows for warning, reds for critical
- Consistent typography: system font stack or Inter
- Cards-based layout — no tables with horizontal scroll
- Modals for forms (vitals entry, note editing) — not new pages
- Empty states must be handled for every data display component
- Loading skeletons preferred over spinners

## Project Structure
```
src/
├── index.css           # Tailwind v4 entry: @import, @theme, @layer base/components
├── auth/               # SMART launch + token management
├── components/         # Shared UI (AppShell, PatientBanner, Modal, Toast)
├── features/
│   ├── dashboard/      # Module 1: Clinical Dashboard + Risk Scores + VitalsPanel
│   ├── insights/       # Module 2: AI Clinical Decision Assistant (stub)
│   └── notes/          # Module 3: Smart Documentation Assistant (stub)
├── hooks/              # Custom hooks (usePatientDashboard)
├── services/
│   ├── fhir/           # FHIR API wrappers (observations, conditions, practitioner, client)
│   └── ai/             # OpenAI Platform integration (future)
├── types/              # TypeScript interfaces (app.ts)
└── utils/              # Risk score calculators (news2, qsofa, ascvd, cha2ds2vasc)
```

**Deleted files** (multi-patient code removed, Tailwind migration complete):
- `src/App.css` — all 1426 lines replaced by Tailwind utilities
- `src/hooks/usePanelPatients.ts` — multi-patient hook
- `src/features/dashboard/CommandCenter.tsx` — multi-patient view
- `src/features/dashboard/PatientCard.tsx` — multi-patient card
- `src/features/dashboard/PatientList.tsx` — multi-patient list

## Decisions Already Made (Do NOT re-propose alternatives)

| Decision | Choice | Rejected Alternative |
|----------|--------|---------------------|
| App architecture | ONE bundled app with 3 modules | 3-5 separate apps |
| AI provider | Cloud AI (OpenAI Platform, prototype risk accepted) | Local models (no hardware) |
| Compliance posture | Prototype-only with PHI risk accepted (non-production) | HIPAA-ready production posture in MVP |
| Agentic AI rollout | Deferred to v1.5 as feature-flagged, read-only orchestration | Full autonomous agent behavior in MVP |
| Scheduling feature | Deferred to v2 | Include in v1 |
| Overdue task tracking | Deferred to v2 | Include in v1 dashboard |
| Panel access model | Read-only panel + personal shortlist | Add/assign patient access from app |
| Risk scores | Integrated into dashboard as badges | Standalone feature/tab |
| Preventive Care Gap Analyzer | Rejected | Overlaps with patient apps |
| Family History Profiler | Rejected | Low unique practitioner value |
| Standalone vital signs viewer | Rejected | User's Epic patient app already does this |
| SMART version | Stay v2, no re-registration | Downgrade to v1 |
| Scope strategy | `user/` + `patient/` combined | `system/` scopes (too broad) |
| **Multi-patient Command Center** | **Dropped** — single-patient dashboard only | Multi-patient panel discovery |
| **Styling approach** | **Tailwind CSS v4 utility-first** (all components) | Hand-written App.css |
| **Tailwind config format** | **CSS-based `@theme` in index.css** (v4 style) | JS-based tailwind.config.js (v3 style) |

## Sandbox Test Data Reference

### Key Test Patients (data-rich, good for demos)
| Patient | ID | Best For |
|---------|-----|---------|
| SMART, Fredrick | 12724070 | Labs (30+ results), conditions (6), vitals |
| SMART, Joe | 12724067 | Vitals, lipid panel, allergies, medications |
| SMART, Hailey | 12724068 | Medications (9 active), pediatric |
| SMART, Nancy | 12724066 | Pregnancy conditions, vitals, labs |
| SMART, Wilma | 12724065 | Multiple conditions (5), vitals, labs |
| SMART, Valerie | 12724071 | Allergies (4), microbiology reports |

### Test Practitioners
| Name | ID |
|------|-----|
| Applegate MD, Christina | Practitioner/593923 |
| Martin, MD, Mary Cerner | Practitioner/11724002 |
| Porter, Andy Cerner | Practitioner/4122620 |

### Test Credentials (for Code Console launch)
- Provider login credentials are managed through Cerner Code Console
- Patient access logins: `nancysmart/Cerner01`, `joesmart1/Cerner01`, `fredricksmart/Cerner01`, etc.

## Environment Variables Template
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
