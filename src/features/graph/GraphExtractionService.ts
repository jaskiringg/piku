import { ollamaService, EXTRACTION_TIMEOUT } from '../../services/OllamaService'
import { logger }         from '../../lib/logger'
import type { GraphNode, GraphExtractionItem, GraphRelationship, GraphNodeType } from './types'

// Edges extracted with confidence ≥ this are confirmed immediately
export const CONFIRM_THRESHOLD = 0.85
// Edges with confidence in [STORE_THRESHOLD, CONFIRM_THRESHOLD) are stored as pending
export const STORE_THRESHOLD   = 0.65

const VALID_RELATIONSHIPS = new Set<string>([
  'depends_on', 'supports', 'blocks', 'caused_by', 'related_to', 'owned_by', 'part_of',
  'uses', 'supersedes', 'implements',
])
const VALID_NODE_TYPES = new Set<string>([
  'project', 'goal', 'skill', 'person', 'memory', 'decision', 'repository', 'technology',
])

const SYSTEM_PROMPT = `You are Piku's relationship extraction system. Detect relationships between concepts in this conversation.

Node types:
- project    — an active initiative or product being built (e.g. "Piku", "OAuth Migration")
- goal       — a desired outcome or milestone (e.g. "ship Git Observer", "reduce latency")
- skill      — a human capability or professional ability (e.g. "frontend development", "TypeScript proficiency", "system design")
- technology — a tool, language, framework, protocol, or platform (e.g. "TypeScript", "React", "Ollama", "OAuth 2.0", "Tauri", "IndexedDB")
- person     — a person referenced in the conversation
- memory     — a significant past event or fact
- decision   — a choice that was made (e.g. "use IndexedDB over SQLite", "local-first architecture")
- repository — a code repository or codebase (e.g. "piku repo", "auth-service")

Important: use "technology" for tools, languages, and frameworks — NOT "skill". Use "skill" only for human abilities.

Relationship types:
- depends_on   — A cannot proceed without B ("we need X before Y")
- supports     — A helps or enables B ("X is useful for Y")
- blocks       — A is preventing B ("X is blocking Y")
- caused_by    — A resulted from B
- related_to   — A and B are connected but no stronger relationship applies
- owned_by     — A belongs to or is managed by B (usually a person)

Known nodes (reference by index for existing; use -1 for new):
{NODES}

Rules:
- Only extract relationships explicitly stated or very clearly implied
- Confidence 0.9+ = directly stated ("we need X for Y")
- Confidence 0.8–0.89 = strongly implied
- Confidence 0.65–0.79 = plausible but uncertain (will be stored as pending, not applied)
- Below 0.65 = do not include
- Never hallucinate relationships
- fromNode and toNode BOTH require index + type + name if new (index === -1)
- For existing nodes, index alone is sufficient

Return a JSON array only. No markdown.
Schema: [{"confidence":0.0,"fromNode":{"index":-1,"type":"technology","name":"TypeScript"},"relationship":"supports","toNode":{"index":0}}]
Return [] if no relationships detected.`

export class GraphExtractionService {
  async extract(
    userMessage: string,
    pikuResponse: string,
    existingNodes: GraphNode[],
  ): Promise<GraphExtractionItem[]> {
    logger.project('graph extraction start', {
      userChars: userMessage.length,
      nodes:     existingNodes.length,
    })

    const nodeList = existingNodes.length > 0
      ? existingNodes.map((n, i) => `[${i}] ${n.type}: "${n.name}"`).join('\n')
      : 'none yet'

    const prompt = SYSTEM_PROMPT.replace('{NODES}', nodeList)
    const conversation = `User: ${userMessage}\nPiku: ${pikuResponse}`

    let raw: string
    try {
      raw = await ollamaService.chat(
        [
          { role: 'system', content: prompt      },
          { role: 'user',   content: conversation },
        ],
        0.0,
        EXTRACTION_TIMEOUT,
      )
    } catch (err) {
      logger.error('graph extraction LLM call failed', { error: String(err) })
      return []
    }

    const items = this.parse(raw, existingNodes.length)
    logger.project('graph extraction result', {
      total:     items.length,
      confirmed: items.filter(i => i.confidence >= CONFIRM_THRESHOLD).length,
      pending:   items.filter(i => i.confidence >= STORE_THRESHOLD && i.confidence < CONFIRM_THRESHOLD).length,
    })
    return items
  }

  private parse(text: string, nodeCount: number): GraphExtractionItem[] {
    try {
      const cleaned = text
        .replace(/^```[a-z]*\n?/m, '')
        .replace(/```$/m, '')
        .trim()

      const parsed: unknown = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) return []

      const results: GraphExtractionItem[] = []

      for (const raw of parsed) {
        if (typeof raw !== 'object' || raw === null) continue
        const item = raw as Record<string, unknown>

        const confidence = typeof item.confidence === 'number'
          ? Math.max(0, Math.min(1, item.confidence))
          : 0
        if (confidence < STORE_THRESHOLD) continue

        if (typeof item.relationship !== 'string' || !VALID_RELATIONSHIPS.has(item.relationship)) continue

        const from = this.parseNodeRef(item.fromNode, nodeCount)
        const to   = this.parseNodeRef(item.toNode, nodeCount)
        if (!from || !to) continue
        // Self-loops are meaningless
        if (from.index !== -1 && from.index === to.index) continue

        results.push({
          confidence,
          fromNode:     from,
          relationship: item.relationship as GraphRelationship,
          toNode:       to,
        })
      }

      return results
    } catch (err) {
      logger.warn('graph extraction parse failed', { error: String(err) })
      return []
    }
  }

  private parseNodeRef(
    raw: unknown,
    nodeCount: number,
  ): GraphExtractionItem['fromNode'] | null {
    if (typeof raw !== 'object' || raw === null) return null
    const obj = raw as Record<string, unknown>

    const index = typeof obj.index === 'number' ? Math.round(obj.index) : null
    if (index === null) return null

    if (index === -1) {
      // New node — type and name are required
      if (typeof obj.type !== 'string' || !VALID_NODE_TYPES.has(obj.type)) return null
      if (typeof obj.name !== 'string' || !obj.name.trim()) return null
      return {
        index:    -1,
        type:     obj.type as GraphNodeType,
        name:     obj.name.trim(),
        metadata: typeof obj.metadata === 'object' && obj.metadata !== null
          ? obj.metadata as Record<string, unknown>
          : {},
      }
    }

    if (index < 0 || index >= nodeCount) return null
    return { index }
  }
}
