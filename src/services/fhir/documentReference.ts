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
  docStatus: 'preliminary' | 'final' | 'amended'
  type: {
    coding: Array<{
      system: string
      code: string
      display: string
      userSelected?: boolean
    }>
    text: string
  }
  subject: { reference: string }
  date: string
  author: Array<{ reference: string }>
  content: Array<{
    attachment: {
      contentType: string
      data: string
      title: string
      creation: string
    }
  }>
  context?: {
    encounter?: Array<{ reference: string }>
    period?: { start: string; end: string }
  }
  description?: string
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

    const noteTitle = formatLabels[noteFormat] ?? 'Clinical Note'

    // Cerner requires: docStatus, type.text, author, context.period
    // Type coding uses Cerner codeSet/72 — '2820507' = "Admission Note Physician"
    // is a commonly available code on this tenant.
    const resource: DocumentReferenceResource = {
      resourceType: 'DocumentReference',
      status: 'current',
      docStatus: 'final',
      type: {
        coding: [{
          system: `https://fhir.cerner.com/${import.meta.env.VITE_CERNER_TENANT_ID ?? 'ec2458f2-1e24-41c8-b71b-0e701af7583d'}/codeSet/72`,
          code: '2820507',
          display: 'Admission Note Physician',
          userSelected: true,
        }],
        text: noteTitle,
      },
      subject: { reference: `Patient/${patientId}` },
      date: now,
      author: [{ reference: `Practitioner/${practitionerId ?? '0'}` }],
      content: [{
        attachment: {
          contentType: 'application/xml;charset=utf-8',
          data: btoa(unescape(encodeURIComponent(
            `<html><title>${noteTitle}</title><body><pre>${noteContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`
          ))),
          title: noteTitle,
          creation: now,
        },
      }],
      description: `AI-assisted ${noteTitle} — PractitionerHub`,
    }

    // Encounter + period context
    if (encounterId) {
      resource.context = {
        encounter: [{ reference: `Encounter/${encounterId}` }],
        period: { start: now, end: now },
      }
    } else {
      resource.context = {
        period: { start: now, end: now },
      }
    }

    console.debug('[DocumentReference] POST payload:', JSON.stringify(resource, null, 2))

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
    // Surface full details for any FHIR error
    if (err instanceof FhirHttpError) {
      console.error(`[DocumentReference] FHIR ${err.status} error:`, {
        status: err.status,
        statusText: err.statusText,
        diagnostics: err.diagnostics,
        operationOutcome: err.operationOutcome,
      })

      // Scope/permission errors — expected in sandbox
      if (err.status === 401 || err.status === 403) {
        return {
          success: false,
          documentId: null,
          error: 'DocumentReference write not authorized — note saved locally. Add DocumentReference.write scope for EHR persistence.',
        }
      }

      // Validation errors (422) — Cerner rejected the payload
      const detail = err.diagnostics ?? err.operationOutcome?.slice(0, 500) ?? err.statusText
      return {
        success: false,
        documentId: null,
        error: `FHIR ${err.status}: ${detail}`,
      }
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error('[DocumentReference] Unexpected error:', err)
    return {
      success: false,
      documentId: null,
      error: `Failed to save note: ${message}`,
    }
  }
}
