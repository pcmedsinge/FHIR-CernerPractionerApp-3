import type { ReactNode } from 'react'

interface AppShellProps {
	title: string
	subtitle?: string
	navItems?: ReactNode
	children: ReactNode
}

export function AppShell({ title, subtitle, navItems, children }: AppShellProps) {
	return (
		<main className="h-screen flex flex-col overflow-hidden bg-surface text-slate-900 font-[Inter,system-ui,-apple-system,sans-serif]">
			<header className="shrink-0 px-5 py-3 bg-slate-800 text-white flex items-center gap-3">
				<h1 className="m-0 text-lg font-bold tracking-tight">{title}</h1>
				{subtitle ? <p className="m-0 text-[13px] text-slate-400">{subtitle}</p> : null}
				{navItems}
			</header>
			<section className="flex-1 overflow-auto px-5 py-4">{children}</section>
		</main>
	)
}
