import { ollamaService, EXTRACTION_TIMEOUT } from '../../services/OllamaService'
import { logger }         from '../../lib/logger'
import type { Project, ProjectUpdateDraft } from './types'

const CONFIDENT_THRESHOLD = 0.80  // apply immediately
const STORE_THRESHOLD     = 0.60  // store as pending for review; below → discard

const SYSTEM_PROMPT = `You are Piku's project tracking system. Analyze this conversation for project-related information.

You will receive a list of existing tracked projects. Detect:
- Completed work ("we finished X", "X is done", "shipped X")
- Work in progress ("working on X", "building X", "currently doing X")
- Next steps ("we'll do X next", "planning to X", "after this we should X")
- Blockers ("blocked on X", "waiting for X", "can't proceed until X")
- Decisions made ("we decided to X", "we chose X over Y because Z")
- Status changes ("X is now in Y phase", "moving on to X")
- New projects mentioned for the first time

Rules:
- Only extract explicitly stated information
- Do not infer or assume
- Set confidence 0.9+ only when the user directly and clearly stated the fact
- Set confidence 0.7–0.89 for clearly implied updates
- Set confidence 0.6–0.69 for likely but not certain updates
- Return [] if no project-related information was discussed

For existing projects: use the index number from the list (0-based).
For new projects: use projectIndex -1.

Return a JSON array only. No markdown, no explanation.
Schema: [{"projectIndex":0,"isNew":false,"confidence":0.0,"completedWork":[],"inProgressWork":[],"nextSteps":[],"blockers":[],"currentState":"","decisions":[{"title":"","reasoning":"","alternatives":[]}]}]
Omit fields that have no updates. Omit "decisions" if none were made.`

// Prompt used by extractFromContent() — targets a single known project
// rather than a list, and accepts raw content rather than a conversation turn.
const CONTENT_SYSTEM_PROMPT = `You are analyzing content to update a project's records.
The content may be an exported AI conversation, meeting notes, decisions, or summaries.

Extract ONLY information explicitly stated in the content about the specified project:
- Decisions made ("decided to use X", "will use X", "chose X", "approach: X")
- Work completed ("done", "finished", "implemented", "shipped")
- Work in progress ("working on", "currently building", "implementing")
- Next steps ("next: X", "will do X next", "plan to X", "TODO")
- Blockers ("blocked by X", "waiting for X", "can't proceed until")
- Status/phase changes

Rules:
- Be literal. Only extract what is explicitly stated. Never infer.
- Decisions must represent a clear choice made, not options being discussed.
- Confidence 0.95 for direct explicit statements.
- Confidence 0.80–0.94 for clearly implied facts.
- If nothing project-relevant is found, return exactly: {"hasChanges":false}

Return JSON only. No markdown. No explanation.
Schema:
{
  "hasChanges": true,
  "confidence": 0.9,
  "currentState": "",
  "completedWork": [],
  "inProgressWork": [],
  "nextSteps": [],
  "blockers": [],
  "decisions": [{"title":"","reasoning":"","alternatives":[]}]
}
Only include fields with actual values. Omit empty arrays.`

