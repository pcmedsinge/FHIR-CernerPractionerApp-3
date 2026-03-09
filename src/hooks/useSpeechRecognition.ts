/**
 * useSpeechRecognition — browser-native voice input hook.
 *
 * Uses the Web Speech API (Chrome/Edge) for real-time speech-to-text.
 * Zero cost, zero dependencies, real-time transcript streaming.
 *
 * Returns:
 * - listening: boolean — mic is active
 * - transcript: string — current interim + final text
 * - supported: boolean — browser supports Web Speech API
 * - start(): begin listening
 * - stop(): stop listening and return final text
 * - cancel(): abort without returning text
 */

import { useState, useCallback, useRef, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Web Speech API type declarations (not in default TS lib)
// ---------------------------------------------------------------------------

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseSpeechRecognitionResult {
  /** Whether the browser supports speech recognition */
  supported: boolean
  /** Whether the mic is currently active */
  listening: boolean
  /** Current transcript (interim + final combined) */
  transcript: string
  /** Start listening */
  start: () => void
  /** Stop and finalize — returns the final transcript */
  stop: () => string
  /** Abort without keeping text */
  cancel: () => void
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalTranscriptRef = useRef('')
  const supported = typeof window !== 'undefined' && getSpeechRecognition() !== null

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch { /* ignore */ }
        recognitionRef.current = null
      }
    }
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) return

    // Stop any existing session
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    finalTranscriptRef.current = ''
    setTranscript('')

    recognition.onstart = () => {
      setListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      finalTranscriptRef.current = final
      setTranscript(final + interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are expected — don't treat as failures
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[SpeechRecognition] error:', event.error)
      }
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (err) {
      console.warn('[SpeechRecognition] start failed:', err)
      setListening(false)
    }
  }, [])

  const stop = useCallback((): string => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }
    setListening(false)
    const result = transcript || finalTranscriptRef.current
    return result.trim()
  }, [transcript])

  const cancel = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
    }
    setListening(false)
    setTranscript('')
    finalTranscriptRef.current = ''
  }, [])

  return { supported, listening, transcript, start, stop, cancel }
}
