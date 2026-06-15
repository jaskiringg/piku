import { openMemoryDB }                     from '../memory/db'
import type { Project, PendingProjectUpdate } from './types'

export class ProjectStore {
  // ── Projects ───────────────────────────────────────────────────────────────

  async save(project: Project): Promise<void> {
    const db = await openMemoryDB()
    await db.put('projects', project)
  }

  async getById(id: string): Promise<Project | undefined> {
    const db = await openMemoryDB()
    return db.get('projects', id) as Promise<Project | undefined>
  }

  async getAll(): Promise<Project[]> {
    const db = await openMemoryDB()
    const all = await db.getAll('projects') as Project[]
    // Most recently updated first
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async delete(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('projects', id)
  }

  async count(): Promise<number> {
    const db = await openMemoryDB()
    return db.count('projects')
  }

  // ── Pending updates ────────────────────────────────────────────────────────

  async savePending(update: PendingProjectUpdate): Promise<void> {
    const db = await openMemoryDB()
    await db.put('pendingProjectUpdates', update)
  }

  async getAllPending(): Promise<PendingProjectUpdate[]> {
    const db = await openMemoryDB()
    return db.getAll('pendingProjectUpdates') as Promise<PendingProjectUpdate[]>
  }

  async deletePending(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('pendingProjectUpdates', id)
  }
}
