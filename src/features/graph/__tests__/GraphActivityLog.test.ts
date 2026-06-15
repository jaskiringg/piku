import { describe, it, expect, beforeEach }  from 'vitest'
import { GraphActivityLog }                  from '../GraphActivityLog'
import type { GraphActivityEvent }           from '../GraphActivityLog'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeNode(overrides = {}) {
  return {
    id: 'node-1', type: 'project' as const, name: 'OAuth Migration',
    metadata: {}, createdAt: Date.now(), updatedAt: Date.now(),
    ...overrides,
  }
}

function makeEdge(overrides = {}) {
  return {
    id: 'edge-1', fromId: 'node-1', toId: 'node-2',
    relationship: 'depends_on' as const, strength: 0.9,
    status: 'confirmed' as const, createdAt: Date.now(),
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GraphActivityLog', () => {
  let log: GraphActivityLog

  // Instantiate a fresh log for each test (not the module singleton)
  beforeEach(() => {
    log = new GraphActivityLog()
  })

  describe('emit and subscribe', () => {
    it('notifies subscriber immediately on emit', () => {
      const received: GraphActivityEvent[] = []
      log.subscribe(e => received.push(e))

      log.emit({ type: 'extraction_start' })

      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('extraction_start')
    })

    it('notifies multiple subscribers', () => {
      const a: GraphActivityEvent[] = []
      const b: GraphActivityEvent[] = []
      log.subscribe(e => a.push(e))
      log.subscribe(e => b.push(e))

      log.emit({ type: 'extraction_empty' })

      expect(a).toHaveLength(1)
      expect(b).toHaveLength(1)
    })

    it('stops notifying after unsubscribe', () => {
      const received: GraphActivityEvent[] = []
      const unsub = log.subscribe(e => received.push(e))

      log.emit({ type: 'extraction_start' })
      unsub()
      log.emit({ type: 'extraction_empty' })

      expect(received).toHaveLength(1)
    })

    it('emits node_created with isNew flag', () => {
      const received: GraphActivityEvent[] = []
      log.subscribe(e => received.push(e))

      log.emit({ type: 'node_created', node: makeNode(), isNew: true })

      expect(received[0].type).toBe('node_created')
      if (received[0].type === 'node_created') {
        expect(received[0].isNew).toBe(true)
        expect(received[0].node.name).toBe('OAuth Migration')
      }
    })

    it('emits edge_created with relationship details', () => {
      const received: GraphActivityEvent[] = []
      log.subscribe(e => received.push(e))

      log.emit({
        type:         'edge_created',
        edge:         makeEdge(),
        fromName:     'OAuth Migration',
        toName:       'PKCE',
        fromType:     'project',
        toType:       'decision',
      })

      expect(received[0].type).toBe('edge_created')
      if (received[0].type === 'edge_created') {
        expect(received[0].fromName).toBe('OAuth Migration')
        expect(received[0].toName).toBe('PKCE')
        expect(received[0].edge.strength).toBe(0.9)
      }
    })
  })

  describe('history', () => {
    it('stores emitted events in history', () => {
      log.emit({ type: 'extraction_start' })
      log.emit({ type: 'extraction_empty' })

      expect(log.getHistory()).toHaveLength(2)
    })

    it('stamps each event with id and ts', () => {
      log.emit({ type: 'extraction_start' })
      const history = log.getHistory()

      expect(history[0]).toHaveProperty('id')
      expect(history[0]).toHaveProperty('ts')
      expect(typeof history[0].id).toBe('number')
      expect(typeof history[0].ts).toBe('number')
    })

    it('ids are monotonically increasing', () => {
      log.emit({ type: 'extraction_start' })
      log.emit({ type: 'extraction_empty' })
      log.emit({ type: 'extraction_complete', itemCount: 2 })

      const ids = log.getHistory().map(e => e.id)
      expect(ids[0]).toBeLessThan(ids[1])
      expect(ids[1]).toBeLessThan(ids[2])
    })

    it('returns history newest-last (insertion order)', () => {
      log.emit({ type: 'extraction_start' })
      log.emit({ type: 'extraction_complete', itemCount: 1 })

      const history = log.getHistory()
      expect(history[0].type).toBe('extraction_start')
      expect(history[1].type).toBe('extraction_complete')
    })

    it('reports correct eventCount', () => {
      log.emit({ type: 'extraction_start' })
      log.emit({ type: 'extraction_empty' })

      expect(log.eventCount).toBe(2)
    })
  })

  describe('clear', () => {
    it('empties history on clear', () => {
      log.emit({ type: 'extraction_start' })
      log.emit({ type: 'extraction_empty' })
      log.clear()

      expect(log.getHistory()).toHaveLength(0)
      expect(log.eventCount).toBe(0)
    })

    it('notifies subscribers with extraction_empty on clear', () => {
      const received: GraphActivityEvent[] = []
      log.subscribe(e => received.push(e))

      log.emit({ type: 'extraction_start' })
      log.clear()

      // Last event should be extraction_empty from clear()
      expect(received[received.length - 1].type).toBe('extraction_empty')
    })
  })

  describe('extraction_complete event', () => {
    it('carries itemCount', () => {
      const received: GraphActivityEvent[] = []
      log.subscribe(e => received.push(e))

      log.emit({ type: 'extraction_complete', itemCount: 3 })

      const event = received[0]
      if (event.type === 'extraction_complete') {
        expect(event.itemCount).toBe(3)
      } else {
        throw new Error('Expected extraction_complete event')
      }
    })
  })
})

