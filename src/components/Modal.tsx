import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Optional width override (default 520px) */
  width?: number
}

/**
 * Reusable modal overlay. Traps focus, closes on Escape and backdrop click.
 * Renders only when `open` is true.
 */
export function Modal({ open, onClose, title, children, width = 520 }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-[14px] shadow-modal flex flex-col max-h-[85vh] overflow-hidden animate-modal-in"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-card-border shrink-0">
          <h2 className="m-0 text-[17px] font-bold">{title}</h2>
          <button
            className="bg-transparent border-none text-[22px] text-slate-400 cursor-pointer px-1.5 py-0.5 rounded-md leading-none transition-[background,color] duration-[120ms] hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="px-5 pt-4 pb-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </dialog>
  )
}
