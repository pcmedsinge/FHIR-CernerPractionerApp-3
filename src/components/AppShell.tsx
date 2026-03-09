import type { ReactNode } from 'react'

interface AppShellProps {
	title: string
	subtitle?: string
	navItems?: ReactNode
	/** Minimal patient context shown inline in the header bar */
	patientLabel?: string
	children: ReactNode
}

export function AppShell({ subtitle, patientLabel, navItems, children }: AppShellProps) {
	return (
		<main className="h-screen flex flex-col overflow-hidden bg-surface text-slate-900 font-[Inter,system-ui,-apple-system,sans-serif]">
			{/* ── Unified header — 36px, dark glass, patient context included ── */}
			<header className="shrink-0 h-11 px-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center gap-3 backdrop-blur-md shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
				<h1 className="m-0 text-[15px] font-extrabold tracking-tight whitespace-nowrap">
					<span className="text-blue-400">Practitioner</span><span className="text-white">Hub</span>
				</h1>
				{subtitle && !patientLabel ? (
					<span className="text-[11px] text-slate-400 truncate">{subtitle}</span>
				) : null}
				{patientLabel ? (
					<>
						<span className="w-px h-4 bg-slate-600" />
						<span className="text-[12px] font-semibold text-white truncate">{patientLabel}</span>
					</>
				) : null}
				<span className="flex-1" />
				{navItems}
			</header>
			<section className="flex-1 overflow-y-scroll px-4 py-3 scrollbar-thin">{children}</section>
		</main>
	)
}
