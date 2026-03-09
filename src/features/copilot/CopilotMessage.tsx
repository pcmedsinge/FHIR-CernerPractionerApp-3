/**
 * CopilotMessage — renders a single message bubble in the chat.
 *
 * User messages: right-aligned, accent blue
 * Assistant messages: left-aligned, white card with structured content
 * Streaming: shows animated cursor at the end while generating
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
// Simple markdown-like renderer for clinical content
// ---------------------------------------------------------------------------

function renderContent(text: string) {
  const lines = text.split('\n')
  const elements: JSX.Element[] = []
  let key = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />)
      continue
    }

    // Section headers (e.g. "ASSESSMENT:", "RECOMMENDATION:")
    if (/^[A-Z][A-Z\s&/]+:$/.test(trimmed)) {
      elements.push(
        <div key={key++} className="text-[12px] font-bold text-slate-800 mt-3 mb-1 uppercase tracking-wide border-b border-slate-200 pb-0.5">
          {trimmed.replace(/:$/, '')}
        </div>
      )
      continue
    }

    // Process inline formatting
    let processed = trimmed

    // [CRITICAL] and [WARNING] tags
    processed = processed.replace(
      /\[CRITICAL\]/g,
      '<span class="inline-block text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 rounded px-1 py-px mx-0.5">CRITICAL</span>'
    )
    processed = processed.replace(
      /\[WARNING\]/g,
      '<span class="inline-block text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-px mx-0.5">WARNING</span>'
    )
    processed = processed.replace(
      /\[ABNORMAL\]/g,
      '<span class="inline-block text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 rounded px-1 py-px mx-0.5">ABNORMAL</span>'
    )

    // **bold** → <strong>
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')

    // Bullet lines
    if (/^[-•]\s/.test(trimmed)) {
      elements.push(
        <div key={key++} className="flex gap-1.5 ml-2 text-[12px] leading-relaxed text-slate-700">
          <span className="text-slate-400 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: processed.replace(/^[-•]\s/, '') }} />
        </div>
      )
      continue
    }

    // Numbered lists
    if (/^\d+[.)]\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)[.)]\s/)?.[1] ?? ''
      elements.push(
        <div key={key++} className="flex gap-1.5 ml-2 text-[12px] leading-relaxed text-slate-700">
          <span className="text-slate-500 font-semibold shrink-0 w-4 text-right">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: processed.replace(/^\d+[.)]\s/, '') }} />
        </div>
      )
      continue
    }

    // Disclaimer line
    if (trimmed.startsWith('Clinical AI assistant')) {
      elements.push(
        <div key={key++} className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-400 italic">
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

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-accent text-white text-[12px] leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[90%] bg-white border border-slate-200 rounded-2xl rounded-bl-md shadow-sm overflow-hidden">
        {/* AI badge */}
        <div className="flex items-center gap-1.5 px-3.5 pt-2.5 pb-1">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 014 4v1a4 4 0 01-8 0V6a4 4 0 014-4z" />
              <path d="M8 14s-4 0-4 4v2h16v-2c0-4-4-4-4-4" />
              <circle cx="12" cy="6" r="1" fill="white" />
            </svg>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Clinical Copilot</span>
          {message.streaming && (
            <div className="w-2 h-2 border-[1.5px] border-blue-200 border-t-blue-600 rounded-full animate-spinner ml-1" />
          )}
        </div>

        {/* Content */}
        <div className="px-3.5 pb-3">
          {rendered}
          {message.streaming && (
            <span className="inline-block w-1.5 h-4 bg-blue-500 rounded-sm animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </div>
    </div>
  )
}
