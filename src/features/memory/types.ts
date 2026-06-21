import type { Message } from '../../types'

// ── Memory status ──────────────────────────────────────────────────────────
//
// confirmed: confidence >= 0.9 — fact was explicitly stated; used in retrieval
// pending:   0.5 <= confidence < 0.9 — stored for review; excluded from retrieval
//
// This prevents weakly-inferred memories from polluting Piku's context.

export type MemoryStatus = 'confirmed' | 'pending'

// ── Categories ─────────────────────────────────────────────────────────────

export type MemoryCategory =
  | 'personal_fact'
  | 'relationship'
  | 'preference'
  | 'long_term_goal'
  | 'ongoing_project'
  | 'important_date'
  | 'user_correction'
  | 'recurring_habit'
  | 'achievement'
  | 'skill'
  | 'career'
  | 'health_preference'
  | 'location'

// ── Memory ─────────────────────────────────────────────────────────────────

export interface Memory {
  id: string
  category: MemoryCategory
  status: MemoryStatus
  content: string          // human-readable: "User's girlfriend's birthday is June 10"
  embedding: Float32Array  // 768-dim vector; stored as binary in IndexedDB (~3KB vs ~12KB JSON)
  confidence: number       // 0–1, extraction certainty
  importance: number       // 0–1, surfaces more often when higher
  accessCount: number      // incremented each time this memory is retrieved
  lastAccessedAt: number   // unix ms
  createdAt: number        // unix ms
  updatedAt: number        // unix ms
  source: 'extracted' | 'manual'
  tags: string[]
}

// ── Search results ──────────────────────────────────────────────────────────

export interface MemorySearchResult {
  memory: Memory
  score: number      // composite retrieval score 0–1
  similarity: number // raw cosine similarity 0–1
}

// ── Extraction ──────────────────────────────────────────────────────────────

// Raw LLM output from the extraction pass — not yet persisted
export interface ExtractionCandidate {
  category: MemoryCategory
  content: string
  confidence: number
  tags: string[]
}

// ── Conversation summaries ──────────────────────────────────────────────────
//
// A rolling summary is generated every N exchanges within a session.
// Summaries are stored persistently and retrieved by semantic similarity,
// giving Piku long-term narrative context beyond individual facts.

export interface ConversationSummary {
  id: string
  summary: string          // LLM-generated, 3–5 sentences
  embedding: Float32Array  // vector of summary content for similarity retrieval
  messageCount: number     // total user+piku messages summarized
  sessionStartedAt: number // when this session began (unix ms)
  createdAt: number        // unix ms
}

// ── Conversations ────────────────────────────────────────────────────────────
//
// Full persisted chat history (Sprint 2.5-B). Unlike a summary (compressed
// narrative), a Conversation stores the verbatim ordered turns so the exact
// chat survives overlay close/reopen and app restart.

export interface Conversation {
  id: string
  messages: Message[]      // ordered user/piku turns (global Message type)
  startedAt: number        // unix ms — first message / session start
  updatedAt: number        // unix ms — last message appended (indexed)
  title?: string           // optional human label, derived later
}

// ── Agent contexts ────────────────────────────────────────────────────────────
//
// The Agent is a control hub of CONTEXTS (DB v7). Each context is a named chat —
// its own conversation scope — that can be linked to a Project and feeds the
// World-Model graph. This is the core object of the product: a separate context
// per topic/project keeps Piku's reasoning and memory cleanly partitioned.

export interface AgentTurn { role: 'you' | 'piku'; text: string }

export interface AgentContext {
  id: string
  title: string            // human label; auto-derived from the first message
  turns: AgentTurn[]       // the conversation in this context
  projectId?: string       // optional link to a Project (indexed)
  mode?: import('../../services/modes/Modes').Mode   // sticky approach mode (default 'auto')
  createdAt: number        // unix ms
  updatedAt: number        // unix ms — last turn appended (indexed)
}

// ── Stats ───────────────────────────────────────────────────────────────────

export interface MemoryStats {
  total: number
  confirmed: number
  pending: number
  byCategory: Partial<Record<MemoryCategory, number>>
  oldestAt: number | null
  newestAt: number | null
}
