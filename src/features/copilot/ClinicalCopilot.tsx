/**
 * ClinicalCopilot — "Command Center" AI interface for practitioners.
 *
 * Design principles:
 * - Density over whitespace — every pixel earns its place
 * - Context-first — priority banner shows why you should ask
 * - Smart cards (welcome) → Query/Response cards (conversation)
 * - Single blue accent + severity-only color (red/amber)
 * - Professional, not consumer-chat
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { BriefingData } from '../../hooks/usePatientBriefing'
import type { ChatMessage } from '../../services/ai/openaiPlatform'
import { isAIConfigured } from '../../services/ai/openaiPlatform'
import { streamCopilotResponse, type CopilotContext } from '../../services/copilot/copilotService'
import { getContextualPrompts, getFollowUpPrompts, type PromptCard } from './copilotPrompts'
import { getVitalStatus } from '../../services/fhir/observations'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { CopilotMessage, type CopilotMessageData } from './CopilotMessage'

// ---------------------------------------------------------------------------
// Priority banner — shows the most urgent finding at a glance
// ---------------------------------------------------------------------------

function PriorityBanner({ data }: { data: BriefingData }) {
  const alerts: Array<{ text: string; level: 'critical' | 'warning' | 'info' }> = []

  // Critical vitals
  for (const vg of data.vitalGroups) {
    if (vg.readings.length > 0) {
      const r = vg.readings[0]
      const status = getVitalStatus(vg.type, r.numericValue)
      if (status === 'critical' || status === 'warning') {
        alerts.push({
          text: `${vg.label} ${r.displayValue}${r.unit ? ' ' + r.unit : ''}`,
          level: status === 'critical' ? 'critical' : 'warning',
        })
      }
    }
  }

  // Risk scores
  const news2 = data.riskScores.news2
  if (news2 && news2.total >= 5) {
    alerts.push({ text: `NEWS2: ${news2.total} (${news2.level})`, level: 'critical' })
  }

  const qsofa = data.riskScores.qsofa
  if (qsofa?.sepsisRisk) {
    alerts.push({ text: 'qSOFA: Sepsis risk flagged', level: 'critical' })
  }

  // Critical insights
  for (const insight of data.insights.slice(0, 2)) {
    if (insight.severity === 'critical') {
      alerts.push({ text: insight.headline, level: 'critical' })
    }
  }

  if (alerts.length === 0) {
    // Provide a neutral summary
    const condCount = data.conditionFlags.length
    const medCount = data.clinicalSummary?.medications?.length ?? 0
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        <span className="text-[12px] text-slate-600">
          {condCount} active condition{condCount !== 1 ? 's' : ''} · {medCount} medication{medCount !== 1 ? 's' : ''} · No critical alerts
        </span>
      </div>
    )
  }

  const hasCritical = alerts.some(a => a.level === 'critical')
  const bgClass = hasCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
  const dotClass = hasCritical ? 'bg-red-500' : 'bg-amber-500'
  const textClass = hasCritical ? 'text-red-800' : 'text-amber-800'

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${bgClass}`}>
      <div className={`w-2 h-2 rounded-full ${dotClass} shrink-0 mt-1 animate-pulse`} />
      <div className={`text-[12px] font-medium ${textClass} leading-relaxed`}>
        {alerts.slice(0, 4).map(a => a.text).join(' · ')}
        {alerts.length > 4 && ` (+${alerts.length - 4} more)`}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Smart Action Card
// ---------------------------------------------------------------------------

const URGENCY_STYLES = {
  critical: 'border-l-red-500 bg-red-50/40',
  warning: 'border-l-amber-400 bg-amber-50/30',
  info: 'border-l-blue-300 bg-white',
} as const

function ActionCard({
  card,
  onClick,
  disabled,
}: {
  card: PromptCard
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left w-full px-3 py-2.5 rounded-lg border border-slate-200 border-l-[3px] cursor-pointer
        transition-all duration-150 hover:shadow-md hover:border-slate-300 active:scale-[0.99]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${URGENCY_STYLES[card.urgency]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-800 leading-tight">{card.label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{card.context}</div>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="shrink-0 text-slate-300 mt-0.5"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Inline follow-up suggestions (shown after each AI response)
// ---------------------------------------------------------------------------

function FollowUpSuggestions({
  cards,
  onSelect,
  disabled,
}: {
  cards: PromptCard[]
  onSelect: (card: PromptCard) => void
  disabled: boolean
}) {
  if (cards.length === 0) return null
  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">Related queries</div>
      <div className="flex flex-col gap-1">
        {cards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card)}
            disabled={disabled}
            className="text-left px-2.5 py-1.5 rounded-md text-[11px] font-medium text-blue-600 bg-blue-50/50 border border-blue-100 cursor-pointer
              hover:bg-blue-50 hover:border-blue-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {card.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ClinicalCopilotProps {
  data: BriefingData | null
  loading: boolean
}

export function ClinicalCopilot({ data, loading }: ClinicalCopilotProps) {
  const [messages, setMessages] = useState<CopilotMessageData[]>([])
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [askedIds, setAskedIds] = useState<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const speech = useSpeechRecognition()

  const contextualPrompts = useMemo(() => getContextualPrompts(data), [data])
  const followUps = useMemo(() => getFollowUpPrompts(askedIds, data), [askedIds, data])
  const hasContext = !!data?.clinicalSummary
  const hasMessages = messages.length > 0

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync speech transcript → input field in real-time
  useEffect(() => {
    if (speech.listening && speech.transcript) {
      setInput(speech.transcript)
    }
  }, [speech.listening, speech.transcript])

  // ── Voice toggle ──────────────────────────────────────────────────

  const handleMicToggle = useCallback(() => {
    if (speech.listening) {
      const finalText = speech.stop()
      if (finalText) {
        setInput(finalText)
        inputRef.current?.focus()
      }
    } else {
      setInput('')
      speech.start()
    }
  }, [speech])

  // ── Send message ─────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string, displayLabel?: string) => {
    if (!text.trim() || !data?.clinicalSummary || streaming) return

    const userMsg: CopilotMessageData = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: displayLabel || text.trim(),
      timestamp: new Date(),
    }

    const assistantMsg: CopilotMessageData = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    const context: CopilotContext = {
      summary: data.clinicalSummary,
      insights: data.insights,
      labTrends: data.labTrends,
      riskScores: data.riskScores,
    }

    try {
      const finalContent = await streamCopilotResponse(
        text.trim(),
        chatHistory,
        context,
        (accumulated) => {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: accumulated }
            }
            return updated
          })
        },
      )

      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: finalContent, streaming: false }
        }
        return updated
      })

      setChatHistory(prev => [
        ...prev,
        { role: 'user' as const, content: text.trim() },
        { role: 'assistant' as const, content: finalContent },
      ])
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
            streaming: false,
          }
        }
        return updated
      })
    }

    setStreaming(false)
  }, [data, chatHistory, streaming])

  // ── Handle card/chip click ────────────────────────────────────────

  const handleCardClick = useCallback((card: PromptCard) => {
    setAskedIds(prev => new Set(prev).add(card.id))
    void sendMessage(card.prompt, card.label)
  }, [sendMessage])

  // ── Handle submit ─────────────────────────────────────────────────

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }, [input, sendMessage])

  // ── Clear conversation ────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setMessages([])
    setChatHistory([])
    setAskedIds(new Set())
    inputRef.current?.focus()
  }, [])

  // ── Not configured state ──────────────────────────────────────────

  if (!isAIConfigured()) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-[13px] font-medium">AI not configured</p>
        <p className="text-[11px] text-center max-w-xs">Set <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded">VITE_OPENAI_API_KEY</code> in .env to enable the Clinical Copilot.</p>
      </div>
    )
  }

  // ── Top 6 cards for welcome grid ──────────────────────────────────

  const welcomeCards = contextualPrompts.slice(0, 6)

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col -mx-4 -my-3" style={{ height: 'calc(100vh - 44px)' }}>
      {/* ── Scrollable content area ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* ── Welcome state (no conversation) ── */}
        {!hasMessages && (
          <div className="px-4 py-3 max-w-3xl mx-auto">
            {/* Priority banner */}
            {data && hasContext && (
              <PriorityBanner data={data} />
            )}

            {/* Loading states */}
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg bg-blue-50 border border-blue-100">
                <div className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spinner" />
                <span className="text-[12px] text-blue-700 font-medium">Loading clinical data…</span>
              </div>
            )}
            {!loading && !hasContext && (
              <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-lg bg-amber-50 border border-amber-100">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-[12px] text-amber-700 font-medium">Waiting for clinical summary…</span>
              </div>
            )}

            {/* Section header */}
            <div className="flex items-center justify-between mt-4 mb-2">
              <h3 className="m-0 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Quick Actions
              </h3>
              <span className="text-[10px] text-slate-300">
                {contextualPrompts.length} available
              </span>
            </div>

            {/* Smart action cards – 2 column grid */}
            {hasContext && (
              <div className="grid grid-cols-2 gap-2">
                {welcomeCards.map(card => (
                  <ActionCard
                    key={card.id}
                    card={card}
                    onClick={() => handleCardClick(card)}
                    disabled={streaming}
                  />
                ))}
              </div>
            )}

            {/* More actions (collapsed) */}
            {hasContext && contextualPrompts.length > 6 && (
              <MoreActions
                cards={contextualPrompts.slice(6)}
                onSelect={handleCardClick}
                disabled={streaming}
              />
            )}
          </div>
        )}

        {/* ── Conversation state ── */}
        {hasMessages && (
          <div className="px-4 py-3 max-w-3xl mx-auto flex flex-col gap-1">
            {messages.map((msg, idx) => {
              // Show follow-up suggestions after the last completed assistant message
              const isLastAssistant =
                msg.role === 'assistant' &&
                !msg.streaming &&
                idx === messages.length - 1

              return (
                <div key={msg.id}>
                  <CopilotMessage message={msg} />
                  {isLastAssistant && !streaming && (
                    <FollowUpSuggestions
                      cards={followUps}
                      onSelect={handleCardClick}
                      disabled={streaming}
                    />
                  )}
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* ── Input bar (always pinned to bottom) ── */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5">
        {/* Listening indicator */}
        {speech.listening && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 max-w-3xl mx-auto">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[11px] font-medium text-red-600">Listening…</span>
            <span className="text-[11px] text-red-400 truncate flex-1">{speech.transcript || 'Speak now'}</span>
            <button
              type="button"
              className="text-[10px] text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer"
              onClick={() => speech.cancel()}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Speech error */}
        {speech.error && !speech.listening && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 max-w-3xl mx-auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
            <span className="text-[11px] text-amber-700">{speech.error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2 max-w-3xl mx-auto">
          {hasMessages && (
            <button
              type="button"
              className="shrink-0 p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={handleClear}
              title="New conversation"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            className={`flex-1 px-4 py-2.5 rounded-lg border text-[13px] text-slate-800 placeholder-slate-400 outline-none transition-all ${
              speech.listening
                ? 'border-red-300 bg-red-50/30 ring-2 ring-red-100'
                : 'border-slate-200 bg-slate-50 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100'
            }`}
            placeholder={speech.listening ? 'Listening…' : hasContext ? 'Ask about this patient…' : 'Waiting for clinical data…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!hasContext || streaming}
          />
          {/* Mic button — only shown if browser supports it */}
          {speech.supported && (
            <button
              type="button"
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 ${
                speech.listening
                  ? 'bg-red-500 text-white shadow-md shadow-red-200 hover:bg-red-600 scale-110'
                  : 'bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50'
              }`}
              onClick={handleMicToggle}
              disabled={!hasContext || streaming}
              title={speech.listening ? 'Stop listening' : 'Voice input'}
            >
              {speech.listening ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </button>
          )}
          <button
            type="submit"
            className="shrink-0 w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center cursor-pointer hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={!input.trim() || !hasContext || streaming}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// "More Actions" expandable section
// ---------------------------------------------------------------------------

function MoreActions({
  cards,
  onSelect,
  disabled,
}: {
  cards: PromptCard[]
  onSelect: (card: PromptCard) => void
  disabled: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-blue-500 bg-transparent border-none cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {expanded ? 'Less' : 'More'} actions ({cards.length})
      </button>
      {expanded && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {cards.map(card => (
            <ActionCard
              key={card.id}
              card={card}
              onClick={() => onSelect(card)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}
