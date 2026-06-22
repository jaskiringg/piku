import { invoke } from '@tauri-apps/api/core'
import type { Mode } from './modes/Modes'

// ─────────────────────────────────────────────────────────────────────────────
// ProjectBrainService — persistent "brain" per project / brainstorm / execute.
//
// Each brain is a folder in ~/Documents/Piku-Vault/<category>/<slug>/ containing:
//   sessions.md  — chronological log of turns (append-only)
//   graph.json   — latest knowledge-graph snapshot for this context
//   gdd.md       — terse running design-doc: title + bulleted summary log
//
// The vault Tauri commands (vault_write / vault_read) handle I/O. Every method
// swallows errors — the brain is best-effort and must never block a turn.
// ─────────────────────────────────────────────────────────────────────────────

/** Map a Mode to the vault category folder name. */
export function modeToCategory(mode: Mode): 'projects' | 'brainstorms' | 'executes' | null {
  switch (mode) {
    case 'project':    return 'projects'
    case 'brainstorm': return 'brainstorms'
    case 'execute':    return 'executes'
    default:           return null   // 'auto' — no persistent brain
  }
}

/** Convert a free-form name to a filesystem-safe slug (lowercase, hyphens, max 60 chars). */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanum runs → hyphen
    .replace(/^-+|-+$/g, '')       // strip leading/trailing hyphens
    .slice(0, 60)
    || 'untitled'
}

/** Saved graph entry returned by listGraphs(). */
export interface BrainGraphEntry {
  category: 'projects' | 'brainstorms' | 'executes'
  slug: string
  graph: unknown            // parsed graph.json content
  nodeCount: number
  edgeCount: number
}

class ProjectBrainService {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Append a timestamped exchange to sessions.md.
   * Reads existing content first so appends are non-destructive.
   */
  async saveTurn(category: string, slug: string, you: string, piku: string): Promise<void> {
    try {
      const ts = new Date().toISOString()
      const entry = `\n---\n**[${ts}] You:** ${you}\n\n**Piku:** ${piku}\n`
      // Read existing and append; vault_read errors (missing file) become empty string
      const existing = await invoke<string>('vault_read', { category, slug, filename: 'sessions.md' }).catch(() => '')
      await invoke('vault_write', { category, slug, filename: 'sessions.md', content: existing + entry })
    } catch { /* swallow — brain is best-effort */ }
  }

  /**
   * Write the current graph snapshot to graph.json.
   * Overwrites the previous snapshot — only the latest matters for context.
   */
  async saveGraph(category: string, slug: string, graphJson: unknown): Promise<void> {
    try {
      const content = JSON.stringify(graphJson, null, 2)
      await invoke('vault_write', { category, slug, filename: 'graph.json', content })
    } catch { /* swallow */ }
  }

  /**
   * Maintain gdd.md: a heading with the title and a running bulleted log.
   * Reads existing content, appends the new summary line, and rewrites.
   */
  async updateGdd(category: string, slug: string, title: string, summaryLine: string): Promise<void> {
    try {
      const ts = new Date().toISOString().slice(0, 16)  // "YYYY-MM-DDTHH:mm"
      const bullet = `- [${ts}] ${summaryLine}`
      const existing = await invoke<string>('vault_read', { category, slug, filename: 'gdd.md' }).catch(() => '')
      let content: string
      if (!existing.trim()) {
        // First write — create the heading + first bullet
        content = `# ${title}\n\n${bullet}\n`
      } else {
        // Append the bullet below the existing content
        content = existing.trimEnd() + '\n' + bullet + '\n'
      }
      await invoke('vault_write', { category, slug, filename: 'gdd.md', content })
    } catch { /* swallow */ }
  }

  /**
   * Delete the vault entry (all files under <category>/<slug>/) for a brain.
   * Best-effort — swallows errors.
   */
  async deleteEntry(category: string, slug: string): Promise<void> {
    try {
      await invoke('vault_delete', { category, slug })
    } catch { /* swallow — best-effort */ }
  }

  /**
   * Return all saved brain graph entries across all 3 categories.
   * Each entry has the category, slug, parsed graph, and node/edge counts.
   * Entries without graph.json are skipped.
   */
  async listGraphs(): Promise<BrainGraphEntry[]> {
    const categories: Array<'projects' | 'brainstorms' | 'executes'> = ['projects', 'brainstorms', 'executes']
    const results: BrainGraphEntry[] = []
    for (const category of categories) {
      try {
        const slugs = await invoke<string[]>('vault_list', { category })
        for (const slug of slugs) {
          try {
            const raw = await invoke<string>('vault_read', { category, slug, filename: 'graph.json' })
            if (!raw.trim()) continue
            const parsed = JSON.parse(raw) as { nodes?: unknown[]; edges?: unknown[] }
            const nodeCount = parsed.nodes?.length ?? 0
            const edgeCount = parsed.edges?.length ?? 0
            if (nodeCount === 0) continue
            results.push({ category, slug, graph: parsed, nodeCount, edgeCount })
          } catch { /* skip entries without graph.json or bad JSON */ }
        }
      } catch { /* skip unavailable categories */ }
    }
    return results
  }

  /**
   * Load the brain context for a project.
   * Returns a string suitable for prepending to the agent's system prompt, or '' if nothing stored.
   * Reads gdd.md (always); also reads a compact summary of graph.json when present.
   */
  async load(category: string, slug: string): Promise<string> {
    try {
      const gdd = await invoke<string>('vault_read', { category, slug, filename: 'gdd.md' }).catch(() => '')
      if (!gdd.trim()) return ''

      // Compact graph summary: just node count + first 10 node names (no full JSON in prompt)
      let graphSummary = ''
      try {
        const raw = await invoke<string>('vault_read', { category, slug, filename: 'graph.json' })
        if (raw.trim()) {
          const parsed = JSON.parse(raw) as { nodes?: { name?: string; type?: string }[]; edges?: unknown[] }
          const nodes = parsed.nodes ?? []
          const edges = parsed.edges ?? []
          if (nodes.length > 0) {
            const sample = nodes.slice(0, 10).map(n => `${n.type ?? '?'}: ${n.name ?? '?'}`).join(', ')
            graphSummary = `\nGraph snapshot: ${nodes.length} nodes, ${edges.length} edges — ${sample}${nodes.length > 10 ? ', …' : ''}`
          }
        }
      } catch { /* graph is optional */ }

      return `[BRAIN CONTEXT — loaded from vault]\n${gdd.trim()}${graphSummary}\n[END BRAIN CONTEXT]`
    } catch {
      return ''
    }
  }
}

export const projectBrainService = new ProjectBrainService()
