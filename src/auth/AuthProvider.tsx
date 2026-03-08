import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { handleSmartCallback, type AuthSession } from './callback'
import { hasSmartLaunchParams, initiateSmartLaunch } from './launch'
import { setTokenRefreshHandler } from '../services/fhir/client'

type AuthStatus =
	| 'initializing'
	| 'launching'
	| 'authenticated'
	| 'unauthenticated'
	| 'error'

interface AuthContextValue {
	status: AuthStatus
	session: AuthSession | null
	error: string | null
	/**
	 * Attempt to refresh the access token using the fhirclient Client.
	 * Returns the new access token on success, or null if refresh is unavailable.
	 */
	refreshSession: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function getRedirectPathname(): string {
	const redirectUri = import.meta.env.VITE_REDIRECT_URI
	if (!redirectUri) {
		return '/'
	}

	try {
		const parsed = new URL(redirectUri)
		return parsed.pathname || '/'
	} catch {
		return '/'
	}
}

function isSmartCallbackRequest(): boolean {
	const query = new URLSearchParams(window.location.search)
	return query.has('state') || query.has('code') || query.has('error')
}

interface AuthProviderProps {
	children: ReactNode
}

const SMART_SESSION_STORAGE_KEY = 'practitionerhub.smart.session'

function readStoredSession(): AuthSession | null {
	try {
		const raw = window.sessionStorage.getItem(SMART_SESSION_STORAGE_KEY)
		if (!raw) {
			return null
		}

		const parsed = JSON.parse(raw) as Partial<AuthSession>
		if (!parsed || typeof parsed !== 'object') {
			return null
		}

		if (typeof parsed.accessToken !== 'string' || parsed.accessToken.trim().length === 0) {
			return null
		}

		if (typeof parsed.patientId !== 'string' || parsed.patientId.trim().length === 0) {
			return null
		}

		const fhirUser = typeof parsed.fhirUser === 'string' && parsed.fhirUser.trim() ? parsed.fhirUser : null
		const practitionerId = fhirUser && fhirUser.startsWith('Practitioner/')
			? fhirUser.replace('Practitioner/', '')
			: (typeof parsed.practitionerId === 'string' && parsed.practitionerId.trim() ? parsed.practitionerId : null)
		const encounterId = typeof parsed.encounterId === 'string' && parsed.encounterId.trim() ? parsed.encounterId : null

		return {
			accessToken: parsed.accessToken,
			patientId: parsed.patientId,
			fhirUser,
			practitionerId,
			encounterId,
			scope: typeof parsed.scope === 'string' ? parsed.scope : '',
			needPatientBanner: Boolean(parsed.needPatientBanner),
		}
	} catch {
		return null
	}
}

function writeStoredSession(session: AuthSession): void {
	try {
		window.sessionStorage.setItem(SMART_SESSION_STORAGE_KEY, JSON.stringify(session))
	} catch {
		// no-op
	}
}

/**
 * Clear ALL sessionStorage entries. This removes both our stored session
 * AND fhirclient's internal state entries (SMART_KEY, state UUIDs, etc.)
 * which can accumulate across multiple launches and cause stale-state bugs.
 */
function clearAllSessionStorage(): void {
	try {
		window.sessionStorage.clear()
	} catch {
		// no-op
	}
}

export function AuthProvider({ children }: AuthProviderProps) {
	const [status, setStatus] = useState<AuthStatus>('initializing')
	const [session, setSession] = useState<AuthSession | null>(null)
	const [error, setError] = useState<string | null>(null)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const smartClientRef = useRef<any>(null)
	// Guard against concurrent refresh attempts
	const refreshPromiseRef = useRef<Promise<string | null> | null>(null)

	useEffect(() => {
		let mounted = true

		async function bootstrapAuth(): Promise<void> {
			try {
				const callbackPath = getRedirectPathname()
				const onCallbackPath = window.location.pathname === callbackPath
				const isCallback = isSmartCallbackRequest()

				if (hasSmartLaunchParams()) {
					// New EHR launch: wipe ALL sessionStorage (our key + fhirclient
					// state keys) so no stale entries persist across launches.
					clearAllSessionStorage()
					setStatus('launching')
					await initiateSmartLaunch()
					return
				}

			if (onCallbackPath && isCallback) {
					// handleSmartCallback throws if patient context is missing,
					// so we never reach the authenticated state without a patientId.
					const { session: authSession, smartClient } = await handleSmartCallback()
					if (!mounted) {
						return
					}

					smartClientRef.current = smartClient
					writeStoredSession(authSession)
					setSession(authSession)
					setStatus('authenticated')
					setError(null)
					window.history.replaceState({}, document.title, '/')
					return
				}

				const storedSession = readStoredSession()
				if (storedSession) {
					setSession(storedSession)
					setStatus('authenticated')
					setError(null)
					return
				}

				setStatus('unauthenticated')
			} catch (caughtError: unknown) {
				if (!mounted) {
					return
				}

				clearAllSessionStorage()
				setStatus('error')
				if (caughtError instanceof Error) {
					setError(caughtError.message)
				} else {
					setError('SMART authentication failed with an unknown error.')
				}
			}
		}

		void bootstrapAuth()

		return () => {
			mounted = false
		}
	}, [])

	// ---- Token refresh ----
	const refreshSession = useCallback(async (): Promise<string | null> => {
		// If a refresh is already in-flight, piggyback on it
		if (refreshPromiseRef.current) {
			return refreshPromiseRef.current
		}

		const doRefresh = async (): Promise<string | null> => {
			const client = smartClientRef.current
			if (!client || typeof client.refresh !== 'function') {
				console.warn('[Auth] No fhirclient Client available for token refresh.')
				return null
			}

			try {
				console.log('[Auth] Attempting token refresh…')
				const refreshed = await client.refresh()

				// fhirclient refresh() returns a new Client instance or mutates the existing one.
				// Either way, extract the new access_token.
				const newClient = refreshed ?? client
				smartClientRef.current = newClient

				const newToken: string =
					(typeof newClient.getState === 'function'
						? String(newClient.getState('tokenResponse.access_token') ?? '')
						: '') || ''

				if (!newToken) {
					console.warn('[Auth] Refresh succeeded but no new access_token found.')
					return null
				}

				console.log('[Auth] Token refreshed successfully.')

				// Update session in state and sessionStorage
				setSession(prev => {
					if (!prev) return prev
					const updated = { ...prev, accessToken: newToken }
					writeStoredSession(updated)
					return updated
				})

				return newToken
			} catch (err) {
				console.error('[Auth] Token refresh failed:', err)
				return null
			}
		}

		refreshPromiseRef.current = doRefresh().finally(() => {
			refreshPromiseRef.current = null
		})

		return refreshPromiseRef.current
	}, [])

	// Register the refresh handler globally so fhirFetch can auto-retry on 401
	useEffect(() => {
		setTokenRefreshHandler(refreshSession)
		return () => setTokenRefreshHandler(null)
	}, [refreshSession])

	const value = useMemo<AuthContextValue>(
		() => ({
			status,
			session,
			error,
			refreshSession,
		}),
		[status, session, error, refreshSession]
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext)
	if (!context) {
		throw new Error('useAuth must be used within AuthProvider.')
	}

	return context
}
