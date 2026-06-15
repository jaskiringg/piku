import type { GraphNode, GraphEdge } from './types'

// ── Event types ────────────────────────────────────────────────────────────

export type GraphActivityEvent =
  | { type: 'extraction_start' }
  | { type: 'extraction_empty' }
  | { type: 'extraction_complete'; itemCount: number }
  | { type: 'node_created';  node: GraphNode; isNew: boolean }
  | { type: 'edge_created';  edge: GraphEdge; fromName: string; toName: string; fromType: string; toType: string }

// ── Log ────────────────────────────────────────────────────────────────────
//
// Module-level event bus.  GraphService emits; GraphPanel subscribes.
// Intentionally simple — no external dependency, no persistence.
// Kept in memory only; reset on page reload.

const MAX_HISTORY = 60

class GraphActivityLog {
  private readonly listeners: Set<(e: GraphActivityEvent) => void> = new Set()
  private history: Array<GraphActivityEvent & { id: number; ts: number }> = []
  private counter = 0

  emit(event: GraphActivityEvent): void {
    const stamped = { ...event, id: ++this.counter, ts: Date.now() }
    this.history = [...this.history.slice(-(MAX_HISTORY - 1)), stamped]
    this.listeners.forEach(fn => fn(event))
  }

  /** Returns a snapshot of the buffered history (newest last). */
  getHistory(): Array<GraphActivityEvent & { id: number; ts: number }> {
    return this.history
  }

  /** Subscribe to future events. Returns an unsubscribe function. */
  subscribe(fn: (e: GraphActivityEvent) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  clear(): void {
    this.history = []
    this.counter = 0
    this.listeners.forEach(fn => fn({ type: 'extraction_empty' }))
  }

  get eventCount(): number { return this.history.length }
}

export { GraphActivityLog }
export const graphActivityLog = new GraphActivityLog()
