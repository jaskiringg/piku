import { openMemoryDB }            from './db'
import type { ConversationSummary } from './types'

export class SummaryStore {
  async save(summary: ConversationSummary): Promise<void> {
    const db = await openMemoryDB()
    await db.put('summaries', summary)
  }

  async getAll(): Promise<ConversationSummary[]> {
    const db = await openMemoryDB()
    return db.getAll('summaries') as Promise<ConversationSummary[]>
  }

  async delete(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('summaries', id)
  }

  async count(): Promise<number> {
    const db = await openMemoryDB()
    return db.count('summaries')
  }
}
