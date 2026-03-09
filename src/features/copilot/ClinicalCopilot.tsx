/**
 * ClinicalCopilot — AI-powered "Chat With the Chart" interface.
 *
 * Receives the same BriefingData from usePatientBriefing (read-only),
 * provides context-aware prompt chips + free-text input,
 * and streams OpenAI responses with full patient context.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { BriefingData } from '../../hooks/usePatientBriefing'
import type { ChatMessage } from '../../services/ai/openaiPlatform'
import { isAIConfigured } from '../../services/ai/openaiPlatform'
import { streamCopilotResponse, type CopilotContext } from '../../services/copilot/copilotService'
import { getContextualPrompts, CATEGORY_META, type PromptChip } from './copilotPrompts'
import { CopilotMessage, type CopilotMessageData } from './CopilotMessage'

// ---------------------------------------------------------------------------
// Component
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
  const [showPrompts, setShowPrompts] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const contextualPrompts = getContextualPrompts(data)
  const hasContext = !!data?.clinicalSummary

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ─────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !data?.clinicalSummary || streaming) return

    const userMsg: CopilotMessageData = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
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
    setShowPrompts(false)

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

      // Finalize the streaming message
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: finalContent, streaming: false }
        }
        return updated
      })

      // Update chat history for multi-turn context
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

  // ── Handle prompt chip click ──────────────────────────────────────

  const handleChipClick = useCallback((chip: PromptChip) => {
    void sendMessage(chip.prompt)
    // Show the label in the chat, not the full prompt
    setMessages(prev => {
      const updated = [...prev]
      // Replace the last user message content with the display label
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'user') {
          updated[i] = { ...updated[i], content: chip.label }
          break
        }
      }
      return updated
    })
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
    setShowPrompts(true)
    inputRef.current?.focus()
  }, [])

  // ── Not configured state ──────────────────────────────────────────

  if (!isAIConfigured()) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-300">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-[13px] font-medium">AI not configured</p>
        <p className="text-[11px] text-center max-w-xs">Set VITE_OPENAI_API_KEY in .env to enable the Clinical Copilot.</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────

  // Group prompts by category for display
  const groupedPrompts = contextualPrompts.reduce<Record<string, PromptChip[]>>((acc, chip) => {
    if (!acc[chip.category]) acc[chip.category] = []
    acc[chip.category].push(chip)
    return acc
  }, {})

  return (
    <div className="flex flex-col -mx-4 -my-3" style={{ height: 'calc(100vh - 44px)' }}>
      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {/* Welcome + prompt chips (shown when no messages) */}
        {showPrompts && messages.length === 0 && (
          <div className="flex flex-col gap-4">
            {/* Welcome header */}
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h2 className="text-[16px] font-bold text-slate-800 mb-1">Clinical Copilot</h2>
              <p className="text-[12px] text-slate-500 max-w-md mx-auto">
                Ask questions about this patient. The AI has their vitals, conditions, medications, labs, and risk scores loaded.
              </p>
              {loading && (
                <p className="text-[11px] text-amber-500 mt-2 font-medium">Loading clinical data…</p>
              )}
              {!loading && !hasContext && (
                <p className="text-[11px] text-amber-500 mt-2 font-medium">Waiting for clinical summary…</p>
              )}
            </div>

            {/* Prompt chips by category */}
            {hasContext && (
              <div className="flex flex-col gap-3">
                {Object.entries(groupedPrompts).map(([category, chips]) => {
                  const meta = CATEGORY_META[category as PromptChip['category']]
                  return (
                    <div key={category}>
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                        {meta.label}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map(chip => (
                          <button
                            key={chip.id}
                            type="button"
                            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer transition-all duration-150 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] ${meta.color}`}
                            onClick={() => handleChipClick(chip)}
                            disabled={streaming}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map(msg => (
          <CopilotMessage key={msg.id} message={msg} />
        ))}

        {/* Scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
        {/* Compact chips row — visible when conversation is active and prompts toggled on */}
        {messages.length > 0 && showPrompts && hasContext && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {contextualPrompts.map(chip => {
              const meta = CATEGORY_META[chip.category]
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium border cursor-pointer transition-all duration-150 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] ${meta.color}`}
                  onClick={() => handleChipClick(chip)}
                  disabled={streaming}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              className="shrink-0 p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
              onClick={handleClear}
              title="Clear conversation"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all"
            placeholder={hasContext ? 'Ask about this patient…' : 'Waiting for clinical data…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={!hasContext || streaming}
          />
          <button
            type="submit"
            className="shrink-0 w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center cursor-pointer hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            disabled={!input.trim() || !hasContext || streaming}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
        {messages.length > 0 && (
          <button
            type="button"
            className="mt-2 text-[10px] text-slate-400 hover:text-blue-500 bg-transparent border-none cursor-pointer transition-colors"
            onClick={() => setShowPrompts(s => !s)}
          >
            {showPrompts ? 'Hide' : 'Show'} suggested prompts
          </button>
        )}
      </div>
    </div>
  )
}
