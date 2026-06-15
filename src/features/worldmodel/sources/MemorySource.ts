import { MemoryStore }      from '../../memory/MemoryStore'
import { EmbeddingService } from '../../memory/EmbeddingService'
import { cosineSimilarity } from '../../memory/_math'
import type { ContextSource, ContextFragment, ParsedQuery } from '../types'
import type { Memory } from '../../memory/types'

const MIN_SEMANTIC_SCORE  = 0.45   // only confirmed memories above this threshold
const MIN_KEYWORD_MATCHES = 1      // at least one term must appear in content
const KEYWORD_BASE_SCORE  = 0.55   // floor score for a keyword-only match
const MAX_MEMORIES        = 6

// Scoring weights — match MemoryRetrievalService composite scoring
const W_SIMILARITY = 0.65
const W_RECENCY    = 0.20
const W_IMPORTANCE = 0.10
const W_ACCESS     = 0.05

export class MemorySource implements ContextSource {
  readonly id = 'memory_source'

  private readonly store      = new MemoryStore()
  private readonly embeddings = new EmbeddingService()

  async retrieve(query: ParsedQuery): Promise<ContextFragment[]> {
    const confirmed = await this.store.getAllConfirmed()
    if (confirmed.length === 0) return []

    // If no embedding yet, try to generate one (WorldModelQueryService may have already set it)
    let queryVec: Float32Array | null = query.embedding ?? null
    if (!queryVec) {
      try {
        queryVec = await this.embeddings.embed(query.raw)
      } catch {
        // Fall through to keyword-only retrieval
      }
    }

    const scored: Array<{ memory: Memory; score: number }> = []

    for (const memory of confirmed) {
      let score = 0

      // ── Semantic score ─────────────────────────────────────────────────
      if (queryVec && memory.embedding) {
        const sim = cosineSimilarity(queryVec, memory.embedding)
        if (sim >= MIN_SEMANTIC_SCORE) {
          score = Math.max(score, this.compositeScore(sim, memory))
        }
      }

      // ── Keyword score ──────────────────────────────────────────────────
      if (query.normalizedTerms.length > 0) {
        const lower   = memory.content.toLowerCase()
        const matched = query.normalizedTerms.filter(t => lower.includes(t)).length
        if (matched >= MIN_KEYWORD_MATCHES) {
          const kwScore = KEYWORD_BASE_SCORE +
            (matched / query.normalizedTerms.length) * (1 - KEYWORD_BASE_SCORE)
          score = Math.max(score, kwScore)
        }
      }

      if (score > 0) scored.push({ memory, score })
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MEMORIES)
      .map(({ memory, score }) => ({
        sourceId:  this.id,
        type:      'memory' as const,
        content:   memory.content,
        relevance: score,
        entityId:  memory.id,
        metadata: {
          category:  memory.category,
          createdAt: memory.createdAt,
        },
      }))
  }

  // Mirror the composite scoring from MemoryRetrievalService for consistency
  private compositeScore(similarity: number, memory: Memory): number {
    const days        = (Date.now() - memory.createdAt) / 86_400_000
    const recency     = Math.exp(-days * 0.03)
    const accessScore = Math.min(1, Math.log1p(memory.accessCount) / Math.log(50))

    return (
      similarity        * W_SIMILARITY +
      recency           * W_RECENCY    +
      memory.importance * W_IMPORTANCE +
      accessScore       * W_ACCESS
    )
  }
}
