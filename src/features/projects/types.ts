// ── Core domain types ──────────────────────────────────────────────────────

export interface Decision {
  id: string
  title: string
  reasoning: string
  alternatives: string[]
  createdAt: number
}

export interface ResearchItem {
  id: string
  source: string
  summary: string
  relevance: number   // 0–1
  createdAt: number
}

export interface Project {
  id: string
  name: string
  vision: string
  currentState: string
  completedWork: string[]
  inProgressWork: string[]
  nextSteps: string[]
  decisions: Decision[]
  blockers: string[]
  research: ResearchItem[]
  createdAt: number
  updatedAt: number
  embedding?: Float32Array  // semantic retrieval vector (name + vision + state)
}

// ── Extraction types ───────────────────────────────────────────────────────
//
// ProjectUpdateDraft is the raw LLM output from the extraction pass.
// projectIndex: index into the existing project array passed to the LLM (-1 = new project)
// Confident (≥ 0.8) drafts are applied immediately.
// Uncertain (0.6–0.79) drafts are written to pendingProjectUpdates for review.
// Below 0.6 is discarded.

export interface ProjectUpdateDraft {
  projectIndex: number   // -1 for new project
  isNew: boolean
  confidence: number
  name?: string
  vision?: string
  currentState?: string
  completedWork?: string[]
  inProgressWork?: string[]
  nextSteps?: string[]
  blockers?: string[]
  decisions?: Array<{
    title: string
    reasoning: string
    alternatives: string[]
  }>
}

// ── Context versioning ─────────────────────────────────────────────────────
//
// Every approved context update creates a ContextVersion that snapshots the
// project state after the update. Current state is always derivable from the
// latest ContextVersion — the projects store is a fast-read cache of the same data.

export interface ProjectSnapshot {
  vision:         string
  currentState:   string
  completedWork:  string[]
  inProgressWork: string[]
  nextSteps:      string[]
  blockers:       string[]
  decisions:      Decision[]
}

export interface ContextVersion {
  id:        string
  projectId: string
  version:   number                             // sequential per project: 1, 2, 3…
  createdAt: number
  trigger:   'project_created' | 'user_update'
  summary:   string                             // human-readable description of what this version contains
  snapshot:  ProjectSnapshot                    // full project state at this version
  diff:      string                             // what changed from the previous version
}

// ── User-initiated update diff ─────────────────────────────────────────────
//
// Returned by ProjectUpdateService.previewContextUpdate() before the user
// approves. Contains both a human-readable breakdown and the raw draft
// that applyApprovedDiff() consumes.

export interface ReviewableDiff {
  projectId:        string
  projectName:      string
  draft:            ProjectUpdateDraft
  newDecisions:     Array<{ title: string; reasoning: string }>
  newCompletedWork: string[]
  newInProgressWork: string[]
  newNextSteps:     string[]
  newBlockers:      string[]
  stateChange:      { from: string; to: string } | null
  hasChanges:       boolean
}

// ── Stored in pendingProjectUpdates IDB store for human review
export interface PendingProjectUpdate {
  id: string
  projectId: string | null   // null for new-project drafts
  draft: ProjectUpdateDraft
  conversation: { user: string; piku: string }
  confidence: number
  createdAt: number
}
