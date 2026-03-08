/**
 * FHIR DocumentReference Service — save clinical notes to the EHR.
 *
 * Creates a DocumentReference resource containing the note as base64 text.
 * Links to the current patient and encounter.
 *
 * NOTE: Cerner sandbox may reject this if DocumentReference.write scope
 * is not granted. The app gracefully falls back to localStorage + clipboard.
 * When scopes are expanded for production, this service will work seamlessly.
 */

import { fhirFetch, FhirHttpError } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveNoteResult {
  success: boolean
  documentId: string | null
  error: string | null
}

interface DocumentReferenceResource {
  resourceType: 'DocumentReference'
  status: 'current'
  type: {
    coding: Array<{
      system: string
      code: string
      display: string
    }>
  }
  subject: { reference: string }
  date: string
  author?: Array<{ reference: string }>
  context?: {
    encounter?: Array<{ reference: string }>
  }
  content: Array<{
    attachment: {
      contentType: string
      data: string
      title: string
      creation: string
    }
  }>
  description: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save a clinical note as a FHIR DocumentReference.
 *
 * @param patientId - FHIR Patient ID
 * @param accessToken - OAuth2 access token
 * @param noteContent - Plain text note content
 * @param noteFormat - 'soap' | 'ap' | 'handoff'
 * @param practitionerId - Optional practitioner reference
 * @param encounterId - Optional encounter reference
 */
export async function saveNoteAsDocumentReference(
  patientId: string,
  accessToken: string,
  noteContent: string,
  noteFormat: string,
  practitionerId?: string | null,
  encounterId?: string | null,
): Promise<SaveNoteResult> {
  try {
    const now = new Date().toISOString()

    const formatLabels: Record<string, string> = {
      soap: 'SOAP Note',
      ap: 'Assessment & Plan',
      handoff: 'SBAR Handoff Note',
    }

    const resource: DocumentReferenceResource = {
      resourceType: 'DocumentReference',
      status: 'current',
      type: {
        coding: [{
          system: 'http://loinc.org',
          code: '11506-3',
          display: 'Progress note',
        }],
      },
      subject: { reference: `Patient/${patientId}` },
      date: now,
      content: [{
        attachment: {
          contentType: 'text/plain',
          data: btoa(unescape(encodeURIComponent(noteContent))),
          title: formatLabels[noteFormat] ?? 'Clinical Note',
          creation: now,
        },
      }],
      description: `AI-assisted ${formatLabels[noteFormat] ?? 'Clinical Note'} — PractitionerHub`,
    }

    // Optional references
    if (practitionerId) {
      resource.author = [{ reference: `Practitioner/${practitionerId}` }]
    }
    if (encounterId) {
      resource.context = {
        encounter: [{ reference: `Encounter/${encounterId}` }],
      }
    }

    const created = await fhirFetch<{ id?: string }>('DocumentReference', accessToken, {
      method: 'POST',
      body: resource,
    })

    return {
      success: true,
      documentId: created.id ?? null,
      error: null,
    }
  } catch (err) {
    // Check for scope/permission errors — expected in sandbox
    if (err instanceof FhirHttpError && (err.status === 401 || err.status === 403)) {
      return {
        success: false,
        documentId: null,
        error: 'DocumentReference write not authorized — note saved locally. Add DocumentReference.write scope for EHR persistence.',
      }
    }

    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      documentId: null,
      error: `Failed to save note: ${message}`,
    }
  }
}
