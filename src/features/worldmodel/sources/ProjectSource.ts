import { openMemoryDB }       from '../../memory/db'
import { cosineSimilarity }   from '../../memory/_math'
import type { ContextSource, ContextFragment, ParsedQuery } from '../types'
import type { Project, ContextVersion } from '../../projects/types'

const MAX_PROJECTS          = 5
const MAX_DECISIONS_PER_P   = 5    // all decisions if query is about decisions
const MAX_CONTEXT_VERSIONS  = 5
const SEMANTIC_WEIGHT       = 0.6  // blended with keyword score when embedding available

export class ProjectSource implements ContextSource {
  readonly id = 'project_source'

  async retrieve(query: ParsedQuery): Promise<ContextFragment[]> {
    const db = await openMemoryDB()

    const [projects, allVersions] = await Promise.all([
      db.getAll('projects') as Promise<Project[]>,
      this.needsVersions(query)
        ? db.getAll('contextVersions') as Promise<ContextVersion[]>
        : Promise.resolve([] as ContextVersion[]),
    ])

    if (projects.length === 0) return []

    // Score every project
    const scored = projects
      .map(p => ({ project: p, score: this.scoreProject(p, query) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)

    // Semantic re-rank if embedding available
    if (query.embedding) {
      for (const s of scored) {
        if (s.project.embedding) {
          const sim = cosineSimilarity(query.embedding, s.project.embedding)
          // Blend keyword score with semantic similarity
          s.score = s.score * (1 - SEMANTIC_WEIGHT) + sim * SEMANTIC_WEIGHT
        }
      }
      scored.sort((a, b) => b.score - a.score)
    }

    const topProjects = scored.slice(0, MAX_PROJECTS)
    const fragments: ContextFragment[] = []

    for (const { project, score } of topProjects) {
      // ── Project overview ────────────────────────────────────────────────
      fragments.push({
        sourceId:  this.id,
        type:      'project',
        content:   `${project.name}: ${project.vision}${project.currentState ? `. Status: ${project.currentState}` : ''}`,
        relevance: score,
        entityId:  project.id,
        metadata: {
          projectId:    project.id,
          projectName:  project.name,
          vision:       project.vision,
          currentState: project.currentState,
        },
      })

      // ── Decisions ───────────────────────────────────────────────────────
      // Always include if intent is 'decisions'; otherwise only keyword-matched ones.
      const wantsDecisions = query.intent.has('decisions') || query.intent.has('general')
      if (wantsDecisions && project.decisions.length > 0) {
        const decisions = query.intent.has('decisions')
          ? project.decisions                           // return all when explicitly asking
          : project.decisions.filter(d =>
              this.textMatchesAny(`${d.title} ${d.reasoning}`, query.normalizedTerms)
            )

        decisions.slice(0, MAX_DECISIONS_PER_P).forEach(d => {
          fragments.push({
            sourceId:  this.id,
            type:      'decision',
            content:   `[${project.name}] ${d.title}${d.reasoning ? ` — ${d.reasoning}` : ''}`,
            relevance: score,
            entityId:  d.id,
            metadata: {
              projectId:   project.id,
              projectName: project.name,
              title:       d.title,
              reasoning:   d.reasoning,
              createdAt:   d.createdAt,
            },
          })
        })
      }

      // ── Blockers ────────────────────────────────────────────────────────
      if (query.intent.has('blockers') || query.intent.has('general')) {
        project.blockers.forEach(b => {
          if (
            query.intent.has('blockers') ||
            this.textMatchesAny(b, query.normalizedTerms)
          ) {
            fragments.push({
              sourceId:  this.id,
              type:      'blocker',
              content:   `[${project.name}] Blocked: ${b}`,
              relevance: score * 0.9,
              entityId:  project.id,
              metadata:  { projectId: project.id, projectName: project.name },
            })
          }
        })
      }

      // ── In-progress work ────────────────────────────────────────────────
      if (query.intent.has('current_work') || query.intent.has('general')) {
        project.inProgressWork.forEach(w => {
          if (
            query.intent.has('current_work') ||
            this.textMatchesAny(w, query.normalizedTerms)
          ) {
            fragments.push({
              sourceId:  this.id,
              type:      'work_item',
              content:   `[${project.name}] In progress: ${w}`,
              relevance: score * 0.85,
              entityId:  project.id,
              metadata:  { projectId: project.id, projectName: project.name },
            })
          }
        })
      }
    }

    // ── Recent context versions ──────────────────────────────────────────
    if (this.needsVersions(query) && allVersions.length > 0) {
      const projectIndex = new Map(projects.map(p => [p.id, p]))
      const cutoffMs     = this.cutoffMs(query)

      const recent = allVersions
        .filter(v => v.createdAt >= cutoffMs && v.trigger === 'user_update')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_CONTEXT_VERSIONS)

      recent.forEach(v => {
        const p = projectIndex.get(v.projectId)
        fragments.push({
          sourceId:  this.id,
          type:      'context_version',
          content:   `[${p?.name ?? 'Unknown'}] v${v.version}: ${v.summary}`,
          relevance: 0.80,
          entityId:  v.id,
          metadata: {
            projectId:   v.projectId,
            projectName: p?.name ?? 'Unknown',
            version:     v.version,
            createdAt:   v.createdAt,
            diff:        v.diff,
          },
        })
      })
    }

    return fragments
  }

  // ── Scoring ──────────────────────────────────────────────────────────────

  private scoreProject(project: Project, query: ParsedQuery): number {
    // Empty keyword list → broad query; return all projects with low base score
    if (query.normalizedTerms.length === 0) return 0.4

    const corpus = [
      project.name,
      project.vision,
      project.currentState,
      ...project.decisions.map(d => `${d.title} ${d.reasoning}`),
      ...project.inProgressWork,
      ...project.nextSteps,
      ...project.blockers,
    ].join(' ').toLowerCase()

    const matched = query.normalizedTerms.filter(t => corpus.includes(t)).length
    if (matched === 0) return 0

    // Score = fraction of query terms that appear in the project corpus
    return matched / query.normalizedTerms.length
  }

  private textMatchesAny(text: string, terms: string[]): boolean {
    if (terms.length === 0) return true
    const lower = text.toLowerCase()
    return terms.some(t => lower.includes(t))
  }

  private needsVersions(query: ParsedQuery): boolean {
    return query.intent.has('recent_changes')
  }

  private cutoffMs(query: ParsedQuery): number {
    const days = query.timeFilter?.days ?? 7
    return Date.now() - days * 86_400_000
  }
}
