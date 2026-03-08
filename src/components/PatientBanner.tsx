import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

interface HumanName {
	family?: string
	given?: string[]
}

interface IdentifierTypeCoding {
	code?: string
}

interface IdentifierType {
	coding?: IdentifierTypeCoding[]
}

interface PatientIdentifier {
	system?: string
	value?: string
	type?: IdentifierType
}

interface PatientResource {
	name?: HumanName[]
	birthDate?: string
	gender?: string
	identifier?: PatientIdentifier[]
}

function calculateAge(birthDate?: string): string {
	if (!birthDate) {
		return '?y'
	}

	const birth = new Date(birthDate)
	if (Number.isNaN(birth.getTime())) {
		return '?y'
	}

	const today = new Date()
	let age = today.getFullYear() - birth.getFullYear()
	const hasBirthdayPassedThisYear =
		today.getMonth() > birth.getMonth() ||
		(today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())

	if (!hasBirthdayPassedThisYear) {
		age -= 1
	}

	return `${age}y`
}

function extractDisplayName(resource: PatientResource | null): string {
	const firstName = resource?.name?.[0]
	if (!firstName) {
		return 'Unknown Patient'
	}

	const family = firstName.family?.trim() ?? ''
	const given = firstName.given?.join(' ').trim() ?? ''
	return [family, given].filter(Boolean).join(', ') || 'Unknown Patient'
}

function extractMrn(resource: PatientResource | null): string {
	const identifiers = resource?.identifier ?? []
	const byMrnType = identifiers.find((item) =>
		item.type?.coding?.some((coding) => coding.code?.toUpperCase() === 'MR')
	)

	if (byMrnType?.value) {
		return byMrnType.value
	}

	const bySystemHint = identifiers.find((item) => item.system?.toLowerCase().includes('mrn'))
	return bySystemHint?.value ?? ''
}

// ---------------------------------------------------------------------------
// Hook — provides patient context data for header label
// ---------------------------------------------------------------------------

export interface PatientContext {
	loading: boolean
	error: string | null
	displayName: string
	age: string
	gender: string
	mrn: string
	/** Compact one-line label for inline display: "SMART, Joe · 42y M · MRN 12345" */
	headerLabel: string | null
}

export function usePatientContext(): PatientContext {
	const { session } = useAuth()
	const patientId = session?.patientId ?? null
	const shouldLoad = Boolean(session?.needPatientBanner && patientId)

	const [patient, setPatient] = useState<PatientResource | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const accessToken = session?.accessToken ?? ''
		const resolvedPatientId = patientId ?? ''

		if (!shouldLoad || !resolvedPatientId || !accessToken) {
			setPatient(null)
			setError(null)
			setLoading(false)
			return
		}

		let active = true

		async function loadPatient(): Promise<void> {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(
					`${import.meta.env.VITE_FHIR_BASE_URL.replace(/\/$/, '')}/Patient/${encodeURIComponent(resolvedPatientId)}`,
					{
						method: 'GET',
						headers: {
							Authorization: `Bearer ${accessToken}`,
							Accept: 'application/fhir+json',
						},
					}
				)

				if (!response.ok) {
					const message = await response.text()
					throw new Error(`Patient fetch failed (${response.status}): ${message}`)
				}

				const data = (await response.json()) as PatientResource
				if (!active) {
					return
				}

				setPatient(data)
			} catch (caughtError: unknown) {
				if (!active) {
					return
				}

				const message =
					caughtError instanceof Error ? caughtError.message : 'Unable to load patient context.'
				setError(message)
			} finally {
				if (active) {
					setLoading(false)
				}
			}
		}

		void loadPatient()

		return () => {
			active = false
		}
	}, [shouldLoad, patientId, session?.accessToken])

	const displayName = useMemo(() => extractDisplayName(patient), [patient])
	const age = useMemo(() => calculateAge(patient?.birthDate), [patient?.birthDate])
	const gender = patient?.gender ? patient.gender.charAt(0).toUpperCase() : '?'
	const mrn = useMemo(() => extractMrn(patient), [patient])

	const headerLabel = useMemo(() => {
		if (!shouldLoad) return null
		if (loading) return 'Loading patient…'
		if (error) return 'Patient unavailable'
		const parts = [displayName, `${age} ${gender}`]
		if (mrn) parts.push(`MRN ${mrn}`)
		return parts.join(' · ')
	}, [shouldLoad, loading, error, displayName, age, gender, mrn])

	return { loading, error, displayName, age, gender, mrn, headerLabel }
}

// ---------------------------------------------------------------------------
// Legacy component — kept for backward compat but now a no-op
// (Patient info is shown in the unified header via usePatientContext)
// ---------------------------------------------------------------------------

export function PatientBanner() {
	return null
}
