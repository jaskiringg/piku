import { openMemoryDB }      from './db'
import type { Conversation } from './types'

// Persistent CRUD for full chat conversations (Sprint 2.5-B).
// Thin wrapper over the shared piku-memory DB, mirroring SummaryStore's style.
export class ConversationStore {
  async save(conversation: Conversation): Promise<void> {
    const db = await openMemoryDB()
    await db.put('conversations', conversation)
  }

  async get(id: string): Promise<Conversation | undefined> {
    const db = await openMemoryDB()
    return db.get('conversations', id) as Promise<Conversation | undefined>
  }

  async getAll(): Promise<Conversation[]> {
    const db = await openMemoryDB()
    return db.getAll('conversations') as Promise<Conversation[]>
  }

  // Most-recently-updated conversation, or undefined if none.
  // Walks the updatedAt index in descending order so it stays cheap as history grows.
  async getLatest(): Promise<Conversation | undefined> {
    const db = await openMemoryDB()
    const cursor = await db
      .transaction('conversations')
      .store.index('updatedAt')
      .openCursor(null, 'prev')
    return cursor?.value as Conversation | undefined
  }

  async delete(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('conversations', id)
  }

  async count(): Promise<number> {
    const db = await openMemoryDB()
    return db.count('conversations')
  }
}
