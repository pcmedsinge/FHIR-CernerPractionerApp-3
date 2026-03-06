# Agent Guidelines — PractitionerHub

## Behavioral Rules
- NEVER push to GitHub without explicit user permission
- NEVER create files without explicit user permission during planning phases
- Ask before making structural changes to project layout
- When unsure, ask — don't assume
- Always reference requirement.md Section B for Cerner configuration values
- For official Cerner/SMART URLs, use `Cerner FHIR ref .md`
- Always reference this file at the start of every implementation session

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
- **Framework**: React (functional components + hooks only)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS only — no inline styles, no CSS modules
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
├── auth/           # SMART launch + token management
├── components/     # Shared UI (PatientBanner, VitalCard, Badge, Modal, Toast)
├── features/
│   ├── dashboard/  # Module 1: Command Center + Risk Scores
│   ├── insights/   # Module 2: AI Clinical Decision Assistant
│   └── notes/      # Module 3: Smart Documentation Assistant
├── hooks/          # Custom hooks (useFhirClient, usePatient, usePanelPatients)
├── services/
│   ├── fhir/       # FHIR API wrappers (observations, conditions, patients, etc.)
│   └── ai/         # OpenAI Platform integration
├── types/          # TypeScript interfaces for FHIR resources + app types
└── utils/          # Risk score calculators, formatters, validators
```

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
