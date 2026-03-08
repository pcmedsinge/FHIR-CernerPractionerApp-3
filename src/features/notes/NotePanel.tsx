/**
 * NotePanel — AI-assisted clinical note generation and editing.
 *
 * Redesigned UX:
 * - Compact constrained height (no page-level scrolling from notes)
 * - Primary action: "Save to EHR" (FHIR DocumentReference)
 * - Secondary: "Copy" (clipboard fallback)
 * - No token usage display (practitioners don't care)
 * - Color-coded status: blue (generating), green (ready/saved), amber (edited)
 * - Practitioner has full edit authority — AI draft is a starting point
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  generateClinicalNote,
  saveNoteToHistory,
  getNoteHistory,
  type NoteFormat,
  type NoteHistoryEntry,
} from '../../services/ai/noteGeneration'
import { saveNoteAsDocumentReference } from '../../services/fhir/documentReference'
import { isAIConfigured } from '../../services/ai/openaiPlatform'
import type { PatientClinicalSummary } from '../../services/fhir/patientSummary'
import type { ClinicalInsight, LabTrend } from '../../services/ai/clinicalAnalysis'
import type { RiskScores } from '../../types/app'
import { IconNote, IconCheckCircle, IconWarning, IconRefresh } from '../../components/icons/ClinicalIcons'

// ---------------------------------------------------------------------------
// Format labels
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS: Array<{ value: NoteFormat; label: string; desc: string }> = [
  { value: 'soap', label: 'SOAP', desc: 'Subjective, Objective, Assessment, Plan' },
  { value: 'ap', label: 'A/P', desc: 'Assessment & Plan' },
  { value: 'handoff', label: 'SBAR', desc: 'Situation, Background, Assessment, Recommendation' },
]

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

const STATUS_CLASSES = {
  idle: 'border-card-border bg-white',
  generating: 'border-blue-300 bg-blue-50',
  ready: 'border-green-300 bg-green-50',
  edited: 'border-amber-300 bg-amber-50',
  saved: 'border-green-400 bg-green-50',
  error: 'border-red-300 bg-red-50',
} as const

type NoteStatus = keyof typeof STATUS_CLASSES

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotePanelProps {
  summary: PatientClinicalSummary | null
  insights: ClinicalInsight[]
  labTrends: LabTrend[]
  riskScores: RiskScores
  /** Whether tier2 data is still loading (disable generate until ready) */
  dataLoading: boolean
}

