import { ollamaService }  from '../../services/OllamaService'
import { logger }          from '../../lib/logger'
import type { Project }    from './types'
import { ProjectStore }    from './ProjectStore'
import { cosineSimilarity } from '../memory/_math'

// Below this count, return all projects (no embedding needed)
const ALWAYS_RETURN_ALL_BELOW = 4
const TOP_K                   = 3
const MIN_SIMILARITY          = 0.20  // lower than memory — projects are broad

export class ProjectRetrievalService {
  constructor(private store: ProjectStore) {}

  // Returns formatted context string for the system prompt, or '' if no projects exist.
  async retrieveContext(query: string): Promise<string> {
    const projects = await this.store.getAll()

    if (projects.length === 0) {
      logger.project('no projects in store')
      return ''
    }

    let selected: Project[]

    if (projects.length <= ALWAYS_RETURN_ALL_BELOW) {
      // Cheap path: too few projects to bother with embeddings
      selected = projects
      logger.project('retrieval: returning all (small set)', { count: projects.length })
    } else {
      // Semantic path: embed query, compare against project embeddings
      selected = await this.semanticSelect(query, projects)
    }

    return this.formatContext(selected)
  }

  private async semanticSelect(query: string, projects: Project[]): Promise<Project[]> {
    let queryVec: Float32Array
    try {
      const raw = await ollamaService.embed(query)
      queryVec  = new Float32Array(raw)
    } catch (err) {
      logger.error('project retrieval embed failed — returning most recent', { error: String(err) })
      return projects.slice(0, TOP_K)
    }

    // Lazily ensure each project has an embedding; update IDB if missing
    const embedded = await Promise.all(projects.map(p => this.ensureEmbedding(p)))

    const scored = embedded
      .map(p => ({
        project:    p,
        similarity: p.embedding ? cosineSimilarity(queryVec, p.embedding) : 0,
      }))
      .filter(r => r.similarity >= MIN_SIMILARITY)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, TOP_K)

    if (scored.length === 0) {
      // Nothing similar — fall back to most recently updated
      logger.project('retrieval: no similar projects, using recent', { count: TOP_K })
      return projects.slice(0, TOP_K)
    }

    logger.project('retrieval: selected', {
      count:   scored.length,
      topSim:  Number(scored[0].similarity.toFixed(3)),
      topName: scored[0].project.name,
    })
    return scored.map(r => r.project)
  }

  // Generates and saves an embedding for a project that doesn't have one yet.
  async ensureEmbedding(project: Project): Promise<Project> {
    if (project.embedding) return project
    try {
      const text = `${project.name}: ${project.vision}. ${project.currentState}`
      const raw  = await ollamaService.embed(text)
      const updated: Project = { ...project, embedding: new Float32Array(raw) }
      await this.store.save(updated)
      logger.project('embedding generated', { name: project.name })
      return updated
    } catch {
      return project  // proceed without embedding; retrieval degrades gracefully
    }
  }

  private formatContext(projects: Project[]): string {
    const blocks = projects.map(p => {
      const lines = [`${p.name}`]
      lines.push(`Vision: ${p.vision}`)
      if (p.currentState)          lines.push(`Status: ${p.currentState}`)
      if (p.inProgressWork.length) lines.push(`In Progress: ${p.inProgressWork.slice(0, 3).join(', ')}`)
      if (p.nextSteps.length)      lines.push(`Next: ${p.nextSteps.slice(0, 3).join(', ')}`)
      if (p.blockers.length)       lines.push(`Blockers: ${p.blockers.slice(0, 2).join(', ')}`)
      if (p.decisions.length > 0) {
        lines.push(`Decisions:`)
        p.decisions.slice(0, 5).forEach(d => {
          const reasoning = d.reasoning ? `: ${d.reasoning}` : ''
          lines.push(`  - ${d.title}${reasoning}`)
        })
      }
      return lines.join('\n')
    })

    return `Active Projects:\n\n${blocks.join('\n\n')}`
  }
}
