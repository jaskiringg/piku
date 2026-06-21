import { logger }              from '../../lib/logger'
import type {
  Memory, MemoryCategory, MemoryStatus, MemoryStats, ExtractionCandidate,
} from './types'
import { MemoryStore }             from './MemoryStore'
import { EmbeddingService }        from './EmbeddingService'
import { MemoryExtractionService } from './MemoryExtractionService'
import { MemoryRetrievalService }  from './MemoryRetrievalService'
import { cosineSimilarity }        from './_math'

const DUPLICATE_THRESHOLD = 0.92

// confidence >= this threshold → confirmed (used in retrieval)
// confidence <  this threshold → pending   (stored but excluded from retrieval)
const CONFIRMED_THRESHOLD = 0.9

const CATEGORY_IMPORTANCE: Record<MemoryCategory, number> = {
  user_correction:   0.95,
  important_date:    0.90,
  long_term_goal:    0.85,
  career:            0.80,
  ongoing_project:   0.80,
  skill:             0.75,
  relationship:      0.75,
  achievement:       0.70,
  recurring_habit:   0.70,
  health_preference: 0.70,
  personal_fact:     0.65,
  preference:        0.60,
  location:          0.55,
}

export class MemoryService {
  private store      = new MemoryStore()
  private embeddings = new EmbeddingService()
  private extractor  = new MemoryExtractionService()
  private retrieval  = new MemoryRetrievalService(this.store, this.embeddings)

  // Returns formatted context string (confirmed memories only), or '' on any failure.
  async retrieveForPrompt(userMessage: string): Promise<string> {
    try {
      const results = await this.retrieval.search(userMessage)
      const context = this.retrieval.buildContext(results)
      if (context) logger.memory('context built', { memories: results.length })
      return context
    } catch (err) {
      logger.warn('retrieveForPrompt failed — proceeding without context', { error: String(err) })
      return ''
    }
  }

  // Run after every Piku response. Never throws.
  async processConversationTurn(userMessage: string, pikuResponse: string): Promise<void> {
    try {
      const candidates = await this.extractor.extract(userMessage, pikuResponse)
      await Promise.all(candidates.map(c => this.saveCandidate(c)))
    } catch (err) {
      logger.error('processConversationTurn failed', { error: String(err) })
    }
  }

  async addManual(
    content: string,
    category: MemoryCategory,
    importance = CATEGORY_IMPORTANCE[category],
  ): Promise<Memory> {
    const embedding = await this.embeddings.embed(content)
    const now       = Date.now()
    const memory: Memory = {
      id: crypto.randomUUID(),
      category,
      status:        'confirmed',  // manual additions are always confirmed
      content,
      embedding,
      confidence:    1.0,
      importance,
      accessCount:   0,
      lastAccessedAt: now,
      createdAt:     now,
      updatedAt:     now,
      source:        'manual',
      tags:          [],
    }
    await this.store.save(memory)
    logger.memory('manual memory saved', { category, status: 'confirmed', content: content.slice(0, 60) })
    return memory
  }

  async delete(id: string): Promise<void> {
    await this.store.delete(id)
    logger.memory('memory deleted', { id })
  }

  async getAll(): Promise<Memory[]> {
    return this.store.getAll()
  }

  async stats(): Promise<MemoryStats> {
    return this.store.stats()
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async saveCandidate(candidate: ExtractionCandidate): Promise<void> {
    // Discard below the storage floor — not even worth embedding
    if (candidate.confidence < 0.5) {
      logger.memory('candidate discarded — below storage threshold', {
        confidence: candidate.confidence,
        content:    candidate.content.slice(0, 60),
      })
      return
    }

    const status: MemoryStatus = candidate.confidence >= CONFIRMED_THRESHOLD
      ? 'confirmed'
      : 'pending'

    let embedding: Float32Array
    try {
      embedding = await this.embeddings.embed(candidate.content)
    } catch (err) {
      logger.error('candidate embed failed — skipping', { error: String(err) })
      return
    }

    const duplicate = await this.findDuplicate(embedding, candidate.category)
    const now       = Date.now()

    if (duplicate) {
      // Promote to confirmed if the new confidence qualifies
      const newStatus: MemoryStatus =
        candidate.confidence >= CONFIRMED_THRESHOLD ? 'confirmed' : duplicate.status

      logger.memory('duplicate found — updating', {
        id:         duplicate.id,
        oldStatus:  duplicate.status,
        newStatus,
        old:        duplicate.content.slice(0, 60),
        new:        candidate.content.slice(0, 60),
      })
      await this.store.save({
        ...duplicate,
        content:    candidate.content,
        embedding,
        status:     newStatus,
        confidence: Math.max(duplicate.confidence, candidate.confidence),
        updatedAt:  now,
      })
    } else {
      const memory: Memory = {
        id:            crypto.randomUUID(),
        category:      candidate.category,
        status,
        content:       candidate.content,
        embedding,
        confidence:    candidate.confidence,
        importance:    CATEGORY_IMPORTANCE[candidate.category],
        accessCount:   0,
        lastAccessedAt: now,
        createdAt:     now,
        updatedAt:     now,
        source:        'extracted',
        tags:          candidate.tags,
      }
      await this.store.save(memory)
      logger.memory('memory saved', {
        id:         memory.id,
        category:   candidate.category,
        status,
        content:    candidate.content.slice(0, 60),
        confidence: candidate.confidence,
      })
    }
  }

  private async findDuplicate(
    embedding: Float32Array,
    category: MemoryCategory,
  ): Promise<Memory | null> {
    const existing = await this.store.getByCategory(category)
    for (const mem of existing) {
      const sim = cosineSimilarity(embedding, mem.embedding)
      if (sim >= DUPLICATE_THRESHOLD) return mem
    }
    return null
  }
}
