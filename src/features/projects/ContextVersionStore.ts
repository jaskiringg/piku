import { openMemoryDB }       from '../memory/db'
import type { ContextVersion } from './types'

export class ContextVersionStore {
  async save(version: ContextVersion): Promise<void> {
    const db = await openMemoryDB()
    await db.put('contextVersions', version)
  }

  async getForProject(projectId: string): Promise<ContextVersion[]> {
    const db  = await openMemoryDB()
    const all = await db.getAllFromIndex('contextVersions', 'projectId', projectId) as ContextVersion[]
    return all.sort((a, b) => a.version - b.version)
  }

  async getLatestForProject(projectId: string): Promise<ContextVersion | undefined> {
    const versions = await this.getForProject(projectId)
    return versions[versions.length - 1]
  }

  async countForProject(projectId: string): Promise<number> {
    const db = await openMemoryDB()
    return db.countFromIndex('contextVersions', 'projectId', projectId)
  }
}
