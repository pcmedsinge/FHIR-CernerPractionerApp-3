/**
 * BriefingSkeleton — skeleton placeholder matching the PatientBriefing layout.
 *
 * Shows immediately while Tier 1 data loads so the user sees *structure*
 * rather than a spinner. Matches the final card layout shape.
 */

export function BriefingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 animate-pulse">
      {/* Action bar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="flex gap-1.5">
          <div className="h-7 w-20 bg-slate-200 rounded-md" />
          <div className="h-7 w-24 bg-slate-200 rounded-md" />
        </div>
      </div>

      {/* Alerts skeleton — single card */}
      <div className="bg-white border border-card-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border">
          <div className="h-3.5 w-20 bg-slate-200 rounded" />
        </div>
        <div className="px-3 py-2.5">
          <div className="h-10 bg-slate-100 rounded-lg" />
        </div>
      </div>

      {/* Risk scores skeleton */}
      <div className="bg-white border border-card-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border">
          <div className="h-3.5 w-24 bg-slate-200 rounded" />
        </div>
        <div className="px-3 py-2.5">
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-11 flex-1 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Vitals skeleton */}
      <div className="bg-white border border-card-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border">
          <div className="h-3.5 w-14 bg-slate-200 rounded" />
        </div>
        <div className="px-3 py-2.5">
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Lab trends skeleton */}
      <div className="bg-white border border-card-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border">
          <div className="h-3.5 w-20 bg-slate-200 rounded" />
        </div>
        <div className="px-3 py-2.5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Notes skeleton — just a bar */}
      <div className="bg-white border border-card-border rounded-xl shadow-card h-11" />
    </div>
  )
}
