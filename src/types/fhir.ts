/**
 * Lightweight FHIR R4 type definitions used across the app.
 * Only the shapes we actually consume — not a full spec binding.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface Coding {
  system?: string
  code?: string
  display?: string
}

export interface CodeableConcept {
  coding?: Coding[]
  text?: string
}

export interface Quantity {
  value?: number
  unit?: string
  system?: string
  code?: string
}

export interface Reference {
  reference?: string
  display?: string
}

export interface HumanName {
  family?: string
  given?: string[]
  text?: string
  use?: string
}

export interface Identifier {
  system?: string
  value?: string
  type?: CodeableConcept
}

export interface Period {
  start?: string
  end?: string
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface FhirPatient {
  resourceType: 'Patient'
  id?: string
  name?: HumanName[]
  birthDate?: string
  gender?: string
  identifier?: Identifier[]
}

export interface FhirPractitioner {
  resourceType: 'Practitioner'
  id?: string
  name?: HumanName[]
  identifier?: Identifier[]
}

export interface EncounterParticipant {
  individual?: Reference
  type?: CodeableConcept[]
}

export interface FhirEncounter {
  resourceType: 'Encounter'
  id?: string
  status?: string
  subject?: Reference
  participant?: EncounterParticipant[]
  period?: Period
  type?: CodeableConcept[]
  class?: Coding
}

export interface ObservationComponent {
  code?: CodeableConcept
  valueQuantity?: Quantity
}

export interface FhirObservation {
  resourceType: 'Observation'
  id?: string
  code?: CodeableConcept
  valueQuantity?: Quantity
  valueCodeableConcept?: CodeableConcept
  component?: ObservationComponent[]
  effectiveDateTime?: string
  issued?: string
  status?: string
  category?: CodeableConcept[]
  subject?: Reference
  referenceRange?: Array<{
    low?: Quantity
    high?: Quantity
    text?: string
  }>
}

export interface FhirCondition {
  resourceType: 'Condition'
  id?: string
  code?: CodeableConcept
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  subject?: Reference
  onsetDateTime?: string
  category?: CodeableConcept[]
}

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest'
  id?: string
  status?: string
  medicationCodeableConcept?: CodeableConcept
  medicationReference?: Reference
  dosageInstruction?: Array<{
    text?: string
    timing?: { code?: CodeableConcept }
    doseAndRate?: Array<{ doseQuantity?: Quantity }>
  }>
  subject?: Reference
  authoredOn?: string
}

export interface FhirAllergyIntolerance {
  resourceType: 'AllergyIntolerance'
  id?: string
  code?: CodeableConcept
  clinicalStatus?: CodeableConcept
  type?: string
  category?: string[]
  criticality?: 'low' | 'high' | 'unable-to-assess'
  reaction?: Array<{
    substance?: CodeableConcept
    manifestation?: CodeableConcept[]
    severity?: string
  }>
  subject?: Reference
  recordedDate?: string
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

export interface BundleLink {
  relation?: string
  url?: string
}

export interface BundleEntry<T = Record<string, unknown>> {
  resource?: T
  fullUrl?: string
}

export interface FhirBundle<T = Record<string, unknown>> {
  resourceType: 'Bundle'
  type?: string
  total?: number
  entry?: BundleEntry<T>[]
  link?: BundleLink[]
}
