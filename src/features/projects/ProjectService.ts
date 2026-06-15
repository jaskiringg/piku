import { logger }                   from '../../lib/logger'
import { ollamaService }             from '../../services/OllamaService'
import type { Project, Decision, ProjectUpdateDraft, PendingProjectUpdate } from './types'
import { ProjectStore }              from './ProjectStore'
import { ProjectExtractionService }  from './ProjectExtractionService'
import { ProjectRetrievalService }   from './ProjectRetrievalService'

export class ProjectService {
  private store     = new ProjectStore()
  private extractor = new ProjectExtractionService()
  private retrieval = new ProjectRetrievalService(this.store)

  // ── Public API ─────────────────────────────────────────────────────────────

  async createProject(
    name: string,
    vision: string,
    currentState = 'Planning',
  ): Promise<Project> {
    const now     = Date.now()
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      vision,
      currentState,
      completedWork:  [],
      inProgressWork: [],
      nextSteps:      [],
      decisions:      [],
      blockers:       [],
      research:       [],
      createdAt: now,
      updatedAt: now,
    }
    // Generate embedding immediately
    project.embedding = await this.generateEmbedding(project)
    await this.store.save(project)
    logger.project('project created', { id: project.id, name })
    return project
  }

  async updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project | null> {
    const existing = await this.store.getById(id)
    if (!existing) {
      logger.warn('updateProject: not found', { id })
      return null
    }
    const updated: Project = { ...existing, ...patch, updatedAt: Date.now() }
    // Re-embed if name, vision, or state changed
    if (patch.name || patch.vision || patch.currentState) {
      updated.embedding = await this.generateEmbedding(updated)
    }
    await this.store.save(updated)
    logger.project('project updated', { id, fields: Object.keys(patch) })
    return updated
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.store.getById(id)
  }

  async getAllProjects(): Promise<Project[]> {
    return this.store.getAll()
  }

  async deleteProject(id: string): Promise<void> {
    await this.store.delete(id)
    logger.project('project deleted', { id })
  }

  // Returns formatted project context for the system prompt.
  async retrieveProjectContext(query: string): Promise<string> {
    try {
      return await this.retrieval.retrieveContext(query)
    } catch (err) {
      logger.warn('retrieveProjectContext failed', { error: String(err) })
      return ''
    }
  }

  // Run after every Piku response. Never throws.
  async processConversation(userMessage: string, pikuResponse: string): Promise<void> {
    try {
      const projects = await this.store.getAll()
      const drafts   = await this.extractor.extract(userMessage, pikuResponse, projects)

      await Promise.all(drafts.map(draft => this.applyDraft(draft, projects, { userMessage, pikuResponse })))
    } catch (err) {
      logger.error('processConversation failed', { error: String(err) })
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async applyDraft(
    draft: ProjectUpdateDraft,
    projects: Project[],
    conversation: { userMessage: string; pikuResponse: string },
  ): Promise<void> {
    if (draft.confidence < 0.60) {
      logger.project('draft discarded — below threshold', {
        confidence:  draft.confidence,
        projectIndex: draft.projectIndex,
      })
      return
    }

    // Uncertain: store for review rather than apply
    if (this.extractor.shouldStore(draft)) {
      const existingProject = !draft.isNew && draft.projectIndex >= 0
        ? projects[draft.projectIndex]
        : null
      await this.storePending(draft, existingProject?.id ?? null, conversation)
      return
    }

    // Confident: apply immediately
    if (draft.isNew) {
      await this.applyNewProject(draft)
    } else {
      const project = projects[draft.projectIndex]
      if (!project) return
      await this.applyUpdate(project, draft)
    }
  }

  private async applyNewProject(draft: ProjectUpdateDraft): Promise<void> {
    if (!draft.name) {
      logger.warn('new project draft missing name — skipping', { confidence: draft.confidence })
      return
    }
    const project = await this.createProject(
      draft.name,
      draft.vision ?? '',
      draft.currentState ?? 'Planning',
    )
    // Apply remaining fields
    const patch: Partial<Project> = {}
    if (draft.nextSteps?.length)     patch.nextSteps     = draft.nextSteps
    if (draft.inProgressWork?.length) patch.inProgressWork = draft.inProgressWork
    if (draft.blockers?.length)       patch.blockers      = draft.blockers
    if (Object.keys(patch).length)   await this.updateProject(project.id, patch)
    logger.project('new project created from conversation', { name: draft.name, confidence: draft.confidence })
  }

  private async applyUpdate(project: Project, draft: ProjectUpdateDraft): Promise<void> {
    const patch: Partial<Project> = {}

    if (draft.currentState) patch.currentState = draft.currentState

    // Append completed work — deduplicate
    if (draft.completedWork?.length) {
      const existing = new Set(project.completedWork)
      const newItems = draft.completedWork.filter(w => !existing.has(w))
      if (newItems.length) patch.completedWork = [...project.completedWork, ...newItems]
    }

    // Replace in-progress and next steps (LLM provides the current state)
    if (draft.inProgressWork?.length) patch.inProgressWork = draft.inProgressWork
    if (draft.nextSteps?.length)       patch.nextSteps      = draft.nextSteps

    // Append new blockers
    if (draft.blockers?.length) {
      const existing = new Set(project.blockers)
      const newItems = draft.blockers.filter(b => !existing.has(b))
      if (newItems.length) patch.blockers = [...project.blockers, ...newItems]
    }

    // Append decisions
    if (draft.decisions?.length) {
      const newDecisions: Decision[] = draft.decisions.map(d => ({
        id:           crypto.randomUUID(),
        title:        d.title,
        reasoning:    d.reasoning,
        alternatives: d.alternatives,
        createdAt:    Date.now(),
      }))
      patch.decisions = [...project.decisions, ...newDecisions]
    }

    if (Object.keys(patch).length === 0) return
    await this.updateProject(project.id, patch)
    logger.project('project updated from conversation', {
      id:         project.id,
      name:       project.name,
      fields:     Object.keys(patch),
      confidence: draft.confidence,
    })
  }

  private async storePending(
    draft: ProjectUpdateDraft,
    projectId: string | null,
    conversation: { userMessage: string; pikuResponse: string },
  ): Promise<void> {
    const pending: PendingProjectUpdate = {
      id:         crypto.randomUUID(),
      projectId,
      draft,
      conversation: { user: conversation.userMessage, piku: conversation.pikuResponse },
      confidence:  draft.confidence,
      createdAt:   Date.now(),
    }
    await this.store.savePending(pending)
    logger.project('uncertain update stored as pending', {
      projectId,
      confidence: draft.confidence,
    })
  }

  private async generateEmbedding(project: Project): Promise<Float32Array | undefined> {
    try {
      const text = `${project.name}: ${project.vision}. ${project.currentState}`
      const raw  = await ollamaService.embed(text)
      return new Float32Array(raw)
    } catch {
      return undefined
    }
  }
}
