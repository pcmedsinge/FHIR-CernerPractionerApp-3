/**
 * OpenAI Platform client wrapper.
 *
 * Configuration from .env:
 *   VITE_OPENAI_API_KEY   — required
 *   VITE_OPENAI_MODEL     — e.g. "gpt-4o" (defaults to gpt-4o-mini)
 *   VITE_OPENAI_ORG_ID    — optional
 *
 * ⚠ SANDBOX ONLY: Client-side API key usage is allowed only for sandbox/prototype.
 * Production must migrate to a backend proxy before release.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIConfig {
  apiKey: string
  model: string
  orgId?: string
}

export interface OpenAIResponse {
  content: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function getOpenAIConfig(): OpenAIConfig | null {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
  if (!apiKey || apiKey === '<to-be-configured>' || apiKey.trim() === '') return null

  const rawModel = import.meta.env.VITE_OPENAI_MODEL as string | undefined
  const rawOrg = import.meta.env.VITE_OPENAI_ORG_ID as string | undefined

  return {
    apiKey,
    model: (rawModel && rawModel !== '<to-be-configured>' && rawModel.trim() !== '') ? rawModel : 'gpt-4o-mini',
    orgId: (rawOrg && rawOrg !== '<optional>' && rawOrg !== '<to-be-configured>' && rawOrg.trim() !== '') ? rawOrg : undefined,
  }
}

export function isAIConfigured(): boolean {
  return getOpenAIConfig() !== null
}

// ---------------------------------------------------------------------------
// Rate limiting — max 3 concurrent, exponential backoff on 429
// ---------------------------------------------------------------------------

let _activeRequests = 0
const MAX_CONCURRENT = 3

async function waitForSlot(): Promise<void> {
  while (_activeRequests >= MAX_CONCURRENT) {
    await new Promise(r => setTimeout(r, 200))
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to OpenAI.
 * Handles rate limiting, timeouts, and error handling.
 *
 * @returns Parsed response content and token usage.
 * @throws Error if config is missing, request fails, or response is invalid.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    responseFormat?: { type: 'json_object' }
  },
): Promise<OpenAIResponse> {
  const config = getOpenAIConfig()
  if (!config) throw new Error('OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env')

  await waitForSlot()
  _activeRequests++

  try {
    return await fetchWithRetry(config, messages, options)
  } finally {
    _activeRequests--
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  config: OpenAIConfig,
  messages: ChatMessage[],
  options?: {
    temperature?: number
    maxTokens?: number
    responseFormat?: { type: 'json_object' }
  },
  retries = 2,
): Promise<OpenAIResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  }
  if (config.orgId) headers['OpenAI-Organization'] = config.orgId

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options?.temperature ?? 0.3,
  }
  if (options?.maxTokens) body.max_tokens = options.maxTokens
  if (options?.responseFormat) body.response_format = options.responseFormat

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (res.status === 429 && retries > 0) {
      // Rate limited — wait and retry
      const wait = (3 - retries) * 2000 + 1000 // 1s, 3s backoff
      await new Promise(r => setTimeout(r, wait))
      return fetchWithRetry(config, messages, options, retries - 1)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`)
    }

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }

    const content = json.choices?.[0]?.message?.content ?? ''
    const usage = {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    }

    return { content, usage }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Streaming API — SSE-based streaming for real-time token delivery
// ---------------------------------------------------------------------------

/**
 * Send a streaming chat completion request to OpenAI.
 * Calls `onChunk` with each content delta as it arrives.
 * Returns the full assembled content + approximate usage when finished.
 */
export async function chatCompletionStream(
  messages: ChatMessage[],
  onChunk: (delta: string, accumulated: string) => void,
  options?: {
    temperature?: number
    maxTokens?: number
  },
): Promise<OpenAIResponse> {
  const config = getOpenAIConfig()
  if (!config) throw new Error('OpenAI API key not configured. Set VITE_OPENAI_API_KEY in .env')

  await waitForSlot()
  _activeRequests++

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    }
    if (config.orgId) headers['OpenAI-Organization'] = config.orgId

    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      stream: true,
    }
    if (options?.maxTokens) body.max_tokens = options.maxTokens

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000) // longer for streaming

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body for streaming')

      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6)) as {
              choices?: Array<{ delta?: { content?: string } }>
            }
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              accumulated += delta
              onChunk(delta, accumulated)
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }

      return {
        content: accumulated,
        usage: {
          // Streaming API doesn't return usage in chunks; estimate
          promptTokens: 0,
          completionTokens: Math.ceil(accumulated.length / 4),
          totalTokens: Math.ceil(accumulated.length / 4),
        },
      }
    } finally {
      clearTimeout(timer)
    }
  } finally {
    _activeRequests--
  }
}
