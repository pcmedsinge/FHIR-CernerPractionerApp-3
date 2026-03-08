# Cerner FHIR Reference

This document centralizes official reference URLs for Cerner/Oracle Health FHIR implementation and SMART on FHIR behavior.

## SMART on FHIR Core References

- SMART App Launch (launch + authorization flow): https://build.fhir.org/ig/HL7/smart-app-launch/app-launch.html
- SMART Scopes and Launch Context: https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html

## Oracle Health (Cerner) FHIR R4 References

- R4 Overview: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/r4_overview.html
- All REST Endpoints Index: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/rest-endpoints.html
- Metadata (`/metadata`): https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-metadata-get.html
- SMART Configuration (`/.well-known/smart-configuration`): https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-well-known-smart-configuration-get.html
- Authorization Framework: https://docs.oracle.com/en/industries/health/millennium-platform-apis/millennium-authorization-framework/
- Service Root URL format: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/srv_root_url.html

## Resource/Operation References Used in This Project

- Observation API overview: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/api-observation.html
- Observation GET list: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-observation-get.html
- Observation POST create: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-observation-post.html
- Encounter GET list: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-encounter-get.html
- Patient GET list: https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-patient-get.html

## Configured Tenant Endpoints (from requirement.md Section B)

- Authorization endpoint: https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/personas/provider/authorize
- Token endpoint: https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token
- Base FHIR URL: https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d
- Redirect URL: http://127.0.0.1:5173
- Client ID: 66037bbc-cc54-405b-b3fd-5fbeaeac4251

## Implementation Notes (Quick Reminders)

- Cerner metadata may expose v1-style auth/token URL paths while SMART v2 scopes are still valid.
- Always include `aud` equal to the FHIR base URL during authorize requests.
- Use `offline_access` for refresh token behavior aligned to your app registration.
- For observations, implement LOINC-first matching with fallbacks for proprietary/local code aliases.

## Cerner FHIR Observation API — Detailed Reference

**CRITICAL**: Always consult the sources below BEFORE implementing any FHIR create/search operation. Cerner has undocumented or subtle requirements that differ from the base FHIR spec.

### Primary Source Documents
- **Observation API docs (GitHub source — more reliable than redirecting Oracle docs)**:
  https://github.com/cerner/fhir.cerner.com/blob/main/content/millennium/r4/clinical/diagnostics/observation.md
- **Official JSON examples (create bodies, search responses, update bodies)**:
  https://github.com/cerner/fhir.cerner.com/blob/main/lib/resources/example_json/r4_examples_observation.rb
- **Supported Vital Signs list**:
  https://wiki.cerner.com/pages/releaseview.action?spaceKey=reference&title=Understand%20Supported%20Vital%20Signs%20in%20the%20FHIR%20Observation%20Resource
- **Blood Pressure Pairing Configuration**:
  https://wiki.cerner.com/display/public/reference/Configure+Blood+Pressure+Event+Set+Hierarchy+Pairing

### How to Use These Sources
1. **Before implementing any resource create (POST)**: Find the matching `_CREATE` example in `r4_examples_observation.rb`. Compare every field in your payload against Cerner's example. Missing fields like `code.text` or `category.text` will cause silent failures.
2. **Before implementing any resource search (GET)**: Read the Search Parameters section in `observation.md`. Check the notes about which codes work for search vs. which don't (e.g., component codes don't return panel resources).
3. **Before debugging create failures**: Check `observation.md` Implementation Notes for known quirks (e.g., component support limitations, duplicate detection, eventual consistency).

### Key Cerner-Specific Behaviors (from official docs)
- "Searching records with vital-signs category by code with proprietary system will result in empty response."
- "Using the component codes 8480-6(Systolic BP) or 8462-4(Diastolic BP) will not return the resource" (for component-based BP observations).
- "Components are supported only when writing Observation Blood Pressure and Pulse Oximetry Profiles." (But sandbox may still reject them.)
- Observation Create returns 201 with empty body; resource ID is in the `Location` header.
- Cerner uses eventual consistency (CQRS): search results may lag 30-120 seconds behind writes.
