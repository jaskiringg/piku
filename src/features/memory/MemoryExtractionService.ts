import { ollamaService } from '../../services/OllamaService'
import { logger }         from '../../lib/logger'
import type { ExtractionCandidate, MemoryCategory } from './types'

const VALID_CATEGORIES = new Set<string>([
  'personal_fact', 'relationship', 'preference', 'long_term_goal',
  'ongoing_project', 'important_date', 'user_correction', 'recurring_habit',
  'achievement', 'skill', 'career', 'health_preference', 'location',
])

const SYSTEM_PROMPT = `You are Piku's memory extraction system. Extract factual memories about the user from this conversation.

Rules:
- Only extract facts the user explicitly stated
- Do not infer or assume anything beyond what was said
- Skip temporary states ("feeling tired today", "busy right now")
- Capture durable facts worth remembering for months
- Return [] if nothing is worth storing

Categories:
- personal_fact    — name, age, family members, life events
- relationship     — partner, friends, pets, family dynamics
- preference       — likes, dislikes, tastes, habits
- long_term_goal   — ambitions, life goals, future plans
- ongoing_project  — active work, side projects, things in progress
- important_date   — birthdays, anniversaries, deadlines
- user_correction  — when the user corrects Piku ("actually..." / "no, that's wrong")
- recurring_habit  — things the user does regularly
- achievement      — accomplishments, milestones reached
- skill            — abilities, expertise, things the user knows how to do
- career           — job, company, role, professional context
- health_preference— dietary needs, exercise habits, medical considerations
- location         — where the user lives, works, or is from

Return a JSON array only. No markdown, no explanation.
Schema: [{"category":"...","content":"...","confidence":0.0,"tags":["..."]}]
Confidence: 0.9+ = explicitly stated, 0.7–0.89 = clearly implied, below 0.7 = omit`

export class MemoryExtractionService {
  async extract(
    userMessage: string,
    pikuResponse: string,
  ): Promise<ExtractionCandidate[]> {
    logger.memory('extraction start', {
      userChars: userMessage.length,
      pikuChars:  pikuResponse.length,
    })

    const conversation = `User: ${userMessage}\nPiku: ${pikuResponse}`

    let raw: string
    try {
      raw = await ollamaService.chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: conversation   },
        ],
        0.0,
      )
    } catch (err) {
      logger.error('extraction LLM call failed', { error: String(err) })
      return []
    }

    const candidates = this.parse(raw)
    logger.memory('extraction result', {
      candidates: candidates.length,
      categories: candidates.map(c => c.category),
      confidences: candidates.map(c => c.confidence),
    })
    return candidates
  }

  private parse(text: string): ExtractionCandidate[] {
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
          typeof item.category   === 'string' && VALID_CATEGORIES.has(item.category) &&
          typeof item.content    === 'string' && (item.content as string).trim().length > 0 &&
          typeof item.confidence === 'number'
        )
        .map(item => ({
          category:   item.category as MemoryCategory,
          content:    (item.content as string).trim(),
          confidence: Math.max(0, Math.min(1, item.confidence as number)),
          tags: Array.isArray(item.tags) ? (item.tags as unknown[]).map(String) : [],
        }))
    } catch (err) {
      logger.warn('extraction parse failed — bad JSON from LLM', { error: String(err) })
      return []
    }
  }
}