export class ProjectExtractionService {
  async extract(
    userMessage: string,
    pikuResponse: string,
    existingProjects: Project[],
  ): Promise<ProjectUpdateDraft[]> {
    logger.project('extraction start', {
      userChars:     userMessage.length,
      existingCount: existingProjects.length,
    })

    const projectList = existingProjects.length > 0
      ? existingProjects.map((p, i) => `[${i}] ${p.name} — ${p.vision}`).join('\n')
      : 'none'

    const userContent =
      `Tracked projects:\n${projectList}\n\n` +
      `Conversation:\nUser: ${userMessage}\nPiku: ${pikuResponse}`

    let raw: string
    try {
      raw = await ollamaService.chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userContent   },
        ],
        0.0,
        EXTRACTION_TIMEOUT,
      )
    } catch (err) {
      logger.error('project extraction LLM call failed', { error: String(err) })
      return []
    }

    const drafts = this.parse(raw, existingProjects.length)
    logger.project('extraction result', {
      total:     drafts.length,
      confident: drafts.filter(d => d.confidence >= CONFIDENT_THRESHOLD).length,
      pending:   drafts.filter(d => d.confidence >= STORE_THRESHOLD && d.confidence < CONFIDENT_THRESHOLD).length,
      discarded: drafts.filter(d => d.confidence < STORE_THRESHOLD).length,
    })
    return drafts
  }

  // Extracts a ProjectUpdateDraft from raw user-provided content targeting
  // a single known project. Returns null if no relevant information is found.
  async extractFromContent(
    rawContent: string,
    project:    Project,
  ): Promise<ProjectUpdateDraft | null> {
    logger.project('extractFromContent start', {
      projectName:  project.name,
      contentChars: rawContent.length,
    })

    const userContent =
      `Project: ${project.name}\n` +
      `Description: ${project.vision}\n\n` +
      `Content:\n${rawContent}`

    let raw: string
    try {
      raw = await ollamaService.chat(
        [
          { role: 'system', content: CONTENT_SYSTEM_PROMPT },
          { role: 'user',   content: userContent           },
        ],
        0.0,
        EXTRACTION_TIMEOUT,
      )
    } catch (err) {
      logger.error('extractFromContent LLM call failed', { error: String(err) })
      return null
    }

    try {
      const cleaned = raw
        .replace(/^```[a-z]*\n?/m, '')
        .replace(/```$/m, '')
        .trim()

      const parsed = JSON.parse(cleaned) as Record<string, unknown>

      if (parsed.hasChanges === false) {
        logger.project('extractFromContent: no changes found')
        return null
      }

      const draft: ProjectUpdateDraft = {
        projectIndex: 0,
        isNew:        false,
        confidence:   typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.9,
      }

      if (typeof parsed.currentState === 'string' && parsed.currentState.trim())
        draft.currentState = parsed.currentState.trim()
      if (Array.isArray(parsed.completedWork))
        draft.completedWork  = (parsed.completedWork  as unknown[]).map(String).filter(Boolean)
      if (Array.isArray(parsed.inProgressWork))
        draft.inProgressWork = (parsed.inProgressWork as unknown[]).map(String).filter(Boolean)
      if (Array.isArray(parsed.nextSteps))
        draft.nextSteps  = (parsed.nextSteps  as unknown[]).map(String).filter(Boolean)
      if (Array.isArray(parsed.blockers))
        draft.blockers   = (parsed.blockers   as unknown[]).map(String).filter(Boolean)
      if (Array.isArray(parsed.decisions))
        draft.decisions = (parsed.decisions as Record<string, unknown>[])
          .filter(d => typeof d.title === 'string' && (d.title as string).trim())
          .map(d => ({
            title:        (d.title     as string).trim(),
            reasoning:    typeof d.reasoning === 'string' ? (d.reasoning as string).trim() : '',
            alternatives: Array.isArray(d.alternatives)
              ? (d.alternatives as unknown[]).map(String)
              : [],
          }))

      logger.project('extractFromContent result', {
        decisions:  (draft.decisions?.length   ?? 0),
        confidence: draft.confidence,
      })
      return draft
    } catch (err) {
      logger.warn('extractFromContent parse failed', {
        error: String(err),
        raw:   raw.slice(0, 200),
      })
      return null
    }
  }

  isConfident(draft: ProjectUpdateDraft): boolean {
    return draft.confidence >= CONFIDENT_THRESHOLD
  }

  shouldStore(draft: ProjectUpdateDraft): boolean {
    return draft.confidence >= STORE_THRESHOLD && draft.confidence < CONFIDENT_THRESHOLD
  }

  private parse(text: string, projectCount: number): ProjectUpdateDraft[] {
    try {
      const cleaned = text
        .replace(/^```[a-z]*\n?/m, '')
        .replace(/```$/m, '')
        .trim()

      const parsed: unknown = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) return []

      return parsed
        .filter((item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null &&
          typeof item.projectIndex === 'number' &&
          typeof item.confidence   === 'number' &&
          (item.projectIndex === -1 ||
            (item.projectIndex >= 0 && item.projectIndex < projectCount))
        )
        .map(item => {
          const isNew = (item.projectIndex as number) === -1
          const draft: ProjectUpdateDraft = {
            projectIndex: item.projectIndex as number,
            isNew,
            confidence: Math.max(0, Math.min(1, item.confidence as number)),
          }
          if (isNew) {
            if (typeof item.name    === 'string') draft.name    = item.name.trim()
            if (typeof item.vision  === 'string') draft.vision  = item.vision.trim()
          }
          if (typeof item.currentState === 'string' && item.currentState.trim())
            draft.currentState = item.currentState.trim()
          if (Array.isArray(item.completedWork))
            draft.completedWork = (item.completedWork as unknown[]).map(String).filter(Boolean)
          if (Array.isArray(item.inProgressWork))
            draft.inProgressWork = (item.inProgressWork as unknown[]).map(String).filter(Boolean)
          if (Array.isArray(item.nextSteps))
            draft.nextSteps = (item.nextSteps as unknown[]).map(String).filter(Boolean)
          if (Array.isArray(item.blockers))
            draft.blockers = (item.blockers as unknown[]).map(String).filter(Boolean)
          if (Array.isArray(item.decisions))
            draft.decisions = (item.decisions as Record<string, unknown>[])
              .filter(d => typeof d.title === 'string' && d.title.trim())
              .map(d => ({
                title:        (d.title        as string) .trim(),
                reasoning:    typeof d.reasoning === 'string' ? d.reasoning.trim() : '',
                alternatives: Array.isArray(d.alternatives)
                  ? (d.alternatives as unknown[]).map(String)
                  : [],
              }))
          return draft
        })
    } catch (err) {
      logger.warn('project extraction parse failed', { error: String(err) })
      return []
    }
  }
}
