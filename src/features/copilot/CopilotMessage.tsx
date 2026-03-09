/**
 * CopilotMessage — renders query/response pairs in a professional card layout.
 *
 * User messages: compact query header (left-aligned, muted)
 * Assistant messages: full-width structured response card
 * No chat bubbles — this is a clinical tool, not a chat app.
 */

import { useMemo, type JSX } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopilotMessageData {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  streaming?: boolean
}

// ---------------------------------------------------------------------------
// Structured content renderer
// ---------------------------------------------------------------------------

function renderContent(text: string): JSX.Element[] {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let key = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      elements.push(<div key={key++} className="h-1.5" />)
      continue
    }

    // Section headers: ASSESSMENT:, RECOMMENDATION:, etc.
    if (/^[A-Z][A-Z\s&/]+:$/.test(trimmed)) {
      elements.push(
        <div key={key++} className="text-[11px] font-bold text-slate-700 mt-3 mb-1 uppercase tracking-wider flex items-center gap-2">
          <span>{trimmed.replace(/:$/, '')}</span>
          <div className="flex-1 h-px bg-slate-150" />
        </div>
      )
      continue
    }

    // Inline formatting pipeline
    let processed = trimmed

    // [CRITICAL], [WARNING], [ABNORMAL] tags
    processed = processed.replace(
      /\[CRITICAL\]/g,
      '<span class="inline-flex items-center text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 rounded px-1 py-px mx-0.5 leading-none">CRITICAL</span>'
    )
    processed = processed.replace(
      /\[WARNING\]/g,
      '<span class="inline-flex items-center text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-px mx-0.5 leading-none">WARNING</span>'
    )
    processed = processed.replace(
      /\[ABNORMAL\]/g,
      '<span class="inline-flex items-center text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 rounded px-1 py-px mx-0.5 leading-none">ABNORMAL</span>'
    )

    // **bold**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>')

    // Bullet lines (- or •)
    if (/^[-•]\s/.test(trimmed)) {
      elements.push(
        <div key={key++} className="flex gap-1.5 pl-1 text-[12px] leading-relaxed text-slate-700">
          <span className="text-slate-300 shrink-0 select-none mt-px">•</span>
          <span dangerouslySetInnerHTML={{ __html: processed.replace(/^[-•]\s/, '') }} />
        </div>
      )
      continue
    }

    // Numbered lists (1. or 1))
    if (/^\d+[.)]\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)[.)]\s/)?.[1] ?? ''
      elements.push(
        <div key={key++} className="flex gap-1.5 pl-1 text-[12px] leading-relaxed text-slate-700">
          <span className="text-slate-400 font-semibold shrink-0 w-4 text-right tabular-nums">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: processed.replace(/^\d+[.)]\s/, '') }} />
        </div>
      )
      continue
    }

    // Disclaimer
    if (trimmed.startsWith('Clinical AI assistant')) {
      elements.push(
        <div key={key++} className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400 italic">
          {trimmed}
        </div>
      )
      continue
    }

    // Regular paragraph
    elements.push(
      <div key={key++} className="text-[12px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: processed }} />
    )
  }

  return elements
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CopilotMessage({ message }: { message: CopilotMessageData }) {
  const rendered = useMemo(
    () => message.role === 'assistant' ? renderContent(message.content) : null,
    [message.content, message.role],
  )

  // ── User query — compact header bar ──
  if (message.role === 'user') {
    return (
      <div className="flex items-center gap-2 mt-3 mb-1.5">
        <div className="w-[3px] h-5 rounded-full bg-blue-500 shrink-0" />
        <span className="text-[13px] font-semibold text-slate-700">{message.content}</span>
      </div>
    )
  }

  // ── Assistant response — full-width card ──
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm mb-2">
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
        <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </div>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">AI Analysis</span>
        {message.streaming && (
          <div className="w-2.5 h-2.5 border-[1.5px] border-blue-200 border-t-blue-600 rounded-full animate-spinner ml-1" />
        )}
        <span className="flex-1" />
        <span className="text-[9px] text-slate-300">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        {rendered}
        {message.streaming && message.content.length > 0 && (
          <span className="inline-block w-1 h-3.5 bg-blue-500 rounded-sm animate-pulse ml-0.5 align-middle" />
        )}
        {message.streaming && message.content.length === 0 && (
          <div className="flex items-center gap-2 py-2">
            <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spinner" />
            <span className="text-[11px] text-slate-400">Analyzing clinical data…</span>
          </div>
        )}
      </div>
    </div>
  )
}
