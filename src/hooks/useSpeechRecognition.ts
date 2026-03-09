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
  /** Error message if recognition failed */
  error: string | null
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
  const [error, setError] = useState<string | null>(null)
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

  const start = useCallback(async () => {
    const SR = getSpeechRecognition()
    if (!SR) return

    // Pre-check: request mic access via getUserMedia first.
    // This is required in some browsers/contexts to "unlock" the mic
    // before SpeechRecognition can use it.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Release the stream immediately — we just needed the permission grant
      stream.getTracks().forEach(t => t.stop())
    } catch (err) {
      const mediaErr = err as DOMException

      // Enumerate devices for diagnostics
      let deviceInfo = ''
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(d => d.kind === 'audioinput')
        deviceInfo = audioInputs.length === 0
          ? ' Browser sees 0 audio input devices.'
          : ` Browser sees ${audioInputs.length} input(s): ${audioInputs.map(d => d.label || 'unlabeled').join(', ')}.`
      } catch { /* ignore */ }

      if (mediaErr.name === 'NotAllowedError') {
        setError('Microphone permission denied. Click the lock/site-settings icon in the address bar → allow microphone.')
      } else if (mediaErr.name === 'NotFoundError') {
        setError(`No audio input device found.${deviceInfo} Check Windows Settings → Sound → Input and ensure your mic is selected. Also try using http://localhost instead of 127.0.0.1.`)
      } else {
        setError(`Microphone access failed (${mediaErr.name}): ${mediaErr.message}.${deviceInfo}`)
      }
      console.warn('[SpeechRecognition] getUserMedia failed:', mediaErr.name, mediaErr.message, deviceInfo)
      setListening(false)
      return
    }

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
    setError(null)

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
      const ERROR_MESSAGES: Record<string, string> = {
        'not-allowed': 'Microphone permission denied. Check browser settings.',
        'no-speech': 'No speech detected. Try speaking louder.',
        'audio-capture': 'No microphone found. Check your audio input device.',
        'network': 'Network error. Speech recognition requires an internet connection.',
        'service-not-allowed': 'Speech service not available in this browser.',
      }

      const msg = ERROR_MESSAGES[event.error] || `Speech error: ${event.error}`
      console.warn('[SpeechRecognition] error:', event.error, event.message)

      if (event.error !== 'aborted') {
        setError(msg)
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

  return { supported, listening, transcript, error, start, stop, cancel }
}
