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
