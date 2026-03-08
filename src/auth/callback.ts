/**
 * SMART on FHIR OAuth2 callback handler.
 *
 * Uses a module-level singleton promise to prevent race conditions caused by
 * React StrictMode double-firing useEffect. Without this guard, the second
 * effect invocation calls oauth2.ready() AFTER the first one already removed
 * the `code` parameter from the URL, causing fhirclient to skip the token
 * exchange and return a client with an empty token response.
 */

export interface AuthSession {
	accessToken: string
	/** Always present when status is 'authenticated'. */
	patientId: string
	fhirUser: string | null
	/** Extracted Practitioner ID (e.g. '593923') from fhirUser claim. */
	practitionerId: string | null
	/** Encounter ID from SMART launch context (may be absent). */
	encounterId: string | null
	scope: string
	needPatientBanner: boolean
}

export interface AuthCallbackResult {
	session: AuthSession
	/** The fhirclient Client object — kept so we can call refresh(). */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	smartClient: any
}

// ---------------------------------------------------------------------------
// Singleton guard — ensures only one oauth2.ready() call is in flight at a
// time, even when React StrictMode double-fires effects.
// ---------------------------------------------------------------------------

let activeCallback: Promise<AuthCallbackResult> | null = null

/**
 * Public entry point. Returns the in-flight promise if one already exists so
 * concurrent callers receive the same result.
 */
export function handleSmartCallback(): Promise<AuthCallbackResult> {
	if (!activeCallback) {
		activeCallback = performCallback().finally(() => {
			activeCallback = null
		})
	}

	return activeCallback
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function asString(value: unknown): string {
	if (typeof value === 'string') {
		const trimmed = value.trim()
		return trimmed.length > 0 ? trimmed : ''
	}

	return ''
}

function extractBearer(header: unknown): string {
	if (typeof header !== 'string') {
		return ''
	}

	const match = /^Bearer\s+(.+)$/i.exec(header)
	return match?.[1]?.trim() ?? ''
}

async function performCallback(): Promise<AuthCallbackResult> {
	const mod: any = await import('fhirclient')
	const FHIR: any = mod.default ?? mod

	if (typeof FHIR?.oauth2?.ready !== 'function') {
		throw new Error('fhirclient module loaded but oauth2.ready() is unavailable.')
	}

	// fhirclient handles:
	//  - state lookup in sessionStorage
	//  - code-for-token exchange with the authorization server
	//  - URL cleanup (removes code & state query params)
	//  - Client construction with the full token response
	const client: any = await FHIR.oauth2.ready()

	// ---- Access token ----
	// Use getState (public Client API) with fallback to getAuthorizationHeader.
	const accessToken =
		asString(client.getState?.('tokenResponse.access_token')) ||
		extractBearer(client.getAuthorizationHeader?.())

	if (!accessToken) {
		const stateKeys = Object.keys(client.getState?.() ?? {})
		const trKeys = Object.keys(client.getState?.('tokenResponse') ?? {})

		throw new Error(
			'SMART callback: no access_token received from authorization server. ' +
				`State keys: [${stateKeys.join(', ')}]. ` +
				`TokenResponse keys: [${trKeys.join(', ')}]. ` +
				'Please close this tab and re-launch from the EHR.',
		)
	}

	// ---- Patient context ----
	const patientId =
		asString(client.patient?.id) ||
		asString(client.getState?.('tokenResponse.patient'))

	if (!patientId) {
		throw new Error(
			'Patient context was not included in the SMART authorization response. ' +
				'Ensure the app is launched from within a patient chart in the EHR.',
		)
	}

	// ---- fhirUser ----
	const fhirUser =
		asString(client.user?.fhirUser) ||
		asString(client.getState?.('tokenResponse.fhirUser')) ||
		null

	// ---- Scope ----
	const scope = asString(client.getState?.('tokenResponse.scope'))

	// ---- need_patient_banner ----
	const rawBanner: unknown = client.getState?.('tokenResponse.need_patient_banner')
	const needPatientBanner =
		rawBanner === true || String(rawBanner).toLowerCase() === 'true'

	// ---- Practitioner ID ----
	const practitionerId = fhirUser && fhirUser.startsWith('Practitioner/')
		? fhirUser.replace('Practitioner/', '')
		: null

	// ---- Encounter context ----
	const encounterId =
		asString(client.encounter?.id) ||
		asString(client.getState?.('tokenResponse.encounter')) ||
		null

	return {
		session: { accessToken, patientId, fhirUser, practitionerId, encounterId, scope, needPatientBanner },
		smartClient: client,
	}
}
