/**
 * Shared FHIR client — centralised HTTP wrapper with Bearer auth,
 * timeout, 401/403 interception, and Cerner-friendly defaults.
 *
 * Every FHIR service module should use `fhirFetch` instead of raw `fetch`
 * so error handling and token management stay in one place.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export class FhirHttpError extends Error {
  readonly status: number
  readonly statusText: string
  readonly operationOutcome: string | undefined
  /** Parsed diagnostics from OperationOutcome (if any) */
  readonly diagnostics: string | undefined

  constructor(status: number, statusText: string, operationOutcome?: string) {
    // Try to extract diagnostics from OperationOutcome JSON
    let diagnostics: string | undefined
    if (operationOutcome) {
      try {
        const oo = JSON.parse(operationOutcome) as {
          issue?: Array<{ severity?: string; diagnostics?: string; details?: { text?: string } }>
        }
        if (oo.issue && oo.issue.length > 0) {
          diagnostics = oo.issue
            .map(i => i.diagnostics ?? i.details?.text ?? `${i.severity ?? 'error'}`)
            .join('; ')
        }
      } catch { /* not JSON — keep raw */ }
    }

    const baseMsg =
      status === 401
        ? 'Session expired — please re-launch the app from the EHR.'
        : status === 403
          ? 'Insufficient permissions — the required FHIR scope may not be registered.'
          : `FHIR request failed (${status} ${statusText})`

    super(diagnostics ? `${baseMsg}: ${diagnostics}` : baseMsg)

    this.name = 'FhirHttpError'
    this.status = status
    this.statusText = statusText
    this.operationOutcome = operationOutcome
    this.diagnostics = diagnostics
  }
}

// ---------------------------------------------------------------------------
// Global refresh handler — set once by AuthProvider so all fhirFetch calls
// can automatically attempt a token refresh on 401.
// ---------------------------------------------------------------------------

let _globalRefreshHandler: (() => Promise<string | null>) | null = null

/**
 * Register a global token-refresh callback. Called by AuthProvider on mount.
 * When fhirFetch receives a 401, it will call this to obtain a fresh token
 * and retry the request once.
 */
export function setTokenRefreshHandler(handler: (() => Promise<string | null>) | null): void {
  _globalRefreshHandler = handler
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseUrl(): string {
  return (import.meta.env.VITE_FHIR_BASE_URL as string).replace(/\/$/, '')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FhirFetchOptions {
  /** HTTP method (default GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** JSON body — will be serialised automatically */
  body?: unknown
  /** Abort signal for caller-managed cancellation */
  signal?: AbortSignal
  /** Request timeout in ms (default 30 000) */
  timeout?: number
  /**
   * Called on 401 to attempt a token refresh. Should return the new access
   * token, or null if refresh is unavailable. If a new token is returned the
   * request is retried once.
   */
  onUnauthorized?: () => Promise<string | null>
}

/**
 * Perform an authenticated FHIR request.
 *
 * @param path   Relative path (e.g. `Observation?patient=123`) **or** absolute
 *               URL (Cerner pagination next-links are absolute).
 * @param token  Bearer access token.
 * @param opts   Optional method / body / signal / timeout overrides.
 * @returns      Parsed JSON response.
 */
export async function fhirFetch<T = unknown>(
  path: string,
  token: string,
  opts: FhirFetchOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal: externalSignal, timeout = 30_000, onUnauthorized } = opts

  const url = path.startsWith('http') ? path : `${baseUrl()}/${path}`

  async function doFetch(bearerToken: string): Promise<T> {
    // Combine caller signal with an internal timeout
    const controller = new AbortController()
    const timer = timeout > 0 ? window.setTimeout(() => controller.abort(), timeout) : undefined

    // If the caller also passes an AbortSignal, forward its abort
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/fhir+json',
    }
    if (body) {
      headers['Content-Type'] = 'application/fhir+json'
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      if (!res.ok) {
        let oo: string | undefined
        try { oo = await res.text() } catch { /* ignore */ }
        throw new FhirHttpError(res.status, res.statusText, oo)
      }

      // 201 Created / 204 No Content may have no body
      const text = await res.text()
      const parsed: Record<string, unknown> = text ? (JSON.parse(text) as Record<string, unknown>) : {}

      // Cerner often returns 201 with an empty body but puts the resource
      // location in the Location header (e.g. ".../Observation/12345/_history/1").
      // Extract the ID so callers can use it.
      if (!parsed.id && (res.status === 201 || res.status === 200)) {
        const loc = res.headers.get('Location') ?? res.headers.get('Content-Location') ?? ''
        // Pattern: .../ResourceType/ID or .../ResourceType/ID/_history/N
        const match = loc.match(/\/([^/]+)\/_history\//) ?? loc.match(/\/([^/]+)\s*$/)
        if (match?.[1]) {
          parsed.id = match[1]
        }
      }

      return parsed as T
    } finally {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }

  try {
    return await doFetch(token)
  } catch (err) {
    // On 401, attempt a token refresh and retry once
    if (err instanceof FhirHttpError && err.status === 401) {
      const refreshFn = onUnauthorized ?? _globalRefreshHandler
      if (refreshFn) {
        const newToken = await refreshFn()
        if (newToken) {
          return doFetch(newToken)
        }
      }
    }
    throw err
  }
}

