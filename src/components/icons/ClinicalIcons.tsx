/**
 * ClinicalIcons — monochrome SVG icon set for PractitionerHub.
 *
 * All icons use `currentColor` so they inherit the parent's text color.
 * Default size: 16×16 (adjustable via `size` prop).
 *
 * Why not emojis?
 * - Inconsistent rendering across OS/browser
 * - Cannot control color, weight, or alignment
 * - Not professional for clinical software
 */

import type { SVGProps } from 'react'
import type { ReactNode } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

function base(size: number | string = 16): Pick<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'fill' | 'xmlns'> {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' }
}

// ─── Vitals ──────────────────────────────────────────────────────────────────

/** Blood Pressure — heart with pressure wave */
export function IconBloodPressure({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" opacity="0.85"/>
    </svg>
  )
}

/** Heart Rate — heart with pulse line */
export function IconHeartRate({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" opacity="0.2"/>
      <polyline points="2,13 7,13 9,9 11,17 13,11 15,13 22,13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/** Respiratory Rate — lungs */
export function IconLungs({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 2v8M12 10c-3 0-6 2-7 5s-1 5 0 6 3 1 4 0 2-3 3-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M12 10c3 0 6 2 7 5s1 5 0 6-3 1-4 0-2-3-3-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/** SpO2 — blood drop */
export function IconSpO2({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" fill="currentColor" opacity="0.85"/>
      <text x="12" y="17" textAnchor="middle" fontSize="7" fontWeight="bold" fill="white">O₂</text>
    </svg>
  )
}

/** Temperature — thermometer */
export function IconThermometer({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M14 14.76V3.5a2 2 0 0 0-4 0v11.26a4.5 4.5 0 1 0 4 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <circle cx="12" cy="18" r="2" fill="currentColor"/>
    </svg>
  )
}

/** Height — ruler */
export function IconHeight({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="6" y="2" width="12" height="20" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="6" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="10" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="6" y1="18" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

/** Weight — scale */
export function IconWeight({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="5" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M2 21h20l-3-10H5L2 21z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <path d="M12 8v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

/** BMI — chart/graph */
export function IconBMI({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <polyline points="7,17 10,12 13,14 17,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

// ─── Insight Categories ──────────────────────────────────────────────────────

/** Drug Interaction — pill/capsule */
export function IconPill({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="9.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="12" y1="7.5" x2="12" y2="16.5" transform="rotate(-45 12 12)" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

/** Trend — line trending up */
export function IconTrend({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <polyline points="3,17 9,11 13,15 21,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <polyline points="17,7 21,7 21,11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/** Warning — triangle with exclamation */
export function IconWarning({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="1" fill="currentColor"/>
    </svg>
  )
}

/** Guideline — clipboard with check */
export function IconClipboard({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="2" fill="none"/>
      <polyline points="9,13 11,15 15,11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

// ─── UI / Status ─────────────────────────────────────────────────────────────

/** Alert — siren / emergency */
export function IconAlert({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 2L2 19h20L12 2z" fill="currentColor" opacity="0.15"/>
      <path d="M12 2L2 19h20L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/>
      <line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor"/>
    </svg>
  )
}

/** Check Circle — all clear */
export function IconCheckCircle({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
      <polyline points="8,12 11,15 16,9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/** Stethoscope — practitioner */
export function IconStethoscope({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4.8 2.3A2 2 0 0 0 3 4.5v3a5 5 0 0 0 5 5h1v3a4 4 0 0 0 8 0v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M19.2 2.3A2 2 0 0 1 21 4.5v3a5 5 0 0 1-5 5h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <circle cx="19" cy="16" r="2" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  )
}

/** Brain — AI analysis */
export function IconBrain({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 2a5 5 0 0 0-4.6 3A4.5 4.5 0 0 0 3 9.5c0 1.7.9 3.1 2.3 3.9A4.5 4.5 0 0 0 9 18h2V2z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      <path d="M12 2a5 5 0 0 1 4.6 3A4.5 4.5 0 0 1 21 9.5c0 1.7-.9 3.1-2.3 3.9A4.5 4.5 0 0 1 15 18h-2V2z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      <path d="M12 2v16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
      <path d="M8 8c1 1 3 1 4 0M12 8c1 1 3 1 4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <path d="M8 13c1 1 3 1 4 0M12 13c1 1 3 1 4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <path d="M12 18v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

/** Refresh — circular arrow */
export function IconRefresh({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <polyline points="1,4 1,10 7,10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <polyline points="23,20 23,14 17,14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/** Note/Document — for Smart Notes */
export function IconNote({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

/** Wrench — diagnostics */
export function IconWrench({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/** Hourglass — loading/saving */
export function IconHourglass({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 3h14M5 21h14M7 3v4l4 4-4 4v4M17 3v4l-4 4 4 4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/** X Circle — error */
export function IconXCircle({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
      <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Lookup Maps ─────────────────────────────────────────────────────────────

import type { VitalType } from '../../services/fhir/observations'
import type { ClinicalInsight } from '../../services/ai/clinicalAnalysis'

/** Map from VitalType to icon component — use in VitalsPanel, CompactVitals, etc. */
export const VITAL_ICON: Record<VitalType, (props: IconProps) => ReactNode> = {
  bloodPressure: IconBloodPressure,
  heartRate: IconHeartRate,
  respiratoryRate: IconLungs,
  spo2: IconSpO2,
  temperature: IconThermometer,
  height: IconHeight,
  weight: IconWeight,
  bmi: IconBMI,
}

/** Map from insight category to icon component */
export const INSIGHT_ICON: Record<ClinicalInsight['category'], (props: IconProps) => ReactNode> = {
  interaction: IconPill,
  trend: IconTrend,
  contraindication: IconWarning,
  guideline: IconClipboard,
}
