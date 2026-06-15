import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorldModelQueryService } from '../WorldModelQueryService'
import type { ContextSource, ContextFragment } from '../types'

// ── Mock EmbeddingService ─────────────────────────────────────────────────
vi.mock('../../memory/EmbeddingService', () => ({
  EmbeddingService: class {
    embed = vi.fn().mockResolvedValue(new Float32Array(768).fill(0.1))
  },
}))

// ── Mock default sources so no IDB is needed ─────────────────────────────
vi.mock('../sources/ProjectSource', () => ({
  ProjectSource: class {
    id       = 'project_source'
    retrieve = vi.fn().mockResolvedValue([])
  },
}))

vi.mock('../sources/MemorySource', () => ({
  MemorySource: class {
    id       = 'memory_source'
    retrieve = vi.fn().mockResolvedValue([])
  },
}))

vi.mock('../sources/GraphSource', () => ({
  GraphSource: class {
    id       = 'graph_source'
    retrieve = vi.fn().mockResolvedValue([])
  },
}))

// ── Mock logger ────────────────────────────────────────────────────────────
vi.mock('../../../lib/logger', () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSource(
  id: string,
  fragments: ContextFragment[],
): ContextSource {
  return {
    id,
    retrieve: vi.fn().mockResolvedValue(fragments),
  }
}

function decisionFragment(overrides: Partial<ContextFragment> = {}): ContextFragment {
  return {
    sourceId:  'test_source',
    type:      'decision',
    content:   '[OAuth Migration] Use OAuth 2.0 with PKCE — Better security for desktop apps',
    relevance: 0.9,
    entityId:  'decision-1',
    metadata: {
      projectId:   'proj-1',
      projectName: 'OAuth Migration',
      title:       'Use OAuth 2.0 with PKCE',
      reasoning:   'Better security for desktop apps',
      createdAt:   Date.now(),
    },
    ...overrides,
  }
}

function projectFragment(overrides: Partial<ContextFragment> = {}): ContextFragment {
  return {
    sourceId:  'test_source',
    type:      'project',
    content:   'OAuth Migration: Implementing OAuth for Piku. Status: In Progress',
    relevance: 0.85,
    entityId:  'proj-1',
    metadata: {
      projectId:    'proj-1',
      projectName:  'OAuth Migration',
      vision:       'Implementing OAuth for Piku',
      currentState: 'In Progress',
    },
    ...overrides,
  }
}

function memoryFragment(overrides: Partial<ContextFragment> = {}): ContextFragment {
  return {
    sourceId:  'test_source',
    type:      'memory',
    content:   'User prefers PKCE over implicit flow for security reasons',
    relevance: 0.75,
    entityId:  'mem-1',
    metadata: { category: 'preference', createdAt: Date.now() },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('WorldModelQueryService', () => {
  let service: WorldModelQueryService

  beforeEach(() => {
    service = new WorldModelQueryService()
  })

  describe('source registry', () => {
    it('registers a custom source', () => {
      const custom = makeSource('custom_source', [])
      service.register(custom)
      // Source is registered — no error thrown
      expect(() => service.register(custom)).not.toThrow()
    })

    it('unregisters a source', () => {
      const custom = makeSource('custom_source', [])
      service.register(custom)
      service.unregister('custom_source')
      // Querying should still work (other sources remain)
    })
  })

  describe('query()', () => {
    it('returns an empty result when all sources return nothing', async () => {
      const result = await service.query('What decisions about OAuth?')
      expect(result.isEmpty).toBe(true)
      expect(result.projects).toHaveLength(0)
      expect(result.decisions).toHaveLength(0)
    })

    it('aggregates decision fragments into decisions array', async () => {
      service.register(makeSource('test', [decisionFragment()]))

      const result = await service.query('What decisions have we made about OAuth?')

      expect(result.decisions).toHaveLength(1)
      expect(result.decisions[0].title).toBe('Use OAuth 2.0 with PKCE')
      expect(result.decisions[0].projectName).toBe('OAuth Migration')
      expect(result.decisions[0].reasoning).toBe('Better security for desktop apps')
    })

    it('aggregates project fragments into projects array', async () => {
      service.register(makeSource('test', [projectFragment()]))

      const result = await service.query('Tell me about OAuth Migration')

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].name).toBe('OAuth Migration')
      expect(result.projects[0].currentState).toBe('In Progress')
    })

    it('aggregates memory fragments into memories array', async () => {
      service.register(makeSource('test', [memoryFragment()]))

      const result = await service.query('What do I know about PKCE?')

      expect(result.memories).toHaveLength(1)
      expect(result.memories[0].content).toContain('PKCE')
    })

    it('aggregates across all fragment types in one result', async () => {
      service.register(makeSource('test', [
        projectFragment(),
        decisionFragment(),
        memoryFragment(),
      ]))

      const result = await service.query('What decisions about OAuth?')

      expect(result.projects).toHaveLength(1)
      expect(result.decisions).toHaveLength(1)
      expect(result.memories).toHaveLength(1)
      expect(result.isEmpty).toBe(false)
    })

    it('deduplicates fragments with the same entityId+type', async () => {
      // Two sources return the same decision
      const frag = decisionFragment()
      service.register(makeSource('source_a', [frag]))
      service.register(makeSource('source_b', [{ ...frag, sourceId: 'source_b' }]))

      const result = await service.query('What decisions about OAuth?')

      // Should appear exactly once despite coming from two sources
      expect(result.decisions).toHaveLength(1)
    })

    it('records which sources contributed results', async () => {
      service.register(makeSource('contributing_source', [projectFragment()]))

      const result = await service.query('Tell me about OAuth')

      expect(result.sources).toContain('contributing_source')
    })

    it('isolates a failing source from the result', async () => {
      const failingSource: ContextSource = {
        id:       'failing_source',
        retrieve: vi.fn().mockRejectedValue(new Error('IDB offline')),
      }
      service.register(failingSource)
      service.register(makeSource('working_source', [projectFragment()]))

      // Should not throw — failing source is logged, working source contributes
      const result = await service.query('Tell me about OAuth')
      expect(result.projects).toHaveLength(1)
      expect(result.sources).not.toContain('failing_source')
      expect(result.sources).toContain('working_source')
    })

    it('includes queryTerms in the result', async () => {
      const result = await service.query('What decisions about OAuth?')
      expect(result.queryTerms).toContain('oauth')
    })

    it('computes a confidence > 0 when fragments are returned', async () => {
      service.register(makeSource('test', [decisionFragment(), projectFragment()]))

      const result = await service.query('OAuth decisions')
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('queryForContext()', () => {
    it('returns an empty string when World Model is empty', async () => {
      const context = await service.queryForContext('What is OAuth?')
      expect(context).toBe('')
    })

    it('returns a non-empty formatted string when data exists', async () => {
      service.register(makeSource('test', [decisionFragment(), projectFragment()]))

      const context = await service.queryForContext('What decisions about OAuth?')
      expect(context.length).toBeGreaterThan(0)
      expect(context).toContain('World Model')
      expect(context).toContain('OAuth Migration')
    })

    it('includes decisions in the formatted output', async () => {
      service.register(makeSource('test', [decisionFragment()]))

      const context = await service.queryForContext('What decisions about OAuth?')
      expect(context).toContain('Use OAuth 2.0 with PKCE')
    })
  })
})
