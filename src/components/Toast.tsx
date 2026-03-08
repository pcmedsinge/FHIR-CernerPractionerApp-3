import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

let nextId = 0

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <ToastMessage key={t.id} toast={t} onDone={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Single toast message
// ---------------------------------------------------------------------------

function ToastMessage({ toast, onDone }: { toast: ToastItem; onDone: () => void }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const autoClose = window.setTimeout(() => setExiting(true), 6000)
    return () => window.clearTimeout(autoClose)
  }, [])

  useEffect(() => {
    if (!exiting) return
    const timer = window.setTimeout(onDone, 300) // match CSS transition
    return () => window.clearTimeout(timer)
  }, [exiting, onDone])

  const variantClasses: Record<ToastType, string> = {
    success: 'bg-green-50 border border-green-200 text-green-900',
    error: 'bg-red-50 border border-red-200 text-red-900',
    info: 'bg-blue-50 border border-blue-200 text-blue-800',
  }

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-[10px] text-sm font-medium shadow-toast min-w-60 max-w-[400px] ${
        exiting ? 'animate-toast-out' : 'animate-toast-in'
      } ${variantClasses[toast.type]}`}
      role="status"
    >
      <span className="text-lg shrink-0 leading-none">
        {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ'}
      </span>
      <span className="flex-1">{toast.message}</span>
      <button
        className="bg-transparent border-none text-base text-inherit opacity-50 cursor-pointer px-0.5 leading-none hover:opacity-100"
        onClick={() => setExiting(true)}
        type="button"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
