import { useAuth } from './auth/AuthProvider'
import { hasSmartLaunchParams } from './auth/launch'
import { AppShell } from './components/AppShell'
import { PatientBanner } from './components/PatientBanner'
import { PatientBriefing } from './features/briefing/PatientBriefing'

function App() {
  const { status, error } = useAuth()

  if (status === 'initializing' || status === 'launching') {
    return (
      <AppShell title="PractitionerHub" subtitle="SMART launch in progress">
        <p className="m-0 text-[15px]">Initializing SMART on FHIR authorization...</p>
      </AppShell>
    )
  }

  if (status === 'error') {
    return (
      <AppShell title="PractitionerHub" subtitle="Authentication error">
        <p className="m-0 text-[15px] text-status-critical">{error ?? 'Unknown SMART auth error.'}</p>
        <p className="mt-2.5 text-sm text-slate-600">
          Please re-launch the app from the EHR. If launched from the Cerner
          code console, close this tab and start a new launch.
        </p>
      </AppShell>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <AppShell title="PractitionerHub" subtitle="Awaiting EHR launch">
        <p className="m-0 text-[15px]">
          Open this app from Cerner SMART launch URL. The app auto-initiates authorization when
          `iss` and `launch` query params are present.
        </p>
        <p className="mt-2.5 text-sm text-slate-600">
          Launch params detected in current URL: {hasSmartLaunchParams() ? 'yes' : 'no'}
        </p>
      </AppShell>
    )
  }

  return (
    <AppShell title="PractitionerHub" subtitle="SMART session established">
      <PatientBanner />
      <PatientBriefing />
    </AppShell>
  )
}

export default App
