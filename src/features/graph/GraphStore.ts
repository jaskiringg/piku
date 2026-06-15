import { openMemoryDB }                     from '../memory/db'
import type { GraphNode, GraphEdge, GraphNodeType, GraphRelationship } from './types'

export class GraphStore {
  // ── Nodes ──────────────────────────────────────────────────────────────────

  async saveNode(node: GraphNode): Promise<void> {
    const db = await openMemoryDB()
    await db.put('graphNodes', node)
  }

  async getNode(id: string): Promise<GraphNode | undefined> {
    const db = await openMemoryDB()
    return db.get('graphNodes', id) as Promise<GraphNode | undefined>
  }

  async getAllNodes(): Promise<GraphNode[]> {
    const db = await openMemoryDB()
    return db.getAll('graphNodes') as Promise<GraphNode[]>
  }

  async getNodesByType(type: GraphNodeType): Promise<GraphNode[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('graphNodes', 'type', type) as Promise<GraphNode[]>
  }

  async findNodeByName(name: string, type?: GraphNodeType): Promise<GraphNode | undefined> {
    const all = type ? await this.getNodesByType(type) : await this.getAllNodes()
    const lower = name.toLowerCase()
    return all.find(n => n.name.toLowerCase() === lower)
  }

  async deleteNode(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('graphNodes', id)
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  async saveEdge(edge: GraphEdge): Promise<void> {
    const db = await openMemoryDB()
    await db.put('graphEdges', edge)
  }

  async getEdge(id: string): Promise<GraphEdge | undefined> {
    const db = await openMemoryDB()
    return db.get('graphEdges', id) as Promise<GraphEdge | undefined>
  }

  async getAllEdges(): Promise<GraphEdge[]> {
    const db = await openMemoryDB()
    return db.getAll('graphEdges') as Promise<GraphEdge[]>
  }

  async getConfirmedEdges(): Promise<GraphEdge[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('graphEdges', 'status', 'confirmed') as Promise<GraphEdge[]>
  }

  // IDB has no OR index query — run two index queries and merge
  async getEdgesForNode(nodeId: string): Promise<GraphEdge[]> {
    const db = await openMemoryDB()
    const [from, to] = await Promise.all([
      db.getAllFromIndex('graphEdges', 'fromId', nodeId) as Promise<GraphEdge[]>,
      db.getAllFromIndex('graphEdges', 'toId',   nodeId) as Promise<GraphEdge[]>,
    ])
    // Deduplicate (an edge could theoretically appear in both if fromId === toId, which we disallow)
    const seen = new Set<string>()
    return [...from, ...to].filter(e => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
  }

  async getEdgesFromNode(nodeId: string): Promise<GraphEdge[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('graphEdges', 'fromId', nodeId) as Promise<GraphEdge[]>
  }

  async getEdgesToNode(nodeId: string): Promise<GraphEdge[]> {
    const db = await openMemoryDB()
    return db.getAllFromIndex('graphEdges', 'toId', nodeId) as Promise<GraphEdge[]>
  }

  // Check for an existing edge between the same pair with the same relationship
  async findDuplicateEdge(
    fromId: string,
    toId: string,
    relationship: GraphRelationship,
  ): Promise<GraphEdge | undefined> {
    const outgoing = await this.getEdgesFromNode(fromId)
    return outgoing.find(e => e.toId === toId && e.relationship === relationship)
  }

  async deleteEdge(id: string): Promise<void> {
    const db = await openMemoryDB()
    await db.delete('graphEdges', id)
  }
}
