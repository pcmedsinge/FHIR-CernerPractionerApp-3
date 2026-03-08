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
		return 'Unknown age'
	}

	const birth = new Date(birthDate)
	if (Number.isNaN(birth.getTime())) {
		return 'Unknown age'
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
	return bySystemHint?.value ?? 'Unavailable'
}

export function PatientBanner() {
	const { session } = useAuth()
	const patientId = session?.patientId ?? null
	const shouldShowBanner = Boolean(session?.needPatientBanner && patientId)

	const [patient, setPatient] = useState<PatientResource | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const accessToken = session?.accessToken ?? ''
		const resolvedPatientId = patientId ?? ''

		if (!shouldShowBanner || !resolvedPatientId || !accessToken) {
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
	}, [shouldShowBanner, patientId, session?.accessToken])

	const displayName = useMemo(() => extractDisplayName(patient), [patient])
	const birthDate = patient?.birthDate ?? 'Unknown DOB'
	const age = useMemo(() => calculateAge(patient?.birthDate), [patient?.birthDate])
	const gender = patient?.gender ? patient.gender.toUpperCase() : 'UNKNOWN'
	const mrn = useMemo(() => extractMrn(patient), [patient])

	if (!shouldShowBanner) {
		return null
	}

	if (loading) {
		return <div className="shrink-0 px-5 py-3.5 bg-slate-700 text-white text-sm">Loading patient context...</div>
	}

	if (error) {
		return <div className="shrink-0 px-5 py-3.5 bg-red-900 text-white text-sm">Patient banner unavailable: {error}</div>
	}

	return (
		<div className="shrink-0 flex flex-wrap gap-4 items-center px-5 py-2.5 bg-slate-900 text-white text-sm">
			<span><strong>{displayName}</strong></span>
			<span>DOB: {birthDate}</span>
			<span>Age: {age}</span>
			<span>Gender: {gender}</span>
			<span>MRN: {mrn}</span>
		</div>
	)
}
