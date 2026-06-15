import type { WorldModelResult } from './types'

// Maximum items per section to keep the context window lean.
// The LLM doesn't benefit from 20 decisions in context — 6 focused ones are better.
const MAX_PROJECTS       = 3
const MAX_DECISIONS      = 6
const MAX_BLOCKERS       = 4
const MAX_WORK_ITEMS     = 4
const MAX_MEMORIES       = 4
const MAX_ENTITIES       = 5
const MAX_RELATIONSHIPS  = 4
const MAX_RECENT_CHANGES = 4

/**
 * Converts a WorldModelResult into a concise, LLM-readable string block.
 * Returns an empty string when the result is empty.
 *
 * Format is intentionally plain text — no JSON, no markdown headers — because
 * LLMs parse labelled plain text more reliably in a system prompt context.
 */
export function formatWorldModelResult(result: WorldModelResult): string {
  if (result.isEmpty) return ''

  const sections: string[] = []

  // ── Projects ─────────────────────────────────────────────────────────────
  if (result.projects.length > 0) {
    const lines = result.projects.slice(0, MAX_PROJECTS).map(p => {
      const status = p.currentState ? ` (${p.currentState})` : ''
      return `  ${p.name}${status}: ${p.vision}`
    })
    sections.push(`Projects:\n${lines.join('\n')}`)
  }

  // ── Decisions ─────────────────────────────────────────────────────────────
  if (result.decisions.length > 0) {
    const lines = result.decisions.slice(0, MAX_DECISIONS).map(d => {
      const reasoning = d.reasoning ? ` — ${d.reasoning}` : ''
      return `  [${d.projectName}] ${d.title}${reasoning}`
    })
    sections.push(`Decisions:\n${lines.join('\n')}`)
  }

  // ── Blockers ──────────────────────────────────────────────────────────────
  if (result.blockers.length > 0) {
    const lines = result.blockers.slice(0, MAX_BLOCKERS).map(b => `  ${b}`)
    sections.push(`Blockers:\n${lines.join('\n')}`)
  }

  // ── Work in progress ──────────────────────────────────────────────────────
  if (result.currentWork.length > 0) {
    const lines = result.currentWork.slice(0, MAX_WORK_ITEMS).map(w => `  ${w}`)
    sections.push(`In Progress:\n${lines.join('\n')}`)
  }

  // ── Graph entities ────────────────────────────────────────────────────────
  if (result.entities.length > 0) {
    const lines = result.entities.slice(0, MAX_ENTITIES).map(e =>
      `  ${e.type}: ${e.name}`
    )
    sections.push(`Related Entities:\n${lines.join('\n')}`)
  }

  // ── Relationships ─────────────────────────────────────────────────────────
  if (result.relationships.length > 0) {
    const lines = result.relationships.slice(0, MAX_RELATIONSHIPS).map(r =>
      `  ${r.fromName} ${r.relationship} ${r.toName}`
    )
    sections.push(`Relationships:\n${lines.join('\n')}`)
  }

  // ── Memories ──────────────────────────────────────────────────────────────
  if (result.memories.length > 0) {
    const lines = result.memories.slice(0, MAX_MEMORIES).map(m => `  ${m.content}`)
    sections.push(`Relevant Context:\n${lines.join('\n')}`)
  }

  // ── Recent changes ────────────────────────────────────────────────────────
  if (result.recentChanges.length > 0) {
    const lines = result.recentChanges.slice(0, MAX_RECENT_CHANGES).map(c => {
      const age = formatAge(c.createdAt)
      return `  [${c.projectName}] v${c.version} (${age}): ${c.summary}`
    })
    sections.push(`Recent Changes:\n${lines.join('\n')}`)
  }

  if (sections.length === 0) return ''

  return `World Model:\n\n${sections.join('\n\n')}`
}

function formatAge(ts: number): string {
  const ms   = Date.now() - ts
  const mins = Math.floor(ms / 60_000)
  if (mins < 60)   return `${mins}m ago`
  const hrs  = Math.floor(mins / 60)
  if (hrs < 24)    return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
