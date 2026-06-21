import { logger }          from '../../lib/logger'
import { ollamaService }   from '../../services/OllamaService'
import { EmbeddingService } from './EmbeddingService'
import { SummaryStore }    from './SummaryStore'
import { cosineSimilarity } from './_math'
import type { ConversationSummary } from './types'

// Generate a rolling summary every N user+piku exchange pairs.
// Rolling means each new summary is generated with the previous summary as context,
// so understanding accumulates rather than restarting from scratch.
const SUMMARY_INTERVAL = 6

// Minimum similarity for a summary to be included in the prompt context.
// Lower than memory threshold (0.30) — summaries cover broad topics.
const SUMMARY_MIN_SIM  = 0.25

const SUMMARY_SYSTEM_PROMPT = `Summarize this conversation from Piku's perspective.
Capture: key topics discussed, decisions made, what was learned about the user, and any unresolved questions.
Write in third person about the user. Be concise — 3 to 5 sentences.
Do not use bullet points. Write as a short paragraph.`

export class ConversationSummaryService {
  private store      = new SummaryStore()
  private embeddings = new EmbeddingService()

  private exchanges:    Array<{ user: string; piku: string }> = []
  private lastSummary:  string | null = null
  private sessionStart: number = Date.now()

  // Call after every exchange. Triggers summary generation at SUMMARY_INTERVAL.
  async onExchange(userMessage: string, pikuResponse: string): Promise<void> {
    this.exchanges.push({ user: userMessage, piku: pikuResponse })
    logger.memory('summary: exchange tracked', { total: this.exchanges.length })

    if (this.exchanges.length % SUMMARY_INTERVAL === 0) {
      await this.generateAndStore()
    }
  }

  // Returns formatted summary context for the system prompt, or '' if nothing relevant.
  async getContext(query: string): Promise<string> {
    const all = await this.store.getAll()
    if (all.length === 0) return ''

    let queryVec: Float32Array
    try {
      queryVec = await this.embeddings.embed(query)
    } catch (err) {
      logger.error('summary getContext embed failed', { error: String(err) })
      return ''
    }

    const best = all
      .map(s => ({ s, sim: cosineSimilarity(queryVec, s.embedding) }))
      .filter(r => r.sim >= SUMMARY_MIN_SIM)
      .sort((a, b) => b.sim - a.sim)[0]

    if (!best) {
      logger.memory('summary: no relevant summary found', { total: all.length })
      return ''
    }

    logger.memory('summary: context found', {
      similarity: Number(best.sim.toFixed(3)),
      chars:      best.s.summary.length,
    })
    return `From our previous conversations:\n${best.s.summary}`
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async generateAndStore(): Promise<void> {
    logger.memory('summary: generating rolling summary', {
      exchanges: this.exchanges.length,
      hasPrevious: this.lastSummary !== null,
    })

    const summary = await this.summarize()
    if (!summary) {
      logger.warn('summary: generation returned empty — skipping store')
      return
    }

    let embedding: Float32Array
    try {
      embedding = await this.embeddings.embed(summary)
    } catch (err) {
      logger.error('summary: embed failed — skipping store', { error: String(err) })
      return
    }

    const record: ConversationSummary = {
      id:               crypto.randomUUID(),
      summary,
      embedding,
      messageCount:     this.exchanges.length * 2,
      sessionStartedAt: this.sessionStart,
      createdAt:        Date.now(),
    }

    await this.store.save(record)
    this.lastSummary = summary

    logger.memory('summary: stored', {
      id:           record.id,
      messageCount: record.messageCount,
      chars:        summary.length,
    })
  }

  private async summarize(): Promise<string | null> {
    // Build prompt from the most recent SUMMARY_INTERVAL exchanges
    const recent = this.exchanges
      .slice(-SUMMARY_INTERVAL)
      .map(e => `User: ${e.user}\nPiku: ${e.piku}`)
      .join('\n\n')

    const userContent = this.lastSummary
      ? `Previous summary:\n${this.lastSummary}\n\nNew exchanges:\n${recent}`
      : recent

    try {
      const result = await ollamaService.chat(
        [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user',   content: userContent           },
        ],
        0.3,
      )
      return result.trim() || null
    } catch (err) {
      logger.error('summary: LLM call failed', { error: String(err) })
      return null
    }
  }
}
