/**
 * SectionCard — consistent container for every dashboard section.
 *
 * Provides visual hierarchy: title bar + optional action area + content.
 * All sections share the same header style for a calm, uniform look.
 */

import type { ReactNode } from 'react'

interface SectionCardProps {
  /** Section title displayed in the header */
  title: string
  /** Optional icon to the left of the title */
  icon?: ReactNode
  /** Optional action buttons / controls on the right side of the header */
  action?: ReactNode
  /** Optional subtitle / secondary info in the header */
  subtitle?: string
  /** Content inside the card body */
  children: ReactNode
  /** Whether to show the card body (default: true) */
  open?: boolean
  /** Remove body padding (e.g., for grids that handle their own spacing) */
  flush?: boolean
  /** Additional className on the outer wrapper */
  className?: string
}

export function SectionCard({
  title,
  icon,
  action,
  subtitle,
  children,
  open = true,
  flush = false,
  className = '',
}: SectionCardProps) {
  return (
    <section
      className={`bg-white border border-card-border rounded-xl shadow-card overflow-hidden ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-card-border">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          <h3 className="text-[14px] font-bold text-slate-700 m-0 truncate">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>
        {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
      </div>

      {/* Body */}
      {open && (
        <div className={flush ? '' : 'px-3 py-2.5'}>
          {children}
        </div>
      )}
    </section>
  )
}
