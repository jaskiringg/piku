// Orchestrates the GDD seeding pipeline:
// DocumentChunker → EntityExtractor → GraphService (createNode + createEdge)
//
// Deduplication is handled by GraphService.createNode() (exact name+type match)
// and GraphService.createEdge() (exact fromId+toId+relationship match).
// This service is responsible only for resolving name→id and wiring the pipeline.

import { logger }           from '../../lib/logger'
import { DocumentChunker }  from './DocumentChunker'
import { EntityExtractor }  from './EntityExtractor'
import { GraphService }     from './GraphService'
import type { GraphNodeType } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeedingResult {
  sourceDoc:    string
  strategy:     'adr' | 'section'
  chunks:       number
  nodesCreated: number     // new nodes (not already in graph)
  nodesSkipped: number     // already existed by name+type
  edgesCreated: number
  edgesSkipped: number     // already existed or names couldn't be resolved
  durationMs:   number
  nodesByType:  Record<string, number>
}

// ── DocumentSeeder ────────────────────────────────────────────────────────────

export class DocumentSeeder {
  private chunker   = new DocumentChunker()
  private extractor = new EntityExtractor()
  private graph     = new GraphService()

  // Seed a document into the knowledge graph.
  // strategy: 'adr' for 05_DECISIONS.md format, 'section' for generic markdown.
  // projectName: used as context for the LLM extraction prompt.
  // maxConcurrent: max parallel LLM extraction calls per batch.
  async seedFromFile(
    content:       string,
    sourceDoc:     string,
    projectName:   string,
    strategy:      'adr' | 'section' = 'adr',
    maxConcurrent: number = 3,
  ): Promise<SeedingResult> {
    const start = Date.now()
    logger.project('gdd: seeding start', { sourceDoc, strategy, chars: content.length })

    // ── 1. Chunk ──────────────────────────────────────────────────────────────
    const adrChunks     = strategy === 'adr'     ? this.chunker.byADR(content, sourceDoc)     : []
    const sectionChunks = strategy === 'section' ? this.chunker.bySection(content, sourceDoc) : []
    const chunkCount    = adrChunks.length + sectionChunks.length

    logger.project('gdd: chunks prepared', {
      adr:     adrChunks.length,
      section: sectionChunks.length,
    })

    // ── 2. Extract ────────────────────────────────────────────────────────────
    const extraction = strategy === 'adr'
      ? await this.extractor.extractFromADRs(adrChunks, projectName, maxConcurrent)
      : await this.extractSections(sectionChunks, projectName, maxConcurrent)

    logger.project('gdd: extraction complete', {
      entities: extraction.entities.length,
      edges:    extraction.edges.length,
    })

    // ── 3. Create nodes ───────────────────────────────────────────────────────
    // Build a name→id map so edges can be resolved.
    // GraphService.createNode() is idempotent — returns existing node if name+type matches.
    const nameTypeToId = new Map<string, string>()  // "type:name" → nodeId
    let nodesCreated = 0
    let nodesSkipped = 0
    const nodesByType: Record<string, number> = {}

    for (const entity of extraction.entities) {
      try {
        const node = await this.graph.createNode(
          entity.type,
          entity.name,
          { ...entity.attrs, sourceDoc },
        )
        const key = nodeKey(entity.type, entity.name)
        nameTypeToId.set(key, node.id)

        // Track counts
        nodesByType[entity.type] = (nodesByType[entity.type] ?? 0) + 1
      } catch (err) {
        logger.warn('gdd: node creation failed — skipping', {
          name:  entity.name,
          type:  entity.type,
          error: String(err),
        })
      }
    }

    // Determine new vs existing by checking which nodes are in the graph
    // GraphService.createNode() logs 'node already exists' vs 'node created'
    // We count here based on entity list since createNode() is idempotent.
    // Rough heuristic: assume all unique name+type combos are "created"; duplicates
    // within the extraction result itself are skipped.
    const seenKeys = new Set<string>()
    for (const entity of extraction.entities) {
      const key = nodeKey(entity.type, entity.name)
      if (seenKeys.has(key)) {
        nodesSkipped++
      } else {
        seenKeys.add(key)
        nodesCreated++
      }
    }

    // ── 4. Create edges ───────────────────────────────────────────────────────
    let edgesCreated = 0
    let edgesSkipped = 0

    for (const edge of extraction.edges) {
      // Resolve names to IDs — try all node types for each name
      const fromId = this.resolveId(edge.fromName, nameTypeToId)
      const toId   = this.resolveId(edge.toName,   nameTypeToId)

      if (!fromId || !toId) {
        logger.warn('gdd: edge skipped — unresolved name', {
          fromName: edge.fromName,
          toName:   edge.toName,
          rel:      edge.relationship,
        })
        edgesSkipped++
        continue
      }

      if (fromId === toId) {
        edgesSkipped++
        continue
      }

      try {
        const status = edge.confidence >= 0.85 ? 'confirmed' : 'pending'
        await this.graph.createEdge(fromId, toId, edge.relationship, edge.confidence, status)
        edgesCreated++
      } catch (err) {
        logger.warn('gdd: edge creation failed — skipping', {
          fromName: edge.fromName,
          toName:   edge.toName,
          error:    String(err),
        })
        edgesSkipped++
      }
    }

    const durationMs = Date.now() - start

    logger.project('gdd: seeding complete', {
      sourceDoc,
      chunks:       chunkCount,
      nodesCreated,
      nodesSkipped,
      edgesCreated,
      edgesSkipped,
      durationMs,
    })

    return {
      sourceDoc,
      strategy,
      chunks:       chunkCount,
      nodesCreated,
      nodesSkipped,
      edgesCreated,
      edgesSkipped,
      durationMs,
      nodesByType,
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async extractSections(
    chunks:        ReturnType<DocumentChunker['bySection']>,
    projectName:   string,
    maxConcurrent: number,
  ): Promise<{ entities: import('./EntityExtractor').ExtractedEntity[]; edges: import('./EntityExtractor').ExtractedEdge[] }> {
    const entities: import('./EntityExtractor').ExtractedEntity[] = []
    const edges:    import('./EntityExtractor').ExtractedEdge[]   = []

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const batch   = chunks.slice(i, i + maxConcurrent)
      const results = await Promise.all(
        batch.map(c => this.extractor.extractFromChunk(c, projectName))
      )
      for (const r of results) {
        entities.push(...r.entities)
        edges.push(...r.edges)
      }
    }

    return { entities, edges }
  }

  // Find a node ID by name, searching across all types stored for that name.
  // The LLM may refer to a node by name without specifying type in the edge —
  // this resolves the most likely match.
  private resolveId(name: string, nameTypeToId: Map<string, string>): string | undefined {
    // Try exact matches across all node types in priority order
    const typeOrder: GraphNodeType[] = [
      'project', 'decision', 'technology', 'goal', 'repository',
      'person', 'skill', 'memory',
    ]
    for (const type of typeOrder) {
      const id = nameTypeToId.get(nodeKey(type, name))
      if (id) return id
    }
    return undefined
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeKey(type: GraphNodeType, name: string): string {
  return `${type}:${name.toLowerCase().trim()}`
}
