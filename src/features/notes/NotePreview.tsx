/**
 * NotePreview — rich structured view of a clinical note.
 *
 * Parses the plain-text note (SOAP / A&P / SBAR) and renders it with:
 * - Bold, prominent section headers with left accent borders
 * - Subtle dividers between sections
 * - Styled AI disclaimer footer
 * - Bullet formatting for list items (lines starting with -)
 * - [CRITICAL] and [ABNORMAL] tags highlighted inline
 */

// Known section headers across all formats
const SECTION_HEADERS = new Set([
  'SUBJECTIVE:',
  'OBJECTIVE:',
  'ASSESSMENT:',
  'PLAN:',
  'SITUATION:',
  'BACKGROUND:',
  'RECOMMENDATION:',
  'MONITORING:',
  'FOLLOW-UP:',
])

const AI_DISCLAIMER_PREFIX = 'This note was AI-assisted'

interface NoteSection {
  header: string | null // null for the preamble (DATE/TIME line etc.)
  lines: string[]
}

function parseNote(text: string): { sections: NoteSection[]; disclaimer: string | null } {
  const rawLines = text.split('\n')
  const sections: NoteSection[] = []
  let disclaimer: string | null = null
  let current: NoteSection = { header: null, lines: [] }

  for (const line of rawLines) {
    const trimmed = line.trim()

    // Capture AI disclaimer
    if (trimmed.startsWith(AI_DISCLAIMER_PREFIX)) {
      disclaimer = trimmed
      continue
    }

    // Check if this line is a section header
    if (SECTION_HEADERS.has(trimmed)) {
      // Push previous section
      if (current.header !== null || current.lines.length > 0) {
        sections.push(current)
      }
      current = { header: trimmed.replace(/:$/, ''), lines: [] }
      continue
    }

    // Numbered problem headers like "1. Hypokalemia — ..."
    if (/^\d+\.\s+\[?.+/.test(trimmed) && current.header === 'ASSESSMENT') {
      // Keep as regular line in assessment
      current.lines.push(line)
      continue
    }

    current.lines.push(line)
  }

  // Push last section
  if (current.header !== null || current.lines.length > 0) {
    sections.push(current)
  }

  return { sections, disclaimer }
}

// Highlight [CRITICAL] and [ABNORMAL] tags inline
function renderLineContent(text: string) {
  const parts = text.split(/(\[CRITICAL\]|\[ABNORMAL\]|\[WARNING\])/)
  return parts.map((part, i) => {
    if (part === '[CRITICAL]') {
      return <span key={i} className="inline-block px-1 py-px rounded text-[10px] font-bold bg-red-100 text-red-700 mx-0.5">CRITICAL</span>
    }
    if (part === '[ABNORMAL]') {
      return <span key={i} className="inline-block px-1 py-px rounded text-[10px] font-bold bg-amber-100 text-amber-700 mx-0.5">ABNORMAL</span>
    }
    if (part === '[WARNING]') {
      return <span key={i} className="inline-block px-1 py-px rounded text-[10px] font-bold bg-amber-100 text-amber-700 mx-0.5">WARNING</span>
    }
    return <span key={i}>{part}</span>
  })
}

function renderLine(line: string, index: number) {
  const trimmed = line.trim()
  if (!trimmed) return <div key={index} className="h-2" /> // blank line → spacer

  // Bullet/dash list item
  if (/^[-•]\s/.test(trimmed)) {
    return (
      <div key={index} className="flex gap-2 pl-2 text-[13px] text-slate-700 leading-relaxed">
        <span className="text-slate-400 shrink-0 select-none">•</span>
        <span>{renderLineContent(trimmed.replace(/^[-•]\s+/, ''))}</span>
      </div>
    )
  }

  // Sub-item (starts with spaces + dash)
  if (/^\s+[-•]\s/.test(line)) {
    return (
      <div key={index} className="flex gap-2 pl-6 text-[13px] text-slate-600 leading-relaxed">
        <span className="text-slate-300 shrink-0 select-none">–</span>
        <span>{renderLineContent(trimmed.replace(/^[-•]\s+/, ''))}</span>
      </div>
    )
  }

  // Numbered item (1. Problem — ...)
  if (/^\d+\.\s/.test(trimmed)) {
    return (
      <div key={index} className="text-[13px] font-semibold text-slate-800 leading-relaxed mt-1">
        {renderLineContent(trimmed)}
      </div>
    )
  }

  // Regular paragraph
  return (
    <p key={index} className="m-0 text-[13px] text-slate-700 leading-relaxed">
      {renderLineContent(trimmed)}
    </p>
  )
}

// Section header accent colors
const HEADER_ACCENTS: Record<string, string> = {
  SUBJECTIVE: 'border-l-blue-400',
  OBJECTIVE: 'border-l-slate-400',
  ASSESSMENT: 'border-l-amber-400',
  PLAN: 'border-l-green-400',
  SITUATION: 'border-l-blue-400',
  BACKGROUND: 'border-l-slate-400',
  RECOMMENDATION: 'border-l-green-400',
  MONITORING: 'border-l-slate-300',
  'FOLLOW-UP': 'border-l-slate-300',
}

interface NotePreviewProps {
  content: string
  className?: string
}

export function NotePreview({ content, className = '' }: NotePreviewProps) {
  const { sections, disclaimer } = parseNote(content)

  return (
    <div className={`flex flex-col gap-0 ${className}`}>
      {sections.map((section, si) => (
        <div key={si}>
          {/* Section header */}
          {section.header && (
            <div className={`border-l-[3px] ${HEADER_ACCENTS[section.header] ?? 'border-l-slate-300'} pl-3 py-1.5 mt-3 mb-1`}>
              <h4 className="m-0 text-[12px] font-bold uppercase tracking-wider text-slate-500">
                {section.header}
              </h4>
            </div>
          )}

          {/* Section body */}
          <div className={section.header ? 'pl-[15px]' : ''}>
            {section.lines.map((line, li) => renderLine(line, li))}
          </div>

          {/* Divider between sections (not after last) */}
          {si < sections.length - 1 && section.header && (
            <hr className="my-2 border-none border-t border-slate-100 h-px bg-slate-100" />
          )}
        </div>
      ))}

      {/* AI disclaimer — styled as metadata, visually separate */}
      {disclaimer && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="m-0 text-[11px] text-slate-400 italic leading-relaxed">
            {disclaimer}
          </p>
        </div>
      )}
    </div>
  )
}
