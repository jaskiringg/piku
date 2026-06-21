import { logger }          from '../../lib/logger'
import type { Memory, MemorySearchResult } from './types'
import { MemoryStore }      from './MemoryStore'
import { EmbeddingService } from './EmbeddingService'
import { cosineSimilarity } from './_math'

const MIN_SCORE = 0.30
const DEFAULT_K = 5

export class MemoryRetrievalService {
  constructor(
    private store:      MemoryStore,
    private embeddings: EmbeddingService,
  ) {}

  async search(query: string, topK = DEFAULT_K): Promise<MemorySearchResult[]> {
    // Only confirmed memories enter the context window
    const confirmed = await this.store.getAllConfirmed()
    logger.memory('retrieval search', {
      query:     query.slice(0, 60),
      confirmed: confirmed.length,
      topK,
    })

    if (confirmed.length === 0) {
      logger.memory('retrieval: no confirmed memories — skipping embed')
      return []
    }

    let queryVec: Float32Array
    try {
      queryVec = await this.embeddings.embed(query)
    } catch (err) {
      logger.error('retrieval embed failed — returning no context', { error: String(err) })
      return []
    }

    const scored = confirmed
      .map(memory => {
        const similarity = cosineSimilarity(queryVec, memory.embedding)
        const score      = compositeScore(similarity, memory)
        return { memory, score, similarity }
      })
      .filter(r => r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    logger.memory('retrieval results', {
      returned:  scored.length,
      topScore:  scored[0] ? Number(scored[0].score.toFixed(3)) : null,
      topMemory: scored[0] ? scored[0].memory.content.slice(0, 60) : null,
    })

    void this.trackAccess(scored.map(r => r.memory))
    return scored
  }

  buildContext(results: MemorySearchResult[]): string {
    if (results.length === 0) return ''
    const lines = results.map(r => `- [${r.memory.category}] ${r.memory.content}`)
    return `Relevant things I remember about you:\n${lines.join('\n')}`
  }

  private async trackAccess(memories: Memory[]): Promise<void> {
    const now = Date.now()
    await Promise.all(
      memories.map(m =>
        this.store.save({ ...m, accessCount: m.accessCount + 1, lastAccessedAt: now })
      )
    )
  }
}

// ── Scoring ────────────────────────────────────────────────────────────────
//
// similarity (65%) — primary signal; old memories still surface if semantically strong
// recency    (20%) — exponential decay: 1.0 today → 0.41 at 30d → near-zero at 1yr
// importance (10%) — set by category at creation, highest for user_correction
// access     ( 5%) — log-compressed: 5 accesses → 0.57; 50 accesses → 1.0

function compositeScore(similarity: number, memory: Memory): number {
  const days        = (Date.now() - memory.createdAt) / 86_400_000
  const recency     = Math.exp(-days * 0.03)
  const accessScore = Math.min(1, Math.log1p(memory.accessCount) / Math.log(50))

  return (
    similarity        * 0.65 +
    recency           * 0.20 +
    memory.importance * 0.10 +
    accessScore       * 0.05
  )
}
