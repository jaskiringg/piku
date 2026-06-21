import { openMemoryDB }       from './db'
import type { AgentContext }  from './types'

// Persistent CRUD for agent contexts (DB v7). Each context is a named chat scope
// the Agent hub manages. Mirrors ConversationStore's thin-wrapper style.
export class AgentContextStore {
  async save(context: AgentContext): Promise<void> {
    const db = await openMemoryDB()
    await db.put('agentContexts', context)
  }

  async get(id: string): Promise<AgentContext | undefined> {
    const db = await openMemoryDB()
    return db.get('agentContexts', id) as Promise<AgentContext | undefined>
  }

  // All contexts, most-recently-updated first (walks the updatedAt index descending).
  async getAll(): Promise<AgentContext[]> {
    const db = await openMemoryDB()
    const out: AgentContext[] = []
    let cursor = await db.transaction('agentContexts').store.index('updatedAt').openCursor(null, 'prev')
    while (cursor) { out.push(cursor.value as AgentContext); cursor = await cursor.continue() }
    return out
  }

  async delete(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('agentContexts', id)
  }

  async count(): Promise<number> {
    const db = await openMemoryDB()
    return db.count('agentContexts')
  }
}
