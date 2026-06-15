// ── Core graph types ───────────────────────────────────────────────────────

export type GraphNodeType =
  | 'project'
  | 'goal'
  | 'skill'
  | 'person'
  | 'memory'
  | 'decision'
  | 'repository'
  | 'technology'
  | 'concept'      // named architectural, domain, or design concept (not a choice — a structural element)

export type GraphRelationship =
  | 'depends_on'
  | 'supports'
  | 'blocks'
  | 'caused_by'
  | 'related_to'
  | 'owned_by'
  | 'uses'        // project/task uses a technology
  | 'supersedes'  // decision supersedes another decision
  | 'implements'  // project/task implements a decision
  | 'part_of'     // node belongs to a project or larger entity

export type GraphEdgeStatus = 'confirmed' | 'pending'

export interface GraphNode {
  id: string
  type: GraphNodeType
  name: string
  metadata: Record<string, unknown>
  embedding?: Float32Array  // 768-dim nomic-embed-text vector; generated async after node creation
  createdAt: number
  updatedAt: number
}

export interface GraphEdge {
  id: string
  fromId: string
  toId: string
  relationship: GraphRelationship
  strength: number             // 0–1
  status: GraphEdgeStatus      // confirmed ≥ 0.85; pending 0.65–0.84
  createdAt: number
}

// ── Extraction types ───────────────────────────────────────────────────────
//
// The LLM returns a list of GraphExtractionItems.
// Each item describes a directed relationship between two nodes.
// Nodes can be existing (index ≥ 0) or new (index === -1).

export interface ExtractionNodeRef {
  index: number               // index into the existingNodes array; -1 = new
  type?: GraphNodeType        // required when index === -1
  name?: string               // required when index === -1
  metadata?: Record<string, unknown>
}

export interface GraphExtractionItem {
  confidence: number
  fromNode: ExtractionNodeRef
  relationship: GraphRelationship
  toNode: ExtractionNodeRef
}

// ── Reasoning output types ─────────────────────────────────────────────────

export interface ProjectRisk {
  nodeId: string
  nodeName: string
  dependencies: string[]
  blockers: string[]
  weakSkills: string[]           // skills with strength < 0.6
  recommendations: string[]
}

export interface NextBestAction {
  projectName: string
  action: string
  reasoning: string
  relatedNodes: string[]
}
