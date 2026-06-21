// ── IDB polyfill — must be first ──────────────────────────────────────────
import 'fake-indexeddb/auto'

import { describe, it, expect } from 'vitest'
import { AgentContextStore }    from '../AgentContextStore'
import type { AgentContext }    from '../types'

function makeContext(id: string, updatedAt: number, projectId?: string): AgentContext {
  return {
    id,
    title: `Context ${id}`,
    turns: [
      { role: 'you',  text: 'open safari' },
      { role: 'piku', text: 'Opened Safari.' },
    ],
    projectId,
    createdAt: updatedAt - 1000,
    updatedAt,
  }
}

// The agentContexts store is created on first openMemoryDB() against fake-indexeddb (DB v7).
describe('AgentContextStore', () => {
  const store = new AgentContextStore()

  it('saves and retrieves a context by id', async () => {
    const ctx = makeContext('a1', 1000)
    await store.save(ctx)
    expect(await store.get('a1')).toEqual(ctx)
  })

  it('lists all contexts most-recently-updated first', async () => {
    await store.save(makeContext('a2', 3000))
    await store.save(makeContext('a3', 2000))
    const all = await store.getAll()
    const ids = all.map(c => c.id)
    // a2 (3000) > a3 (2000) > a1 (1000)
    expect(ids).toEqual(['a2', 'a3', 'a1'])
  })

  it('persists a project link', async () => {
    const ctx = makeContext('a4', 4000, 'proj-xyz')
    await store.save(ctx)
    expect((await store.get('a4'))?.projectId).toBe('proj-xyz')
  })

  it('updates an existing context in place (same id)', async () => {
    const updated = { ...makeContext('a1', 5000), title: 'Renamed' }
    await store.save(updated)
    expect((await store.get('a1'))?.title).toBe('Renamed')
    expect(await store.count()).toBe(4)   // a1..a4, no duplicate
  })

  it('deletes a context', async () => {
    await store.delete('a3')
    expect(await store.get('a3')).toBeUndefined()
    expect((await store.getAll()).map(c => c.id)).not.toContain('a3')
  })
})
