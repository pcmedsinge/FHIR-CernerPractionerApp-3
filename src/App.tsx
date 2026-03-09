import { useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { hasSmartLaunchParams } from './auth/launch'
import { AppShell } from './components/AppShell'
import { usePatientContext } from './components/PatientBanner'
import { PatientBriefing } from './features/briefing/PatientBriefing'
import { ClinicalCopilot } from './features/copilot/ClinicalCopilot'
import { usePatientBriefing } from './hooks/usePatientBriefing'

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

  return <AuthenticatedApp />
}

/** Authenticated shell — uses hooks that depend on session context */
function AuthenticatedApp() {
  const { headerLabel } = usePatientContext()
  const [activeTab, setActiveTab] = useState<'briefing' | 'copilot'>('briefing')

  const tabNav = (
    <div className="flex items-center gap-0.5 bg-slate-700/50 rounded-lg p-0.5">
      <button
        type="button"
        className={`px-3 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all duration-150 ${
          activeTab === 'briefing'
            ? 'bg-white/15 text-white shadow-sm'
            : 'bg-transparent text-slate-400 hover:text-white'
        }`}
        onClick={() => setActiveTab('briefing')}
      >
        Briefing
      </button>
      <button
        type="button"
        className={`px-3 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all duration-150 flex items-center gap-1.5 ${
          activeTab === 'copilot'
            ? 'bg-white/15 text-white shadow-sm'
            : 'bg-transparent text-slate-400 hover:text-white'
        }`}
        onClick={() => setActiveTab('copilot')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        AI Copilot
      </button>
    </div>
  )

  return (
    <AppShell title="PractitionerHub" patientLabel={headerLabel ?? undefined} navItems={tabNav}>
      {activeTab === 'briefing' && <PatientBriefing />}
      {activeTab === 'copilot' && <CopilotTab />}
    </AppShell>
  )
}

/** Copilot tab — calls usePatientBriefing which reads from sessionStorage cache */
function CopilotTab() {
  const briefing = usePatientBriefing()
  return (
    <ClinicalCopilot
      data={briefing.data}
      loading={briefing.tier1Loading || briefing.tier2Loading}
    />
  )
}

export default App