export function NotePanel({ summary, insights, labTrends, riskScores, dataLoading }: NotePanelProps) {
  const { session } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [format, setFormat] = useState<NoteFormat>('soap')
  const [generatedFormat, setGeneratedFormat] = useState<NoteFormat | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [status, setStatus] = useState<NoteStatus>('idle')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<NoteHistoryEntry[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load history on mount
  useEffect(() => {
    setHistory(getNoteHistory())
  }, [])

  // ── Generate ────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!summary || generating) return
    setGenerating(true)
    setStatus('generating')
    setError(null)
    setSaveMessage(null)
    setCopied(false)

    const result = await generateClinicalNote(summary, insights, labTrends, riskScores, format)

    if (result.error) {
      setError(result.error)
      setStatus('error')
    } else {
      setNoteContent(result.content)
      setOriginalContent(result.content)
      setGeneratedFormat(format)
      setStatus('ready')
      setExpanded(true)

      // Auto-save to local history
      const entry: NoteHistoryEntry = {
        id: `note-${Date.now()}`,
        content: result.content,
        format,
        generatedAt: result.generatedAt,
        editedAt: null,
        wasEdited: false,
      }
      saveNoteToHistory(entry)
      setHistory(getNoteHistory())
    }
    setGenerating(false)
  }, [summary, insights, labTrends, riskScores, format, generating])

  // ── Format change ──────────────────────────────────────────────────

  const handleFormatChange = useCallback((newFormat: NoteFormat) => {
    setFormat(newFormat)
    // If we already have a note in a different format, clear it so the
    // practitioner doesn't accidentally save a SOAP note labelled as SBAR
    if (noteContent && generatedFormat && newFormat !== generatedFormat) {
      setNoteContent('')
      setOriginalContent('')
      setGeneratedFormat(null)
      setStatus('idle')
      setSaveMessage(null)
    }
  }, [noteContent, generatedFormat])

  // ── Edit tracking ───────────────────────────────────────────────────

  const handleContentChange = useCallback((newContent: string) => {
    setNoteContent(newContent)
    const isEdited = newContent !== originalContent
    setStatus(isEdited ? 'edited' : 'ready')
    setSaveMessage(null)
  }, [originalContent])

  // ── Save to EHR ─────────────────────────────────────────────────────

  const handleSaveToEHR = useCallback(async () => {
    if (!session || !noteContent || saving) return
    setSaving(true)
    setSaveMessage(null)
    setError(null)

    console.info('[SmartNotes] Saving note to EHR…', {
      patientId: session.patientId,
      format,
      encounterId: session.encounterId ?? '(none)',
      practitionerId: session.practitionerId ?? '(none)',
      contentLength: noteContent.length,
    })

    const result = await saveNoteAsDocumentReference(
      session.patientId,
      session.accessToken,
      noteContent,
      format,
      session.practitionerId,
      session.encounterId,
    )

    if (result.success) {
      console.info('[SmartNotes] ✓ Saved successfully', {
        documentId: result.documentId,
      })

      // Verification: read back the saved resource
      if (result.documentId) {
        try {
          const verifyRes = await fetch(
            `${import.meta.env.VITE_FHIR_BASE_URL}/DocumentReference/${result.documentId}`,
            { headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/fhir+json' } },
          )
          if (verifyRes.ok) {
            console.info('[SmartNotes] ✓ Verification read-back successful (resource exists)')
          } else {
            console.warn('[SmartNotes] ⚠ Verification read-back returned', verifyRes.status)
          }
        } catch (verifyErr) {
          console.warn('[SmartNotes] ⚠ Verification read-back failed:', verifyErr)
        }
      }

      setStatus('saved')
      setSaveMessage(result.documentId ? `Saved — ID ${result.documentId}` : 'Saved to EHR')

      // Save edited version to local history if edited
      if (noteContent !== originalContent) {
        const entry: NoteHistoryEntry = {
          id: `note-${Date.now()}`,
          content: noteContent,
          format,
          generatedAt: new Date().toISOString(),
          editedAt: new Date().toISOString(),
          wasEdited: true,
        }
        saveNoteToHistory(entry)
        setHistory(getNoteHistory())
      }
    } else {
      console.error('[SmartNotes] ✗ Save failed:', result.error)
      setError(result.error ?? 'Failed to save')
    }
    setSaving(false)
  }, [session, noteContent, format, saving, originalContent])

  // ── Copy to clipboard ───────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(noteContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      if (textareaRef.current) {
        textareaRef.current.select()
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }, [noteContent])

  // ── Load from history ───────────────────────────────────────────────

  const handleLoadFromHistory = useCallback((entry: NoteHistoryEntry) => {
    setNoteContent(entry.content)
    setOriginalContent(entry.content)
    setFormat(entry.format)
    setGeneratedFormat(entry.format)
    setStatus('ready')
    setShowHistory(false)
    setExpanded(true)
    setSaveMessage(null)
  }, [])

  const canGenerate = !generating && !dataLoading && !!summary && isAIConfigured()
  const canSave = !!noteContent && !generating && !saving && !!session

  // ── Collapsed state — single-line bar ─────────────────────────────

  if (!expanded && status === 'idle') {
    return (
      <section className="border border-card-border rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
          <button
            type="button"
            className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-left p-0"
            onClick={() => setExpanded(true)}
          >
            <IconNote size={14} className="text-slate-500" />
            <span className="text-[12px] font-semibold text-slate-600">Smart Notes</span>
            <span className="text-[10px] text-slate-400">AI-assisted clinical documentation</span>
          </button>
          <div className="flex items-center gap-1.5">
            {history.length > 0 && (
              <button
                type="button"
                className="text-[10px] text-slate-400 bg-transparent border border-card-border rounded px-2 py-0.5 cursor-pointer hover:bg-white hover:text-slate-600"
                onClick={() => { setShowHistory(true); setExpanded(true) }}
                title="Previously generated notes (local)"
              >
                {history.length} draft{history.length !== 1 ? 's' : ''}
              </button>
            )}
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border-none bg-accent text-white text-[12px] font-semibold cursor-pointer hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canGenerate}
              onClick={handleGenerate}
              title={!isAIConfigured() ? 'AI not configured' : dataLoading ? 'Waiting for clinical data…' : 'Generate clinical note'}
            >
              <IconNote size={12} />
              Generate Note
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ── Expanded state ────────────────────────────────────────────────

  return (
    <section className={`border rounded-xl shadow-card overflow-hidden transition-colors duration-200 ${STATUS_CLASSES[status]}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-inherit bg-inherit">
        <button
          type="button"
          className="flex items-center gap-2 bg-transparent border-none cursor-pointer text-left p-0"
          onClick={() => { if (status === 'idle') setExpanded(false); else setExpanded(e => !e) }}
        >
          <IconNote size={14} className={
            status === 'error' ? 'text-red-500' :
            status === 'generating' ? 'text-blue-600' :
            status === 'saved' ? 'text-green-600' :
            'text-slate-600'
          } />
          <span className="text-[12px] font-semibold text-slate-700">
            Smart Notes
            {status === 'generating' && <span className="ml-1.5 text-blue-600 font-normal">Generating…</span>}
            {status === 'ready' && <span className="ml-1.5 text-green-600 font-normal">Ready</span>}
            {status === 'edited' && <span className="ml-1.5 text-amber-600 font-normal">Edited</span>}
            {status === 'saved' && <span className="ml-1.5 text-green-600 font-normal">Saved to EHR</span>}
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          {/* Format selector */}
          <div className="flex border border-card-border rounded-md overflow-hidden">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`px-2 py-0.5 text-[10px] font-semibold border-none cursor-pointer transition-colors duration-100 ${
                  format === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-white text-slate-400 hover:bg-slate-50'
                }`}
                onClick={() => handleFormatChange(opt.value)}
                title={opt.desc}
                disabled={generating}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* History toggle */}
          {history.length > 0 && (
            <button
              type="button"
              className={`text-[10px] border rounded px-2 py-0.5 cursor-pointer transition-colors duration-100 ${
                showHistory ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-transparent text-slate-400 border-card-border hover:bg-white'
              }`}
              onClick={() => setShowHistory(h => !h)}
              title="Previously generated notes (local)"
            >
              {history.length} draft{history.length !== 1 ? 's' : ''}
            </button>
          )}

          {/* Generate / Regenerate */}
          <button
            type="button"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border-none bg-accent text-white text-[11px] font-semibold cursor-pointer hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            {generating ? (
              <>
                <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spinner" />
                Generating…
              </>
            ) : noteContent ? (
              <>
                <IconRefresh size={11} />
                Regenerate
              </>
            ) : (
              <>
                <IconNote size={11} />
                Generate
              </>
            )}
          </button>

          {/* Collapse */}
          <button
            type="button"
            className="text-[10px] text-slate-400 bg-transparent border-none cursor-pointer px-1 hover:text-slate-600"
            onClick={() => setExpanded(false)}
          >
            ▲
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-inherit px-3 py-2 bg-slate-50 max-h-32 overflow-y-auto">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Recent Drafts</div>
          {history.map(entry => (
            <button
              key={entry.id}
              type="button"
              className="w-full text-left px-2 py-1.5 rounded-md mb-1 bg-white border border-card-border cursor-pointer hover:bg-slate-50 transition-colors duration-100 flex items-center gap-2"
              onClick={() => handleLoadFromHistory(entry)}
            >
              <span className={`text-[9px] font-bold uppercase px-1.5 py-px rounded ${
                entry.format === 'soap' ? 'bg-blue-100 text-blue-700' :
                entry.format === 'ap' ? 'bg-green-100 text-green-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {entry.format}
              </span>
              <span className="text-[11px] text-slate-600 flex-1 truncate">
                {entry.content.slice(0, 60)}…
              </span>
              <span className="text-[9px] text-slate-400 shrink-0">
                {new Date(entry.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {entry.wasEdited && <span className="text-[9px] text-amber-500 shrink-0">edited</span>}
            </button>
          ))}
        </div>
      )}

      {/* Generating skeleton */}
      {generating && !noteContent && (
        <div className="px-4 py-6 flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spinner" />
          <span className="text-sm text-blue-700 font-medium">Drafting {FORMAT_OPTIONS.find(f => f.value === format)?.desc ?? 'note'}…</span>
          <span className="text-[10px] text-blue-400">Synthesizing vitals, labs, medications, and risk scores</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-b border-red-200">
          <IconWarning size={14} className="text-red-500 shrink-0" />
          <span className="text-[11px] text-red-700">{error}</span>
        </div>
      )}

      {/* Note content (editable) — constrained height, internal scroll */}
      {noteContent && !generating && (
        <div className="flex flex-col">
          <textarea
            ref={textareaRef}
            className="w-full h-48 px-4 py-3 text-[13px] font-mono leading-relaxed text-slate-800 bg-transparent border-none outline-none resize-none overflow-y-auto"
            value={noteContent}
            onChange={e => handleContentChange(e.target.value)}
            spellCheck
          />

          {/* Action bar */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-inherit bg-inherit">
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              {/* Format badge */}
              {generatedFormat && (
                <span className={`font-bold uppercase px-1.5 py-px rounded ${
                  generatedFormat === 'soap' ? 'bg-blue-100 text-blue-600' :
                  generatedFormat === 'ap' ? 'bg-green-100 text-green-600' :
                  'bg-amber-100 text-amber-600'
                }`}>
                  {generatedFormat === 'handoff' ? 'SBAR' : generatedFormat.toUpperCase()}
                </span>
              )}
              {/* Encounter context */}
              {session?.encounterId
                ? <span title={`Encounter/${session.encounterId}`}>Enc: {session.encounterId.slice(0, 8)}…</span>
                : <span className="text-slate-300">No encounter</span>
              }
              {status === 'edited' && <span className="text-amber-500 font-medium">Unsaved edits</span>}
              {saveMessage && <span className="text-green-600 font-medium">{saveMessage}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Copy — secondary */}
              <button
                type="button"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-all duration-150 ${
                  copied
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-white text-slate-500 border border-card-border hover:bg-slate-50 hover:text-slate-700'
                }`}
                onClick={handleCopy}
                title="Copy note to clipboard"
              >
                {copied ? (
                  <>
                    <IconCheckCircle size={12} />
                    Copied
                  </>
                ) : (
                  'Copy'
                )}
              </button>

              {/* Save to EHR — primary */}
              <button
                type="button"
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 border-none ${
                  status === 'saved'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                disabled={!canSave || status === 'saved'}
                onClick={handleSaveToEHR}
                title="Save note as DocumentReference to EHR"
              >
                {saving ? (
                  <>
                    <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spinner" />
                    Saving…
                  </>
                ) : status === 'saved' ? (
                  <>
                    <IconCheckCircle size={12} />
                    Saved to EHR
                  </>
                ) : (
                  'Save to EHR'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state when expanded but no note yet */}
      {!noteContent && !generating && !error && expanded && (
        <div className="px-4 py-6 text-center">
          <IconNote size={24} className="text-slate-300 mx-auto mb-2" />
          <p className="text-[12px] text-slate-400 m-0">
            Select a format and click <strong>Generate</strong> to create an AI-assisted clinical note
          </p>
          {!isAIConfigured() && (
            <p className="text-[11px] text-amber-500 mt-1 m-0">AI not configured — set VITE_OPENAI_API_KEY in .env</p>
          )}
        </div>
      )}
    </section>
  )
}
