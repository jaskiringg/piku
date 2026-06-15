import { GraphStore }       from '../../graph/GraphStore'
import { cosineSimilarity } from '../../memory/_math'
import type { ContextSource, ContextFragment, ParsedQuery } from '../types'
import type { GraphNode, GraphEdge } from '../../graph/types'

// ── Thresholds ─────────────────────────────────────────────────────────────

// Semantic: cosine similarity must clear this to contribute to scoring.
// Graph nodes have short names so similarity tends to be lower than long
// memory strings — use a slightly more permissive floor.
const MIN_SEMANTIC     = 0.35

// Keyword: minimum fraction of query terms that must appear.
const MIN_KEYWORD_FRAC = 0.2

// Connectivity bonus: log-scaled, caps at ~0.09 (10+ edges).
// Rewards well-connected nodes — they tend to be core domain concepts.
const CONN_SCALE       = 0.04

// Broad-query base score when no terms provided.
const BROAD_BASE       = 0.35

const MAX_NODES          = 8
const MAX_EDGES_PER_NODE = 4

// ── Scoring weights ────────────────────────────────────────────────────────
//
// When BOTH signals are present, semantic carries more weight — it captures
// the "authentication → OAuth/JWT/PKCE" relationship that keyword cannot.
// When only one signal fires, use it alone.

const W_SEMANTIC = 0.65
const W_KEYWORD  = 0.35

// ── Source ─────────────────────────────────────────────────────────────────

export class GraphSource implements ContextSource {
  readonly id = 'graph_source'

  private readonly store = new GraphStore()

  async retrieve(query: ParsedQuery): Promise<ContextFragment[]> {
    const [nodes, edges] = await Promise.all([
      this.store.getAllNodes(),
      this.store.getAllEdges(),
    ])

    if (nodes.length === 0) return []

    const nodeIndex  = new Map<string, GraphNode>(nodes.map(n => [n.id, n]))
    const edgeCounts = buildEdgeCounts(edges)

    // Score every node
    const scored: Array<{ node: GraphNode; score: number }> = []

    for (const node of nodes) {
      const score = this.scoreNode(node, query, edgeCounts.get(node.id) ?? 0)
      if (score > 0) scored.push({ node, score })
    }

    scored.sort((a, b) => b.score - a.score)
    const topNodes = scored.slice(0, MAX_NODES)

    const fragments: ContextFragment[] = []
    const emittedEdges = new Set<string>()

    for (const { node, score } of topNodes) {
      fragments.push({
        sourceId:  this.id,
        type:      'graph_node',
        content:   `[${node.type}] ${node.name}`,
        relevance: score,
        entityId:  node.id,
        metadata:  { nodeType: node.type, name: node.name },
      })

      // Edges for this node — confirmed or high-confidence pending
      const nodeEdges = edges
        .filter(e => e.fromId === node.id || e.toId === node.id)
        .filter(e => e.status === 'confirmed' || e.strength >= 0.65)
        .slice(0, MAX_EDGES_PER_NODE)

      for (const edge of nodeEdges) {
        if (emittedEdges.has(edge.id)) continue
        emittedEdges.add(edge.id)

        const from = nodeIndex.get(edge.fromId)
        const to   = nodeIndex.get(edge.toId)
        if (!from || !to) continue

        fragments.push({
          sourceId:  this.id,
          type:      'graph_edge',
          content:   `${from.name} ${edge.relationship} ${to.name}`,
          relevance: score * edge.strength,
          entityId:  edge.id,
          metadata: {
            fromName:     from.name,
            toName:       to.name,
            relationship: edge.relationship,
            strength:     edge.strength,
          },
        })
      }
    }

    return fragments
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private scoreNode(
    node:      GraphNode,
    query:     ParsedQuery,
    edgeCount: number,
  ): number {
    // ── Broad query: return all nodes at a base score
    if (query.normalizedTerms.length === 0) {
      return applyConnectivityBonus(BROAD_BASE, edgeCount)
    }

    // ── Keyword signal
    // Search node name + stringified metadata for query terms
    const searchText = `${node.type} ${node.name} ${JSON.stringify(node.metadata)}`.toLowerCase()
    const matchedCount  = query.normalizedTerms.filter(t => searchText.includes(t)).length
    const matchedFrac   = matchedCount / query.normalizedTerms.length
    const keywordScore  = matchedFrac >= MIN_KEYWORD_FRAC
      ? 0.4 + matchedFrac * 0.5   // range [0.4, 0.9]
      : 0

    // ── Semantic signal (only when both query and node have embeddings)
    let semanticScore = 0
    if (query.embedding && node.embedding) {
      const sim = cosineSimilarity(query.embedding, node.embedding)
      if (sim >= MIN_SEMANTIC) semanticScore = sim
    }

    // ── Hybrid blend
    let score: number
    if (keywordScore > 0 && semanticScore > 0) {
      // Both fired: semantic leads, keyword reinforces
      score = semanticScore * W_SEMANTIC + keywordScore * W_KEYWORD
    } else if (semanticScore > 0) {
      score = semanticScore
    } else if (keywordScore > 0) {
      score = keywordScore
    } else {
      return 0
    }

    return applyConnectivityBonus(score, edgeCount)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Build a map: nodeId → total edge count (both directions, all statuses).
// Computed once per retrieve() call and reused across all node scorings.
function buildEdgeCounts(edges: GraphEdge[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of edges) {
    counts.set(e.fromId, (counts.get(e.fromId) ?? 0) + 1)
    counts.set(e.toId,   (counts.get(e.toId)   ?? 0) + 1)
  }
  return counts
}

// A small bonus that rewards core concept nodes (many connections) without
// dominating the score. log1p(10) * 0.04 ≈ 0.095; log1p(1) * 0.04 ≈ 0.028.
function applyConnectivityBonus(score: number, edgeCount: number): number {
  if (edgeCount === 0) return score
  return Math.min(1, score + Math.log1p(edgeCount) * CONN_SCALE)
}
