import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  getVitalSigns,
  getVitalsByType,
  getVitalStatus,
  VITAL_LABELS,
  VITAL_RANGES,
  BP_RANGES,
  type VitalSignGroup,
  type VitalType,
  type VitalReading,
  type CreateVitalInput,
} from '../../services/fhir/observations'
import { RecordVitals } from './RecordVitals'
import { VITAL_ICON, IconRefresh, IconHourglass, IconCheckCircle, IconXCircle } from '../../components/icons/ClinicalIcons'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_VITAL_TYPES: VitalType[] = [
  'bloodPressure', 'heartRate', 'respiratoryRate', 'spo2',
  'temperature', 'height', 'weight', 'bmi',
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function rangeLabel(type: VitalType): string {
  if (type === 'bloodPressure') {
    return `${BP_RANGES.systolic.low}–${BP_RANGES.systolic.high} / ${BP_RANGES.diastolic.low}–${BP_RANGES.diastolic.high}`
  }
  const r = VITAL_RANGES[type]
  if (!r) return ''
  return `${r.low}–${r.high}`
}

const STATUS_COLORS: Record<string, string> = {
  normal: 'var(--status-normal)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
  unknown: 'var(--status-unknown)',
}

const VITAL_VALUE_STATUS: Record<string, string> = {
  normal: 'text-status-normal',
  warning: 'text-status-warning',
  critical: 'text-status-critical',
  unknown: 'text-slate-900',
}

const STATUS_DOT_BG: Record<string, string> = {
  normal: 'bg-status-normal',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  unknown: 'bg-status-unknown',
}

const READINGS_PER_PAGE = 5

// ---------------------------------------------------------------------------
// VitalCard – memoised so only the affected card re-renders on state change
// ---------------------------------------------------------------------------

interface VitalCardProps {
  type: VitalType
  group: VitalSignGroup | undefined
  isExpanded: boolean
  loading: boolean
  isResolved: boolean
  isFullyLoaded: boolean
  isLoadingMore: boolean
  page: number
  onToggleExpand: (type: VitalType) => void
  onPageChange: (type: VitalType, page: number) => void
  onLoadMore: (type: VitalType) => void
}

const VitalCard = memo(function VitalCard({
  type, group, isExpanded, loading, isResolved,
  isFullyLoaded, isLoadingMore, page,
  onToggleExpand, onPageChange, onLoadMore,
}: VitalCardProps) {
  // Skeleton while streaming
  if (loading && !isResolved) {
    return (
      <div className="bg-white border border-card-border rounded-[10px] shadow-card overflow-hidden p-3.5 border-l-4 border-l-card-border">
        <div className="skeleton-gradient w-6 h-6 rounded-md mb-2.5" />
        <div className="skeleton-gradient h-3 mb-2 rounded w-3/5" />
        <div className="skeleton-gradient h-7 mb-2 rounded" />
        <div className="skeleton-gradient h-3 mb-2 rounded w-2/5" />
      </div>
    )
  }

  const latest: VitalReading | undefined = group?.readings[0]
  const vitalStatus = latest ? getVitalStatus(type, latest.numericValue) : 'unknown'
  const hasData = Boolean(latest)
  const range = rangeLabel(type)
  const readings = group?.readings ?? []
  const totalPages = Math.max(1, Math.ceil(readings.length / READINGS_PER_PAGE))
  const pageSlice = readings.slice(page * READINGS_PER_PAGE, (page + 1) * READINGS_PER_PAGE)

  return (
    <article
      className={`vital-status-bar bg-white border border-card-border rounded-[10px] shadow-card overflow-hidden transition-[box-shadow,border-color] duration-150 ${
        isExpanded && hasData ? 'col-span-full' : ''
      } ${hasData ? 'hover:shadow-card-hover' : 'opacity-55'}`}
      style={{ '--status-bar': STATUS_COLORS[vitalStatus] } as React.CSSProperties}
    >
      <div
        className={`px-3.5 py-3 ${hasData ? 'cursor-pointer select-none' : 'cursor-default'}`}
        onClick={() => { if (hasData) onToggleExpand(type) }}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && hasData) onToggleExpand(type) }}
        role={hasData ? 'button' : undefined}
        tabIndex={hasData ? 0 : undefined}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          {(() => { const VIcon = VITAL_ICON[type]; return <VIcon size={16} /> })()}
          <span className="text-[13px] font-semibold text-slate-600 flex-1">{VITAL_LABELS[type]}</span>
          {hasData && <span className="text-[11px] text-slate-400">{isExpanded ? '▲' : '▼'}</span>}
        </div>

        {hasData ? (
          <>
            <div className="flex items-baseline gap-1 mb-1">
              <span className={`text-[26px] font-extrabold leading-[1.1] tracking-tight ${VITAL_VALUE_STATUS[vitalStatus] ?? ''}`}>
                {latest!.displayValue}
              </span>
              <span className="text-[13px] text-slate-400 font-medium">{latest!.unit}</span>
            </div>
            <div className="flex gap-2.5 text-xs text-slate-400 mb-0.5">
              <span className="text-slate-600">{formatTime(latest!.timestamp)}</span>
              {range && <span className="text-slate-400">Ref: {range}</span>}
            </div>
            <div className="text-xs text-slate-400 mt-1">{readings.length} reading{readings.length !== 1 ? 's' : ''}</div>
          </>
        ) : (
          <div className="text-sm text-slate-400 py-2">No data recorded</div>
        )}
      </div>

      {isExpanded && readings.length > 0 && (
        <div className="border-t border-card-border px-3.5 pt-2.5 pb-3.5 bg-[#fafbfc]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-left font-semibold text-slate-400 text-[11px] uppercase tracking-wider px-2 py-1.5 border-b border-card-border">#</th>
                <th className="text-left font-semibold text-slate-400 text-[11px] uppercase tracking-wider px-2 py-1.5 border-b border-card-border">Value</th>
                <th className="text-left font-semibold text-slate-400 text-[11px] uppercase tracking-wider px-2 py-1.5 border-b border-card-border">Date &amp; Time</th>
                <th className="text-left font-semibold text-slate-400 text-[11px] uppercase tracking-wider px-2 py-1.5 border-b border-card-border">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((r, idx) => {
                const s = getVitalStatus(type, r.numericValue)
                return (
                  <tr key={r.id}>
                    <td className="px-2 py-1.5 border-b border-slate-100 text-slate-400 w-9">{page * READINGS_PER_PAGE + idx + 1}</td>
                    <td className="px-2 py-1.5 border-b border-slate-100 font-semibold">{r.displayValue} {r.unit}</td>
                    <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600 text-xs">{formatTime(r.timestamp)}</td>
                    <td className="px-2 py-1.5 border-b border-slate-100"><span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT_BG[s] ?? 'bg-status-unknown'}`} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex flex-col gap-2 mt-2 items-center">
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2.5 text-xs text-slate-600">
                <button className="border border-card-border bg-white rounded-md px-2.5 py-1 text-xs cursor-pointer text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed" disabled={page === 0} onClick={() => onPageChange(type, page - 1)} type="button">‹ Prev</button>
                <span>{page + 1} / {totalPages}</span>
                <button className="border border-card-border bg-white rounded-md px-2.5 py-1 text-xs cursor-pointer text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed" disabled={page >= totalPages - 1} onClick={() => onPageChange(type, page + 1)} type="button">Next ›</button>
              </div>
            )}

            {!isFullyLoaded && (
              <button
                className="border border-accent bg-accent-light text-accent rounded-md px-3.5 py-[5px] text-xs font-semibold cursor-pointer transition-[background] duration-150 hover:enabled:bg-blue-100 disabled:opacity-60 disabled:cursor-wait"
                disabled={isLoadingMore}
                onClick={() => onLoadMore(type)}
                type="button"
              >
                {isLoadingMore ? 'Loading…' : `Load all ${VITAL_LABELS[type]} readings`}
              </button>
            )}
            {isFullyLoaded && (
              <span className="text-xs text-slate-400">All {readings.length} readings loaded</span>
            )}
          </div>
        </div>
      )}
    </article>
  )
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VitalsPanelProps {
  /** Called after vitals are successfully recorded, so other tabs can refresh */
  onVitalsRecorded?: () => void
}

export function VitalsPanel({ onVitalsRecorded }: VitalsPanelProps) {
  const { session, status } = useAuth()
  const [groups, setGroups] = useState<VitalSignGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedType, setExpandedType] = useState<VitalType | null>(null)
  const [readingPages, setReadingPages] = useState<Partial<Record<VitalType, number>>>({})
  const [loadingMore, setLoadingMore] = useState<Partial<Record<VitalType, boolean>>>({})
  const [fullyLoaded, setFullyLoaded] = useState<Partial<Record<VitalType, boolean>>>({})
  const [recordOpen, setRecordOpen] = useState(false)
  // Inline save status — visible in the header so user always sees POST outcome
  const [saveStatus, setSaveStatus] = useState<{ text: string; type: 'saving' | 'ok' | 'fail' } | null>(null)

  const patientId = session?.patientId ?? ''
  const accessToken = session?.accessToken ?? ''

  // Keep token in a ref so loadVitals doesn't depend on it.
  // Without this, a 401→refresh cycle changes accessToken, which recreates
  // loadVitals, which re-fires the useEffect, which calls setGroups([])
  // and wipes optimistic data.
  const accessTokenRef = useRef(accessToken)
  accessTokenRef.current = accessToken

  const loadVitals = useCallback(async () => {
    if (status !== 'authenticated' || !patientId || !accessTokenRef.current) return
    setLoading(true)
    setError(null)
    setGroups([])
    setFullyLoaded({})
    setExpandedType(null)
    setReadingPages({})
    try {
      const data = await getVitalSigns(patientId, accessTokenRef.current, {
        onGroup: (group) => {
          // Stream each vital-type card into the UI as it arrives
          setGroups(prev => {
            const idx = prev.findIndex(g => g.type === group.type)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = group
              return next
            }
            // Insert in canonical order
            const ORDER: VitalType[] = [
              'bloodPressure', 'heartRate', 'respiratoryRate', 'spo2',
              'temperature', 'height', 'weight', 'bmi',
            ]
            const next = [...prev, group]
            next.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
            return next
          })
        },
      })
      // Final set for any ordering cleanup
      setGroups(data)
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Request timed out — the FHIR server took too long to respond. Please try again.')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load vitals.')
      }
    } finally {
      setLoading(false)
    }
  }, [patientId, status])

  const loadMoreReadings = useCallback(async (type: VitalType) => {
    if (!patientId || !accessTokenRef.current) return
    setLoadingMore(prev => ({ ...prev, [type]: true }))
    try {
      const readings = await getVitalsByType(patientId, accessTokenRef.current, type)
      setGroups(prev => {
        const updated = prev.map(g => g.type === type ? { ...g, readings } : g)
        // If the type wasn't in the initial set, add it
        if (!prev.some(g => g.type === type)) {
          updated.push({ type, label: VITAL_LABELS[type], readings })
        }
        return updated
      })
      setFullyLoaded(prev => ({ ...prev, [type]: true }))
      setReadingPages(prev => ({ ...prev, [type]: 0 }))
    } catch {
      // If load-more fails, don't break - just keep existing data
    } finally {
      setLoadingMore(prev => ({ ...prev, [type]: false }))
    }
  }, [patientId])

  const toggleExpand = useCallback((type: VitalType) => {
    setExpandedType(prev => (prev === type ? null : type))
  }, [])

  const handlePageChange = useCallback((type: VitalType, p: number) => {
    setReadingPages(prev => ({ ...prev, [type]: p }))
  }, [])

  // ---- Optimistic update after recording vitals ----

  const handleVitalsSaved = useCallback((savedInputs: CreateVitalInput[]) => {
    // Build synthetic VitalReading objects and prepend ONLY to the affected
    // group. Unchanged groups keep the same object reference so React.memo
    // on VitalCard skips their re-render entirely.
    setGroups(prev => {
      const sysInput = savedInputs.find(i => i.type === 'systolic')
      const diaInput = savedInputs.find(i => i.type === 'diastolic')
      const otherInputs = savedInputs.filter(i => i.type !== 'systolic' && i.type !== 'diastolic')

      // Pre-build synthetic readings keyed by VitalType
      const syntheticByType = new Map<VitalType, VitalReading>()

      if (sysInput || diaInput) {
        const sysVal = sysInput ? sysInput.value : '—'
        const diaVal = diaInput ? diaInput.value : '—'
        syntheticByType.set('bloodPressure', {
          id: `optimistic-${Date.now()}-bp`,
          timestamp: (sysInput ?? diaInput)!.dateTime,
          displayValue: `${sysVal}/${diaVal}`,
          numericValue: typeof sysVal === 'number' ? sysVal : null,
          unit: 'mmHg',
        })
      }

      for (const input of otherInputs) {
        const v = input.value as number
        syntheticByType.set(input.type as VitalType, {
          id: `optimistic-${Date.now()}-${input.type}`,
          timestamp: input.dateTime,
          displayValue: String(v),
          numericValue: v,
          unit: input.unit,
        })
      }

      const existingTypes = new Set(prev.map(g => g.type))

      // .map() — only create a new object for groups that received new data
      const result = prev.map(g => {
        const reading = syntheticByType.get(g.type)
        if (reading) return { ...g, readings: [reading, ...g.readings] }
        return g // ← same reference, React.memo will skip
      })

      // Append any brand-new types that weren't already present
      let added = false
      for (const [type, reading] of syntheticByType) {
        if (!existingTypes.has(type)) {
          result.push({ type, label: VITAL_LABELS[type], readings: [reading] })
          added = true
        }
      }

      if (added) {
        const ORDER: VitalType[] = [
          'bloodPressure', 'heartRate', 'respiratoryRate', 'spo2',
          'temperature', 'height', 'weight', 'bmi',
        ]
        result.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
      }

      return result
    })

    // No background re-fetch — Cerner eventual consistency means the new
    // observations may not be indexed for several seconds. Optimistic data
    // stays until the next full page load.

    // Notify parent so Dashboard can refresh its vitals/risk scores
    onVitalsRecorded?.()
  }, [onVitalsRecorded])

  useEffect(() => {
    void loadVitals()
  }, [loadVitals])

  // ---- Empty / error states ----

  if (!patientId) {
    return <div className="p-5 text-center text-slate-400 text-[15px]">No patient in context.</div>
  }

  // NOTE: We no longer block the entire UI on `loading`. While loading is
  // true we show skeleton placeholders only for vital types that haven't
  // streamed in yet. Cards that have arrived render immediately.

  if (error && groups.length === 0) {
    return (
      <section className="flex flex-col gap-3.5">
        <h2 className="m-0 text-[17px] font-bold">Vital Signs</h2>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="m-0 mb-2.5 text-red-900 text-sm">{error}</p>
          <button className="bg-status-critical text-white border-none rounded-md px-4 py-1.5 text-[13px] cursor-pointer" onClick={() => void loadVitals()} type="button">Retry</button>
        </div>
      </section>
    )
  }

  // Build a map for quick lookup; fill absent types with empty groups
  const groupMap = new Map<VitalType, VitalSignGroup>()
  for (const g of groups) groupMap.set(g.type, g)

  // Set of types that have streamed in
  const resolvedTypes = new Set(groups.map(g => g.type))

  const SAVE_STATUS_CLASSES: Record<string, string> = {
    saving: 'bg-yellow-100 text-amber-800 border border-amber-200',
    ok: 'bg-green-100 text-green-900 border border-green-200',
    fail: 'bg-red-100 text-red-900 border border-red-200',
  }

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h2 className="m-0 text-[17px] font-bold">Vital Signs</h2>
        <span className="text-[13px] text-slate-400">
          {loading
            ? `Loading… (${groups.length}/${ALL_VITAL_TYPES.length} categories)`
            : `${groups.reduce((n, g) => n + g.readings.length, 0)} readings across ${groups.length} categories`}
        </span>
        <button
          type="button"
          className="ml-auto bg-accent text-white border-none rounded-lg px-4 py-[7px] text-[13px] font-semibold cursor-pointer transition-[background] duration-150 whitespace-nowrap hover:bg-blue-700"
          onClick={() => setRecordOpen(true)}
        >
          + Record Vitals
        </button>
        <button
          type="button"
          className="bg-transparent text-slate-600 border border-card-border rounded-lg px-3 py-[7px] text-xs font-medium cursor-pointer transition-[background,color] duration-150 whitespace-nowrap hover:enabled:bg-white hover:enabled:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
          onClick={() => void loadVitals()}
          title="Reload vitals from Cerner (may take 30s+ for new writes to appear)"
        >
          <span className="inline-flex items-center gap-1"><IconRefresh size={12} /> {loading ? 'Loading…' : 'Refresh'}</span>
        </button>

        {saveStatus && (
          <span className={`basis-full text-xs font-medium px-3 py-1.5 rounded-md animate-save-in break-words leading-relaxed ${SAVE_STATUS_CLASSES[saveStatus.type] ?? ''}`}>
            {saveStatus.type === 'saving' && <IconHourglass size={12} className="inline mr-1" />}
            {saveStatus.type === 'ok' && <IconCheckCircle size={12} className="inline mr-1" />}
            {saveStatus.type === 'fail' && <IconXCircle size={12} className="inline mr-1" />}
            {saveStatus.text}
          </span>
        )}
      </div>

      <RecordVitals
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSaved={handleVitalsSaved}
        onDebug={() => {}}
        onSaveStatus={(s) => {
          setSaveStatus(s)
          // Auto-clear terminal states (ok/fail) after 15 seconds.
          // "saving" states are never auto-cleared — they get replaced by ok/fail.
          if (s.type === 'ok' || s.type === 'fail') {
            setTimeout(() => setSaveStatus(prev => {
              // Only clear if the status hasn't been replaced by a newer one
              if (prev && prev.text === s.text) return null
              return prev
            }), 15000)
          }
        }}
      />

      <div className="grid grid-cols-2 min-[800px]:grid-cols-3 min-[1100px]:grid-cols-4 gap-3">
        {ALL_VITAL_TYPES.map(type => (
          <VitalCard
            key={type}
            type={type}
            group={groupMap.get(type)}
            isExpanded={expandedType === type}
            loading={loading}
            isResolved={resolvedTypes.has(type)}
            isFullyLoaded={!!fullyLoaded[type]}
            isLoadingMore={!!loadingMore[type]}
            page={readingPages[type] ?? 0}
            onToggleExpand={toggleExpand}
            onPageChange={handlePageChange}
            onLoadMore={loadMoreReadings}
          />
        ))}
      </div>
    </section>
  )
}
