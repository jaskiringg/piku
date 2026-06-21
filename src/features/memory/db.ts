import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME    = 'piku-memory'
const DB_VERSION = 8

let _db: IDBPDatabase | null = null

export async function openMemoryDB(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v2: memories + summaries ───────────────────────────────────────────
      if (oldVersion < 2) {
        if (db.objectStoreNames.contains('memories'))  db.deleteObjectStore('memories')
        if (db.objectStoreNames.contains('summaries')) db.deleteObjectStore('summaries')

        const memories = db.createObjectStore('memories', { keyPath: 'id' })
        memories.createIndex('category',       'category',       { unique: false })
        memories.createIndex('status',         'status',         { unique: false })
        memories.createIndex('createdAt',      'createdAt',      { unique: false })
        memories.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false })

        const summaries = db.createObjectStore('summaries', { keyPath: 'id' })
        summaries.createIndex('createdAt', 'createdAt', { unique: false })
      }

      // ── v3: projects + pending project updates ────────────────────────────
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('projects')) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' })
          projects.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
        if (!db.objectStoreNames.contains('pendingProjectUpdates')) {
          const pending = db.createObjectStore('pendingProjectUpdates', { keyPath: 'id' })
          pending.createIndex('projectId', 'projectId', { unique: false })
          pending.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }

      // ── v5: project context versions ──────────────────────────────────────
      // Non-destructive. Stores a snapshot of project state after every approved
      // context update so the full evolution of a project is always queryable.
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains('contextVersions')) {
          const cv = db.createObjectStore('contextVersions', { keyPath: 'id' })
          cv.createIndex('projectId', 'projectId', { unique: false })
          cv.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }

      // ── v4: knowledge graph nodes + edges ─────────────────────────────────
      // Non-destructive: all v3 stores preserved.
      // status index on edges lets confirmed/pending be queried without full scan.
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('graphNodes')) {
          const nodes = db.createObjectStore('graphNodes', { keyPath: 'id' })
          nodes.createIndex('type',      'type',      { unique: false })
          nodes.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
        if (!db.objectStoreNames.contains('graphEdges')) {
          const edges = db.createObjectStore('graphEdges', { keyPath: 'id' })
          edges.createIndex('fromId',       'fromId',       { unique: false })
          edges.createIndex('toId',         'toId',         { unique: false })
          edges.createIndex('status',       'status',       { unique: false })
          edges.createIndex('relationship', 'relationship', { unique: false })
        }
      }

      // ── v6: conversation persistence ──────────────────────────────────────
      // Non-destructive: all v5 stores preserved. Persists full chat
      // conversations so history survives overlay close/reopen and app restart
      // (Sprint 2.5-B). updatedAt index lets the latest conversation load fast.
      if (oldVersion < 6) {
        if (!db.objectStoreNames.contains('conversations')) {
          const conversations = db.createObjectStore('conversations', { keyPath: 'id' })
          conversations.createIndex('updatedAt', 'updatedAt', { unique: false })
        }
      }

      // ── v7: agent contexts ────────────────────────────────────────────────
      // Non-destructive. The Agent becomes a multi-context control hub: each
      // context is a named chat (its own conversation scope) that can be linked
      // to a project and feeds the World-Model graph. updatedAt index sorts the
      // context list cheaply as it grows. projectId index finds a project's contexts.
      if (oldVersion < 7) {
        if (!db.objectStoreNames.contains('agentContexts')) {
          const contexts = db.createObjectStore('agentContexts', { keyPath: 'id' })
          contexts.createIndex('updatedAt', 'updatedAt', { unique: false })
          contexts.createIndex('projectId', 'projectId', { unique: false })
        }
      }

      // ── v8: service accounts ──────────────────────────────────────────────
      // Multi-account support for GitHub, email, WhatsApp, etc. Each account
      // stores its service type + auth token + label. service index enables
      // queries like "all GitHub accounts".
      if (oldVersion < 8) {
        if (!db.objectStoreNames.contains('accounts')) {
          const accounts = db.createObjectStore('accounts', { keyPath: 'id' })
          accounts.createIndex('service',   'service',   { unique: false })
          accounts.createIndex('enabled',   'enabled',   { unique: false })
          accounts.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    },
  })
  return _db
}
