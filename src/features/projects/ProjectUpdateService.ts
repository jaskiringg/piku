import { logger }                  from '../../lib/logger'
import type {
  Project, Decision,
  ProjectUpdateDraft, ReviewableDiff,
  ProjectSnapshot,
} from './types'
import { ProjectService }          from './ProjectService'
import { ProjectExtractionService } from './ProjectExtractionService'
import { ContextVersionStore }     from './ContextVersionStore'

export class ProjectUpdateService {
  // Each ProjectUpdateService instance has its own service references.
  // All state lives in IDB so multiple instances share the same data.
  private readonly projects  = new ProjectService()
  private readonly extractor = new ProjectExtractionService()
  private readonly versions  = new ContextVersionStore()

  // ── Public API ─────────────────────────────────────────────────────────────

  // Step 1: extract and preview — returns what would change, for user review.
  // Returns null if the content contains nothing relevant to the project.
  async previewContextUpdate(
    projectId:  string,
    rawContent: string,
  ): Promise<ReviewableDiff | null> {
    const project = await this.projects.getProject(projectId)
    if (!project) {
      logger.warn('previewContextUpdate: project not found', { projectId })
      return null
    }

    const draft = await this.extractor.extractFromContent(rawContent, project)
    if (!draft) return null

    const diff = this.buildDiff(project, draft)
    if (!diff.hasChanges) return null

    return diff
  }

  // Step 2: apply — called only after user approves the diff.
  // Writes the patch to the projects store AND saves a ContextVersion.
  async applyApprovedDiff(
    projectId: string,
    diff:      ReviewableDiff,
  ): Promise<Project | null> {
    const project = await this.projects.getProject(projectId)
    if (!project) return null

    const draft = diff.draft

    // ── Build the patch ──────────────────────────────────────────────────────
    const patch: Partial<Project> = {}

    if (draft.currentState) patch.currentState = draft.currentState

    if (diff.newCompletedWork.length > 0)
      patch.completedWork = [...project.completedWork, ...diff.newCompletedWork]

    if (diff.newInProgressWork.length > 0)
      patch.inProgressWork = diff.newInProgressWork

    if (diff.newNextSteps.length > 0)
      patch.nextSteps = diff.newNextSteps

    if (diff.newBlockers.length > 0)
      patch.blockers = [...project.blockers, ...diff.newBlockers]

    if (diff.newDecisions.length > 0) {
      const newDecisions: Decision[] = diff.newDecisions.map(d => ({
        id:           crypto.randomUUID(),
        title:        d.title,
        reasoning:    d.reasoning,
        alternatives: draft.decisions?.find(
          rd => rd.title.toLowerCase().trim() === d.title.toLowerCase().trim()
        )?.alternatives ?? [],
        createdAt: Date.now(),
      }))
      patch.decisions = [...project.decisions, ...newDecisions]
    }

    if (Object.keys(patch).length === 0) return project

    const updatedProject = await this.projects.updateProject(projectId, patch)
    if (!updatedProject) return null

    // ── Context versioning ───────────────────────────────────────────────────
    await this.saveContextVersion(project, updatedProject, diff)

    logger.project('context update applied', {
      projectId,
      fields: Object.keys(patch),
    })

    return updatedProject
  }

  // ── Versioning ─────────────────────────────────────────────────────────────

  private async saveContextVersion(
    before:  Project,
    after:   Project,
    diff:    ReviewableDiff,
  ): Promise<void> {
    const existingCount = await this.versions.countForProject(before.id)
    const isFirst       = existingCount === 0

    if (isFirst) {
      // v1 = project state before this first update (captures the creation baseline)
      await this.versions.save({
        id:        crypto.randomUUID(),
        projectId: before.id,
        version:   1,
        createdAt: before.createdAt,
        trigger:   'project_created',
        summary:   'Project created',
        diff:      'Initial state',
        snapshot:  this.snapshotOf(before),
      })
    }

    const nextVersion = existingCount + (isFirst ? 2 : 1)
    const diffText    = this.buildDiffText(diff)

    await this.versions.save({
      id:        crypto.randomUUID(),
      projectId: after.id,
      version:   nextVersion,
      createdAt: Date.now(),
      trigger:   'user_update',
      summary:   diffText,
      diff:      diffText,
      snapshot:  this.snapshotOf(after),
    })

    logger.project('context version saved', {
      projectId: after.id,
      version:   nextVersion,
      summary:   diffText,
    })
  }

  // ── Diff construction ──────────────────────────────────────────────────────

  private buildDiff(project: Project, draft: ProjectUpdateDraft): ReviewableDiff {
    const existingDecisions  = new Set(project.decisions .map(d => d.title.toLowerCase().trim()))
    const existingCompleted  = new Set(project.completedWork.map(s => s.toLowerCase().trim()))
    const existingBlockers   = new Set(project.blockers   .map(s => s.toLowerCase().trim()))

    const newDecisions = (draft.decisions ?? [])
      .filter(d => !existingDecisions.has(d.title.toLowerCase().trim()))
      .map(d => ({ title: d.title, reasoning: d.reasoning }))

    const newCompletedWork = (draft.completedWork ?? [])
      .filter(w => !existingCompleted.has(w.toLowerCase().trim()))

    const newInProgressWork = draft.inProgressWork ?? []
    const newNextSteps      = draft.nextSteps      ?? []

    const newBlockers = (draft.blockers ?? [])
      .filter(b => !existingBlockers.has(b.toLowerCase().trim()))

    const stateChange = draft.currentState && draft.currentState !== project.currentState
      ? { from: project.currentState, to: draft.currentState }
      : null

    const hasChanges = (
      newDecisions.length      > 0 ||
      newCompletedWork.length  > 0 ||
      newInProgressWork.length > 0 ||
      newNextSteps.length      > 0 ||
      newBlockers.length       > 0 ||
      stateChange !== null
    )

    return {
      projectId:        project.id,
      projectName:      project.name,
      draft,
      newDecisions,
      newCompletedWork,
      newInProgressWork,
      newNextSteps,
      newBlockers,
      stateChange,
      hasChanges,
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private snapshotOf(project: Project): ProjectSnapshot {
    return {
      vision:         project.vision,
      currentState:   project.currentState,
      completedWork:  [...project.completedWork],
      inProgressWork: [...project.inProgressWork],
      nextSteps:      [...project.nextSteps],
      blockers:       [...project.blockers],
      decisions:      project.decisions.map(d => ({ ...d })),
    }
  }

  private buildDiffText(diff: ReviewableDiff): string {
    const parts: string[] = []

    if (diff.newDecisions.length > 0)
      parts.push(
        `Added decision${diff.newDecisions.length > 1 ? 's' : ''}: ` +
        diff.newDecisions.map(d => d.title).join('; ')
      )
    if (diff.newCompletedWork.length > 0)
      parts.push(`Completed: ${diff.newCompletedWork.join('; ')}`)
    if (diff.newInProgressWork.length > 0)
      parts.push(`In progress: ${diff.newInProgressWork.join('; ')}`)
    if (diff.newNextSteps.length > 0)
      parts.push(`Next steps: ${diff.newNextSteps.join('; ')}`)
    if (diff.newBlockers.length > 0)
      parts.push(`Blockers: ${diff.newBlockers.join('; ')}`)
    if (diff.stateChange)
      parts.push(`Status: ${diff.stateChange.from} → ${diff.stateChange.to}`)

    return parts.length > 0 ? parts.join('. ') : 'No changes'
  }
}
