import { logger }                  from '../../lib/logger'
import { EmbeddingService }         from '../memory/EmbeddingService'
import { QueryParser }              from './QueryParser'
import { ProjectSource }            from './sources/ProjectSource'
import { MemorySource }             from './sources/MemorySource'
import { GraphSource }              from './sources/GraphSource'
import { formatWorldModelResult }   from './WorldModelFormatter'
import type {
  ContextSource,
  ContextFragment,
  ParsedQuery,
  WorldModelResult,
  ProjectResult,
  DecisionResult,
  MemoryResult,
  GraphNodeResult,
  GraphEdgeResult,
  ContextVersionResult,
} from './types'

export class WorldModelQueryService {
  private readonly parser     = new QueryParser()
  private readonly embeddings = new EmbeddingService()
  private readonly sources    = new Map<string, ContextSource>()

  constructor() {
    // Default sources registered at construction.
    // Additional sources (e.g. GitSource, IDESource) call register() at startup.
    this.register(new ProjectSource())
    this.register(new MemorySource())
    this.register(new GraphSource())
  }

  // ── Source registry ───────────────────────────────────────────────────────

  register(source: ContextSource): void {
    this.sources.set(source.id, source)
    logger.info(`WorldModel: registered source '${source.id}'`)
  }

  unregister(sourceId: string): void {
    this.sources.delete(sourceId)
  }

  // ── Primary API ───────────────────────────────────────────────────────────

  /**
   * Full structured query — returns WorldModelResult.
   * Use this when you need to inspect or filter the result programmatically.
   */
  async query(question: string): Promise<WorldModelResult> {
    const start       = performance.now()
    const parsedQuery = this.parser.parse(question)

    // Generate query embedding once — sources reuse it rather than each calling Ollama
    try {
      parsedQuery.embedding = await this.embeddings.embed(question)
    } catch {
      // Non-fatal: keyword + graph retrieval still works without embedding
      logger.warn('WorldModel: embedding failed — using keyword retrieval only')
    }

    // All sources run in parallel; individual failures are isolated
    const sourceEntries = [...this.sources.entries()]
    const settled       = await Promise.allSettled(
      sourceEntries.map(([, source]) => source.retrieve(parsedQuery))
    )

    const allFragments:         ContextFragment[] = []
    const contributingSources:  string[]          = []

    settled.forEach((result, i) => {
      const sourceId = sourceEntries[i][0]
      if (result.status === 'fulfilled') {
        if (result.value.length > 0) {
          allFragments.push(...result.value)
          contributingSources.push(sourceId)
        }
      } else {
        logger.warn(`WorldModel: source '${sourceId}' failed`, {
          error: String(result.reason),
        })
      }
    })

    const worldModelResult = this.buildResult(allFragments, parsedQuery, contributingSources)

    logger.info('WorldModel: query complete', {
      ms:         Math.round(performance.now() - start),
      fragments:  allFragments.length,
      sources:    contributingSources,
      confidence: Number(worldModelResult.confidence.toFixed(2)),
      projects:   worldModelResult.projects.length,
      decisions:  worldModelResult.decisions.length,
      memories:   worldModelResult.memories.length,
      entities:   worldModelResult.entities.length,
    })

    return worldModelResult
  }

  /**
   * Formatted string query — convenience method for the chat pipeline.
   * Returns a ready-to-inject context string (or '' if nothing found).
   */
  async queryForContext(question: string): Promise<string> {
    const result = await this.query(question)
    return formatWorldModelResult(result)
  }

  // ── Result assembly ───────────────────────────────────────────────────────

