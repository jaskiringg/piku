import { openMemoryDB }                from './db'
import type { Memory, MemoryCategory, MemoryStats } from './types'

export class MemoryStore {
  async save(memory: Memory): Promise<void> {
    const db = await openMemoryDB()
    await db.put('memories', memory)
  }

  async getById(id: string): Promise<Memory | undefined> {
    const db = await openMemoryDB()
    return db.get('memories', id) as Promise<Memory | undefined>
  }

  async getAll(): Promise<Memory[]> {
    const db = await openMemoryDB()
    return db.getAll('memories') as Promise<Memory[]>
  }

  // Used by retrieval — only confirmed memories enter the context window.
  async getAllConfirmed(): Promise<Memory[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('memories', 'status', 'confirmed') as Promise<Memory[]>
  }

  async getByCategory(category: MemoryCategory): Promise<Memory[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('memories', 'category', category) as Promise<Memory[]>
  }

  async delete(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('memories', id)
  }

  async stats(): Promise<MemoryStats> {
    const all = await this.getAll()
    const byCategory: Partial<Record<MemoryCategory, number>> = {}
    let confirmed = 0
    let pending   = 0
    let oldestAt: number | null = null
    let newestAt: number | null = null

    for (const m of all) {
      byCategory[m.category] = (byCategory[m.category] ?? 0) + 1
      if (m.status === 'confirmed') confirmed++
      else                          pending++
      if (oldestAt === null || m.createdAt < oldestAt) oldestAt = m.createdAt
      if (newestAt === null || m.createdAt > newestAt) newestAt = m.createdAt
    }

    return { total: all.length, confirmed, pending, byCategory, oldestAt, newestAt }
  }
}
