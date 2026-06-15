// ── Query parsing ──────────────────────────────────────────────────────────

export type QueryIntent =
  | 'decisions'      // "what decisions", "what did we choose", "decided"
  | 'blockers'       // "blocked", "blocker", "stuck"
  | 'current_work'   // "in progress", "working on", "currently"
  | 'recent_changes' // "what changed", "recent", "this week", "last N days"
  | 'entities'       // "what technologies", "what tools", "stack"
  | 'relationships'  // "related to", "connected to", "depends on"
  | 'general'        // fallback — broad retrieval across everything

export interface ParsedQuery {
  raw:              string
  keywords:         string[]      // significant terms after stop-word removal
  normalizedTerms:  string[]      // lowercase, deduplicated, used for matching
  intent:           Set<QueryIntent>
  timeFilter?:      { days: number }
  embedding?:       Float32Array  // populated by WorldModelQueryService before sources run
}

// ── Context fragments ──────────────────────────────────────────────────────
//
// Every ContextSource returns an array of ContextFragments.
// WorldModelQueryService aggregates them and builds a WorldModelResult.

export type FragmentType =
  | 'project'
  | 'decision'
  | 'memory'
  | 'graph_node'
  | 'graph_edge'
  | 'blocker'
  | 'work_item'
  | 'context_version'

export interface ContextFragment {
  sourceId:  string
  type:      FragmentType
  content:   string         // human-readable summary — used directly in formatted output
  relevance: number         // 0–1 composite score
  entityId?: string         // IDB primary key for the backing entity
  metadata?: Record<string, unknown>
}

// ── Source interface ───────────────────────────────────────────────────────
//
// Any new observation source (git, IDE, browser, calendar) implements this
// and calls worldModelQueryService.register(source) at startup.

export interface ContextSource {
  readonly id: string
  retrieve(query: ParsedQuery): Promise<ContextFragment[]>
}

// ── Structured result types ────────────────────────────────────────────────

export interface ProjectResult {
  id:           string
  name:         string
  vision:       string
  currentState: string
  relevance:    number
}

export interface DecisionResult {
  id:          string
  projectId:   string
  projectName: string
  title:       string
  reasoning:   string
  createdAt:   number
  relevance:   number
}

export interface MemoryResult {
  id:        string
  content:   string
  category:  string
  relevance: number
  createdAt: number
}

export interface GraphNodeResult {
  id:          string
  type:        string
  name:        string
  relevance:   number
}

export interface GraphEdgeResult {
  id:           string
  fromName:     string
  toName:       string
  relationship: string
  relevance:    number
}

export interface ContextVersionResult {
  id:          string
  projectId:   string
  projectName: string
  version:     number
  summary:     string
  diff:        string
  createdAt:   number
}

// ── The unified result ─────────────────────────────────────────────────────

export interface WorldModelResult {
  projects:      ProjectResult[]
  decisions:     DecisionResult[]
  blockers:      string[]
  currentWork:   string[]
  entities:      GraphNodeResult[]
  relationships: GraphEdgeResult[]
  memories:      MemoryResult[]
  recentChanges: ContextVersionResult[]
  confidence:    number         // 0–1 aggregate quality score
  queryTerms:    string[]       // terms that drove retrieval
  sources:       string[]       // which ContextSource IDs contributed results
  isEmpty:       boolean        // true when no source returned anything
}