  private buildResult(
    fragments:  ContextFragment[],
    query:      ParsedQuery,
    sources:    string[],
  ): WorldModelResult {
    const projects:      ProjectResult[]        = []
    const decisions:     DecisionResult[]       = []
    const blockers:      string[]               = []
    const currentWork:   string[]               = []
    const entities:      GraphNodeResult[]      = []
    const relationships: GraphEdgeResult[]      = []
    const memories:      MemoryResult[]         = []
    const recentChanges: ContextVersionResult[] = []

    // Deduplicate by entityId+type so two sources cannot double-report the same entity
    const seen = new Set<string>()

    for (const f of fragments) {
      const dedupeKey = `${f.type}:${f.entityId ?? f.content.slice(0, 60)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      switch (f.type) {
        case 'project':
          projects.push({
            id:           f.entityId ?? '',
            name:         String(f.metadata?.projectName ?? ''),
            vision:       String(f.metadata?.vision      ?? f.content),
            currentState: String(f.metadata?.currentState ?? ''),
            relevance:    f.relevance,
          })
          break

        case 'decision':
          decisions.push({
            id:          f.entityId ?? '',
            projectId:   String(f.metadata?.projectId   ?? ''),
            projectName: String(f.metadata?.projectName ?? ''),
            title:       String(f.metadata?.title       ?? f.content),
            reasoning:   String(f.metadata?.reasoning   ?? ''),
            createdAt:   Number(f.metadata?.createdAt   ?? 0),
            relevance:   f.relevance,
          })
          break

        case 'blocker':
          blockers.push(f.content)
          break

        case 'work_item':
          currentWork.push(f.content)
          break

        case 'graph_node':
          entities.push({
            id:       f.entityId ?? '',
            type:     String(f.metadata?.nodeType ?? ''),
            name:     String(f.metadata?.name     ?? f.content),
            relevance: f.relevance,
          })
          break

        case 'graph_edge':
          relationships.push({
            id:           f.entityId ?? '',
            fromName:     String(f.metadata?.fromName     ?? ''),
            toName:       String(f.metadata?.toName       ?? ''),
            relationship: String(f.metadata?.relationship ?? ''),
            relevance:    f.relevance,
          })
          break

        case 'memory':
          memories.push({
            id:        f.entityId ?? '',
            content:   f.content,
            category:  String(f.metadata?.category ?? ''),
            relevance: f.relevance,
            createdAt: Number(f.metadata?.createdAt ?? 0),
          })
          break

        case 'context_version':
          recentChanges.push({
            id:          f.entityId ?? '',
            projectId:   String(f.metadata?.projectId   ?? ''),
            projectName: String(f.metadata?.projectName ?? ''),
            version:     Number(f.metadata?.version     ?? 0),
            summary:     f.content,
            diff:        String(f.metadata?.diff        ?? ''),
            createdAt:   Number(f.metadata?.createdAt   ?? 0),
          })
          break
      }
    }

    // Sort by relevance (descending) within each category
    projects.sort((a, b)      => b.relevance - a.relevance)
    decisions.sort((a, b)     => b.relevance - a.relevance)
    memories.sort((a, b)      => b.relevance - a.relevance)
    entities.sort((a, b)      => b.relevance - a.relevance)
    relationships.sort((a, b) => b.relevance - a.relevance)
    recentChanges.sort((a, b) => b.createdAt - a.createdAt)

    const isEmpty = (
      projects.length + decisions.length + memories.length +
      entities.length + recentChanges.length === 0
    )

    return {
      projects,
      decisions,
      blockers,
      currentWork,
      entities,
      relationships,
      memories,
      recentChanges,
      confidence:  this.computeConfidence(fragments),
      queryTerms:  query.normalizedTerms,
      sources,
      isEmpty,
    }
  }

  // Confidence = mean relevance × coverage bonus (more fragments = more confident)
  private computeConfidence(fragments: ContextFragment[]): number {
    if (fragments.length === 0) return 0
    const meanRelevance = fragments.reduce((s, f) => s + f.relevance, 0) / fragments.length
    const coverage      = Math.min(fragments.length / 8, 1)   // saturates at 8 fragments
    return Math.min(meanRelevance * 0.7 + coverage * 0.3, 1)
  }
}
