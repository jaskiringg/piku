import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GraphSource }                           from '../sources/GraphSource'
import type { ParsedQuery }                      from '../types'
import type { GraphNode, GraphEdge }             from '../../graph/types'

// ── Mock GraphStore ────────────────────────────────────────────────────────

// Typed as returning the correct promises so mockResolvedValue works
const mockGetAllNodes = vi.fn<() => Promise<GraphNode[]>>()
const mockGetAllEdges = vi.fn<() => Promise<GraphEdge[]>>()

vi.mock('../../graph/GraphStore', () => ({
  GraphStore: class {
    getAllNodes = mockGetAllNodes
    getAllEdges = mockGetAllEdges
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id:        overrides.id        ?? crypto.randomUUID(),
    type:      overrides.type      ?? 'project',
    name:      overrides.name      ?? 'Test Node',
    metadata:  overrides.metadata  ?? {},
    embedding: overrides.embedding,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function makeEdge(fromId: string, toId: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id:           crypto.randomUUID(),
    fromId,
    toId,
    relationship: 'related_to',
    strength:     0.85,
    status:       'confirmed',
    createdAt:    Date.now(),
    ...overrides,
  }
}

// Build a Float32Array filled with a constant value — cheap stand-in for a
// real embedding.  Two vectors with the same value have cosine similarity 1.0.
function constVec(value: number, dims = 768): Float32Array {
  return new Float32Array(dims).fill(value)
}

// A vector orthogonal to constVec(x) — cosine similarity 0 with any constVec.
function orthogonalVec(dims = 768): Float32Array {
  const v = new Float32Array(dims)
  // Alternating +1/-1 is orthogonal to any constant vector
  for (let i = 0; i < dims; i++) v[i] = i % 2 === 0 ? 1 : -1
  return v
}

function makeQuery(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return {
    raw:             overrides.raw             ?? '',
    keywords:        overrides.keywords        ?? [],
    normalizedTerms: overrides.normalizedTerms ?? [],
    intent:          overrides.intent          ?? new Set(['general']),
    timeFilter:      overrides.timeFilter,
    embedding:       overrides.embedding,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GraphSource', () => {
  let source: GraphSource

  beforeEach(() => {
    source = new GraphSource()
    mockGetAllNodes.mockResolvedValue([])
    mockGetAllEdges.mockResolvedValue([])
  })

  describe('empty graph', () => {
    it('returns empty array when no nodes exist', async () => {
      const result = await source.retrieve(makeQuery())
      expect(result).toHaveLength(0)
    })
  })

  describe('keyword matching', () => {
    it('returns nodes whose name contains a query term', async () => {
      const oauthNode = makeNode({ name: 'OAuth Migration', type: 'project' })
      mockGetAllNodes.mockResolvedValue([oauthNode])
      mockGetAllEdges.mockResolvedValue([])

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['oauth'] })
      )

      expect(result.some(f => f.type === 'graph_node')).toBe(true)
      expect(result.find(f => f.type === 'graph_node')?.metadata?.name).toBe('OAuth Migration')
    })

    it('does not return nodes with zero keyword overlap', async () => {
      const node = makeNode({ name: 'Unrelated Topic', type: 'skill' })
      mockGetAllNodes.mockResolvedValue([node])
      mockGetAllEdges.mockResolvedValue([])

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['oauth', 'pkce', 'jwt'] })
      )

      expect(result.filter(f => f.type === 'graph_node')).toHaveLength(0)
    })

    it('scores partial keyword match lower than full match', async () => {
      const full    = makeNode({ id: 'full',    name: 'OAuth PKCE Implementation', type: 'project' })
      const partial = makeNode({ id: 'partial', name: 'OAuth Overview',           type: 'project' })
      mockGetAllNodes.mockResolvedValue([full, partial])
      mockGetAllEdges.mockResolvedValue([])

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['oauth', 'pkce'] })
      )

      const nodeFragments = result.filter(f => f.type === 'graph_node')
      const fullFrag    = nodeFragments.find(f => f.entityId === 'full')
      const partialFrag = nodeFragments.find(f => f.entityId === 'partial')

      expect(fullFrag).toBeDefined()
      expect(partialFrag).toBeDefined()
      expect(fullFrag!.relevance).toBeGreaterThan(partialFrag!.relevance)
    })
  })

  describe('semantic matching', () => {
    it('returns a node with matching embedding even with zero keyword overlap', async () => {
      // "authentication" does not appear in the node name
      const oauthNode = makeNode({
        name:      'OAuth 2.0',
        type:      'skill',
        // Embedding "close" to the query embedding — same constant value = similarity 1
        embedding: constVec(0.5),
      })
      mockGetAllNodes.mockResolvedValue([oauthNode])
      mockGetAllEdges.mockResolvedValue([])

      const query = makeQuery({
        normalizedTerms: ['authentication'],  // does NOT appear in name
        embedding:       constVec(0.5),       // identical → similarity 1.0
      })

      const result = await source.retrieve(query)
      const nodeFrags = result.filter(f => f.type === 'graph_node')

      expect(nodeFrags).toHaveLength(1)
      expect(nodeFrags[0].metadata?.name).toBe('OAuth 2.0')
    })

    it('does not return a node whose embedding is orthogonal to query', async () => {
      const node = makeNode({
        name:      'OAuth 2.0',
        type:      'skill',
        embedding: orthogonalVec(),  // cosine similarity ≈ 0 with constVec(0.5)
      })
      mockGetAllNodes.mockResolvedValue([node])
      mockGetAllEdges.mockResolvedValue([])

      const query = makeQuery({
        normalizedTerms: ['authentication'],  // also no keyword match
        embedding:       constVec(0.5),
      })

      const result = await source.retrieve(query)
      expect(result.filter(f => f.type === 'graph_node')).toHaveLength(0)
    })

    it('semantic score ranks a semantically close node above a keyword-only match', async () => {
      // semanticNode: name doesn't match, but embedding is very close to query
      const semanticNode = makeNode({
        id:        'semantic',
        name:      'PKCE Flow',
        type:      'decision',
        embedding: constVec(0.5),   // sim ≈ 1.0 with query
      })
      // keywordNode: name contains the keyword, no embedding
      const keywordNode = makeNode({
        id:        'keyword',
        name:      'Authentication Overview',
        type:      'project',
        embedding: undefined,
      })
      mockGetAllNodes.mockResolvedValue([semanticNode, keywordNode])
      mockGetAllEdges.mockResolvedValue([])

      const query = makeQuery({
        normalizedTerms: ['authentication'],
        embedding:       constVec(0.5),
      })

      const result   = await source.retrieve(query)
      const nodeFrags = result.filter(f => f.type === 'graph_node')

      const semFrag = nodeFrags.find(f => f.entityId === 'semantic')
      const kwFrag  = nodeFrags.find(f => f.entityId === 'keyword')

      expect(semFrag).toBeDefined()
      expect(kwFrag).toBeDefined()
      // Semantic node (sim≈1.0) should outrank keyword-only node (kw score ≈ 0.4–0.9)
      expect(semFrag!.relevance).toBeGreaterThan(kwFrag!.relevance)
    })

    it('boosts score when both keyword and semantic signals fire', async () => {
      // node1: keyword match only
      const kwOnly = makeNode({
        id: 'kw', name: 'OAuth System', type: 'project', embedding: undefined,
      })
      // node2: same keyword match + strong semantic match
      const kwAndSem = makeNode({
        id: 'kwsem', name: 'OAuth System', type: 'project', embedding: constVec(0.5),
      })
      mockGetAllNodes.mockResolvedValue([kwOnly, kwAndSem])
      mockGetAllEdges.mockResolvedValue([])

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['oauth'], embedding: constVec(0.5) })
      )

      const kwFrag    = result.find(f => f.entityId === 'kw')
      const kwSemFrag = result.find(f => f.entityId === 'kwsem')

      expect(kwFrag).toBeDefined()
      expect(kwSemFrag).toBeDefined()
      expect(kwSemFrag!.relevance).toBeGreaterThan(kwFrag!.relevance)
    })
  })

  describe('connectivity bonus', () => {
    it('boosts score for nodes with more edges', async () => {
      const central  = makeNode({ id: 'central',  name: 'OAuth',  type: 'project' })
      const isolated = makeNode({ id: 'isolated', name: 'OAuth2', type: 'project' })

      // central has 3 edges; isolated has 0
      const edges: GraphEdge[] = [
        makeEdge('central', crypto.randomUUID()),
        makeEdge('central', crypto.randomUUID()),
        makeEdge(crypto.randomUUID(), 'central'),
      ]
      mockGetAllNodes.mockResolvedValue([central, isolated])
      mockGetAllEdges.mockResolvedValue(edges)

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['oauth'] })
      )

      const centralFrag  = result.find(f => f.entityId === 'central')
      const isolatedFrag = result.find(f => f.entityId === 'isolated')

      expect(centralFrag).toBeDefined()
      expect(isolatedFrag).toBeDefined()
      expect(centralFrag!.relevance).toBeGreaterThan(isolatedFrag!.relevance)
    })
  })

  describe('edge fragments', () => {
    it('emits edge fragments for confirmed edges attached to top nodes', async () => {
      const from = makeNode({ id: 'from', name: 'Piku', type: 'project' })
      const to   = makeNode({ id: 'to',   name: 'React', type: 'skill' })
      const edge = makeEdge('from', 'to', { status: 'confirmed', strength: 0.9 })

      mockGetAllNodes.mockResolvedValue([from, to])
      mockGetAllEdges.mockResolvedValue([edge])

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['piku'] })
      )

      const edgeFrags = result.filter(f => f.type === 'graph_edge')
      expect(edgeFrags).toHaveLength(1)
      expect(edgeFrags[0].metadata?.fromName).toBe('Piku')
      expect(edgeFrags[0].metadata?.toName).toBe('React')
    })

    it('deduplicates edges that appear in both directions', async () => {
      const a = makeNode({ id: 'a', name: 'Node A', type: 'project' })
      const b = makeNode({ id: 'b', name: 'Node B', type: 'skill' })
      const edge = makeEdge('a', 'b', { status: 'confirmed' })

      mockGetAllNodes.mockResolvedValue([a, b])
      mockGetAllEdges.mockResolvedValue([edge])

      // Both nodes match — edge should appear once only
      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['node'] })
      )

      const edgeFrags = result.filter(f => f.type === 'graph_edge')
      expect(edgeFrags).toHaveLength(1)
    })

    it('skips edges below strength threshold', async () => {
      const a    = makeNode({ id: 'a', name: 'Test', type: 'project' })
      const b    = makeNode({ id: 'b', name: 'Test2', type: 'skill' })
      const weak = makeEdge('a', 'b', { status: 'pending', strength: 0.50 })  // below 0.65

      mockGetAllNodes.mockResolvedValue([a, b])
      mockGetAllEdges.mockResolvedValue([weak])

      const result = await source.retrieve(
        makeQuery({ normalizedTerms: ['test'] })
      )

      expect(result.filter(f => f.type === 'graph_edge')).toHaveLength(0)
    })
  })

  describe('broad query (no terms)', () => {
    it('returns all nodes with base score when no query terms', async () => {
      const nodes = [
        makeNode({ id: 'a', name: 'Piku' }),
        makeNode({ id: 'b', name: 'OAuth' }),
        makeNode({ id: 'c', name: 'React' }),
      ]
      mockGetAllNodes.mockResolvedValue(nodes)
      mockGetAllEdges.mockResolvedValue([])

      const result = await source.retrieve(makeQuery({ normalizedTerms: [] }))
      const nodeFrags = result.filter(f => f.type === 'graph_node')

      expect(nodeFrags).toHaveLength(3)
      nodeFrags.forEach(f => expect(f.relevance).toBeGreaterThan(0))
    })
  })
})
