import { logger } from '../lib/logger'

const OLLAMA_BASE    = 'http://localhost:11434'
const CHAT_MODEL     = 'qwen3:4b'   // 4B fits a 16GB M4 comfortably + keeps thinking mode.
                                    // Model names live ONLY here (P1) — swap freely.
const EMBED_MODEL    = 'nomic-embed-text'
const CHAT_TIMEOUT       = 240_000  // 4 min — qwen3 reasoning can be lengthy on a busy machine
const EXTRACTION_TIMEOUT = 300_000  // 5 min — for document/conversation extraction (background)
const EMBED_TIMEOUT      =  15_000
const NUM_CTX            = 8192     // cap context per request → smaller KV cache, snappy on 16GB
                                    // (Piku is retrieval-augmented, so it never needs a huge window)
const CHAT_NUM_PREDICT   = 2048     // runaway guard for interactive replies (thinking + answer)
const EXTRACT_NUM_PREDICT = 1024    // background extraction: short JSON only → keep it cheap & fast

// Shown in the overlay status strip. The ProviderRegistry (Sprint 2.5-P) will make
// this dynamic — local Ollama vs. a Claude-CLI escalation.
export const ACTIVE_BRAIN = { model: CHAT_MODEL, where: 'local' as const }

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

class OllamaService {
  // ── Chat ──────────────────────────────────────────────────────────────────

  async chat(
    messages:    OllamaChatMessage[],
    temperature = 0.7,
    timeoutMs   = CHAT_TIMEOUT,
    think       = false,   // extraction/summary callers don't need visible reasoning → far faster
  ): Promise<string> {
    logger.ollama('chat request', { model: CHAT_MODEL, turns: messages.length, temperature, timeoutMs })

    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      logger.error('chat timeout', { model: CHAT_MODEL, ms: timeoutMs })
    }, timeoutMs)

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({
          model:   CHAT_MODEL,
          stream:  false,
          think,
          messages,
          options: { temperature, num_ctx: NUM_CTX, num_predict: EXTRACT_NUM_PREDICT },
        }),
      })

      if (!res.ok) {
        throw new Error(`Ollama chat error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json() as { message?: { content?: string } }
      const raw  = data.message?.content ?? ''
      const text = stripThinkingTokens(raw)

      logger.ollama('chat response', { chars: text.length, hadThinking: raw.length !== text.length })
      return text

    } catch (err) {
      logger.error('chat failed', { error: String(err) })
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Streaming Chat ────────────────────────────────────────────────────────

  async chatStream(
    messages:    OllamaChatMessage[],
    onChunk:     (text: string) => void,
    onThinking?: (text: string) => void,
    temperature = 0.7,
    timeoutMs   = CHAT_TIMEOUT,
    think       = true,    // interactive chat: show Piku's reasoning live
  ): Promise<{ response: string; thinking: string; latencyMs: number }> {
    const start = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      logger.error('chat stream timeout', { model: CHAT_MODEL, ms: timeoutMs })
    }, timeoutMs)

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({
          model:   CHAT_MODEL,
          stream:  true,
          think,
          messages,
          options: { temperature, num_ctx: NUM_CTX, num_predict: CHAT_NUM_PREDICT },
        }),
      })

      if (!res.ok)   throw new Error(`Ollama chat error: ${res.status} ${res.statusText}`)
      if (!res.body) throw new Error('Response body is null')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let answer   = ''
      let thinking = ''

      // qwen3 via Ollama streams reasoning in a separate `thinking` field and the
      // final answer in `content`. Each chunk carries the new delta for either.
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.trim())
        for (const line of lines) {
          try {
            const msg = (JSON.parse(line) as { message?: { content?: string; thinking?: string } }).message
            if (!msg) continue
            if (msg.thinking) { thinking += msg.thinking; onThinking?.(msg.thinking) }
            if (msg.content)  { answer   += msg.content;  onChunk(msg.content) }
          } catch { /* malformed NDJSON line — skip */ }
        }
      }

      const latencyMs = Date.now() - start
      logger.ollama('chat stream complete', { chars: answer.length, thinkingChars: thinking.length, latencyMs })
      return { response: answer.trim(), thinking: thinking.trim(), latencyMs }

    } catch (err) {
      logger.error('chat stream failed', { error: String(err) })
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Embeddings ────────────────────────────────────────────────────────────

  async embed(text: string): Promise<number[]> {
    logger.embedding('embed request', { model: EMBED_MODEL, chars: text.length })

    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      logger.error('embed timeout', { model: EMBED_MODEL, ms: EMBED_TIMEOUT })
    }, EMBED_TIMEOUT)

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      })

      if (!res.ok) {
        throw new Error(`Ollama embed error: ${res.status} ${res.statusText}`)
      }

      const data = await res.json() as { embeddings?: number[][] }
      const vec  = data.embeddings?.[0]

      if (!vec || vec.length === 0) {
        throw new Error('Ollama returned empty embedding vector')
      }

      logger.embedding('embed response', { dims: vec.length })
      return vec

    } catch (err) {
      logger.error('embed failed', { error: String(err) })
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async isReachable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

// Singleton — one HTTP client for the entire app lifetime
export const ollamaService = new OllamaService()

// Extraction tasks (document or conversation) run in the background and tolerate
// longer waits. Import this constant instead of hardcoding 300_000.
export { EXTRACTION_TIMEOUT }

// ── Helpers ───────────────────────────────────────────────────────────────

// qwen3 outputs <think>…</think> blocks before its actual response.
// Strip them so users never see raw reasoning tokens.
function stripThinkingTokens(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

