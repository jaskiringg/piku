// Extracts graph entities and relationships from small document chunks.
// Uses focused, narrow prompts optimised for each chunk type.
// Full documents are NEVER sent — only chunks of ~150–600 chars.

import { ollamaService, EXTRACTION_TIMEOUT } from '../../services/OllamaService'
import { logger }                             from '../../lib/logger'
import type { GraphNodeType, GraphRelationship } from './types'
import type { DocumentChunk, ADRChunk }         from './DocumentChunker'

// ── Result types ──────────────────────────────────────────────────────────────

export interface ExtractedEntity {
  type:  GraphNodeType
  name:  string
  attrs: Record<string, unknown>
}

export interface ExtractedEdge {
  fromName:     string
  relationship: GraphRelationship
  toName:       string
  confidence:   number
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  edges:    ExtractedEdge[]
}

const EMPTY_RESULT: ExtractionResult = { entities: [], edges: [] }

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_NODE_TYPES = new Set<GraphNodeType>([
  'project', 'goal', 'skill', 'person', 'memory', 'decision',
  'repository', 'technology',
])

const VALID_RELATIONSHIPS = new Set<GraphRelationship>([
  'depends_on', 'supports', 'blocks', 'caused_by', 'related_to',
  'owned_by', 'uses', 'supersedes', 'implements', 'part_of',
])

// ── Prompts ───────────────────────────────────────────────────────────────────

// ADR-specific prompt — narrow schema, very literal.
// Input: one ADR block (~150–350 chars). Expected output: 1–5 entities, 1–5 edges.
// Expected LLM time: 15–45s (vs 100–300s for full document).
const ADR_SYSTEM_PROMPT = `You extract entities and relationships from a software Architecture Decision Record (ADR).

Extract:
- The decision itself (type: "decision")
- Technologies or tools explicitly named (type: "technology")
- Any project named (type: "project")

Only extract what is explicitly stated. Do not infer.

Relationship types: related_to, uses, supersedes, depends_on, implements

Schema (JSON only, no markdown):
{"entities":[{"type":"decision","name":"...","attrs":{"reasoning":"...","status":"active"}}],"edges":[{"fromName":"...","relationship":"uses","toName":"...","confidence":0.95}]}

Return {"entities":[],"edges":[]} if nothing to extract.`

// Generic section prompt for non-ADR chunks.
const SECTION_SYSTEM_PROMPT = `You extract entities and relationships from a software documentation section.

Entity types: project, goal, technology, decision, person, repository
Relationship types: related_to, uses, depends_on, supports, implements

Only extract what is explicitly stated. Do not infer.

Schema (JSON only, no markdown):
{"entities":[{"type":"technology","name":"...","attrs":{}}],"edges":[{"fromName":"...","relationship":"uses","toName":"...","confidence":0.9}]}

Return {"entities":[],"edges":[]} if nothing to extract.`

// ── Technology vocabulary ─────────────────────────────────────────────────────
// Used by the deterministic ADR extractor to identify technology entities.
// Matching strategy (PSP-02): aliases > 4 chars use substring matching;
// aliases ≤ 4 chars use word-boundary regex to prevent false positives
// (e.g. "ts" must not match inside "tts", "shortcuts", "its", "projects").

const KNOWN_TECHNOLOGIES: Array<{ name: string; category: string; aliases?: string[] }> = [
  { name: 'Tauri',           category: 'framework',  aliases: ['tauri'] },
  { name: 'Rust',            category: 'language',   aliases: ['rust'] },
  { name: 'WebView',         category: 'platform',   aliases: ['webview'] },
  { name: 'React',           category: 'framework',  aliases: ['react'] },
  { name: 'TypeScript',      category: 'language',   aliases: ['typescript', 'ts'] },
  { name: 'IndexedDB',       category: 'platform',   aliases: ['indexeddb', 'idb'] },
  { name: 'SQLite',          category: 'platform',   aliases: ['sqlite'] },
  { name: 'Ollama',          category: 'platform',   aliases: ['ollama'] },
  { name: 'qwen3:14b',       category: 'model',      aliases: ['qwen3'] },
  { name: 'nomic-embed-text',category: 'model',      aliases: ['nomic-embed-text', 'nomic'] },
  { name: 'Canvas',          category: 'platform',   aliases: ['canvas', '2d canvas'] },
  { name: 'WebGL',           category: 'platform',   aliases: ['webgl'] },
  { name: 'Electron',        category: 'framework',  aliases: ['electron'] },
  { name: 'Three.js',        category: 'framework',  aliases: ['three.js'] },
  { name: 'TailwindCSS',     category: 'framework',  aliases: ['tailwindcss', 'tailwind'] },
  { name: 'Framer Motion',   category: 'framework',  aliases: ['framer-motion', 'framer motion'] },
  { name: 'Vitest',          category: 'tool',       aliases: ['vitest'] },
  { name: 'Whisper',         category: 'model',      aliases: ['whisper'] },
  { name: 'Claude Code',     category: 'tool',       aliases: ['claude code'] },
]

// ── Alias matching ────────────────────────────────────────────────────────────

// Escapes characters that have special meaning in a RegExp pattern.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Returns true if `alias` matches as a whole token inside `searchText`.
// For aliases longer than 4 characters, plain substring matching is used.
// For aliases 4 characters or shorter, a word-boundary regex is required:
//   (?<![.\w])  — not preceded by a dot or word character
//   (?!\w)      — not followed by a word character
// This prevents "ts" from matching inside "tts", "shortcuts", "its",
// "projects", "index.ts", etc. (PSP-02).
function aliasMatches(searchText: string, alias: string): boolean {
  if (alias.length <= 4) {
    const pattern = new RegExp(`(?<![.\\w])${escapeRegex(alias)}(?!\\w)`, 'i')
    return pattern.test(searchText)
  }
  return searchText.includes(alias)
}

// ── EntityExtractor ───────────────────────────────────────────────────────────

export class EntityExtractor {

  // Extract from a single ADR chunk.
  // Fast path: deterministic extraction from the structured ADR format (no LLM).
  // This is required because qwen3:14b takes 100–300s per call on typical hardware
  // (measured: ADR chunks of 200–400 chars take 100s+ to process).
  // The ADR format is structured enough that rule-based extraction is accurate.
  // LLM path is available via extractFromADR_LLM() for unstructured content.
  async extractFromADR(adr: ADRChunk, _projectName: string): Promise<ExtractionResult> {
    logger.project('gdd: extractFromADR (deterministic)', { adrid: adr.adrid })

    const entities: ExtractedEntity[] = []
    const edges:    ExtractedEdge[]   = []

    // ── 1. Decision node from ADR title ──────────────────────────────────────
    const decisionName = `${adr.title}`
    const isSuperseded = adr.decision.toLowerCase().includes('superseded') ||
                         adr.reasoning.toLowerCase().includes('supersedes')
    entities.push({
      type:  'decision',
      name:  decisionName,
      attrs: {
        reasoning:  adr.reasoning || adr.decision,
        adrid:      adr.adrid,
        status:     isSuperseded ? 'superseded' : 'active',
        tradeoffs:  adr.tradeoffs ?? '',
        sourceDoc:  adr.sourceDoc,
      },
    })

    // ── 2. Technology nodes from vocabulary scan ──────────────────────────────
    const searchText = [adr.title, adr.decision, adr.reasoning, adr.tradeoffs ?? '']
      .join(' ').toLowerCase()

    const foundTechs: string[] = []
    for (const tech of KNOWN_TECHNOLOGIES) {
      const aliases = [tech.name.toLowerCase(), ...(tech.aliases ?? [])]
      if (aliases.some(a => aliasMatches(searchText, a))) {
        entities.push({
          type:  'technology',
          name:  tech.name,
          attrs: { category: tech.category, sourceDoc: adr.sourceDoc },
        })
        foundTechs.push(tech.name)
      }
    }

    // ── 3. Edges: decision → related_to/uses → each technology ───────────────
    for (const techName of foundTechs) {
      // If reasoning mentions the tech as a chosen solution → 'uses'
      // Otherwise → 'related_to'
      const chosenWords = ['chose', 'using', 'use', 'selected', 'built with', 'powered by']
      const rel: GraphRelationship = chosenWords.some(w => searchText.includes(w))
        ? 'uses'
        : 'related_to'
      edges.push({
        fromName:     decisionName,
        relationship: rel,
        toName:       techName,
        confidence:   0.9,
      })
    }

    // ── 4. Supersedes edge ────────────────────────────────────────────────────
    // ADR-008 and ADR-009 explicitly supersede earlier approaches.
    // The superseded entity (mock/no-persistence) also gets a decision node.
    if (adr.decision.toLowerCase().includes('supersede') || adr.title.toLowerCase().includes('supersedes')) {
      // Extract what is being superseded from title pattern "X (supersedes Y)"
      const supersedesMatch = /\(supersedes\s+([^)]+)\)/i.exec(adr.title)
      if (supersedesMatch) {
        const oldDecisionName = supersedesMatch[1].trim()
        entities.push({
          type:  'decision',
          name:  oldDecisionName,
          attrs: { status: 'superseded', sourceDoc: adr.sourceDoc },
        })
        edges.push({
          fromName:     decisionName,
          relationship: 'supersedes',
          toName:       oldDecisionName,
          confidence:   0.95,
        })
      }
    }

    logger.project('gdd: extractFromADR result', {
      adrid:    adr.adrid,
      entities: entities.length,
      edges:    edges.length,
    })

    return { entities, edges }
  }

  // LLM-based extraction for ADR chunks — available for use on faster hardware
  // or when deterministic extraction is insufficient.
  // Not used in Phase 1 validation test due to hardware timing constraints.
  async extractFromADR_LLM(adr: ADRChunk, projectName: string): Promise<ExtractionResult> {
    const userContent = [
      `${adr.adrid}: ${adr.title}`,
      `Project: ${projectName}`,
      adr.decision  ? `Decision: ${adr.decision}`  : '',
      adr.reasoning ? `Reasoning: ${adr.reasoning}` : '',
      adr.tradeoffs ? `Trade-off: ${adr.tradeoffs}` : '',
    ].filter(Boolean).join('\n')

    logger.project('gdd: extractFromADR_LLM start', {
      adrid: adr.adrid, chars: userContent.length,
    })

    const raw = await this.callLLM(ADR_SYSTEM_PROMPT, userContent)
    if (!raw) return EMPTY_RESULT

    const result = this.parse(raw) ?? this.parse(this.stripMarkdown(raw))
    if (!result) {
      logger.warn('gdd: extractFromADR_LLM parse failed', { adrid: adr.adrid, raw: raw.slice(0, 100) })
      return EMPTY_RESULT
    }

    logger.project('gdd: extractFromADR_LLM result', {
      adrid:    adr.adrid,
      entities: result.entities.length,
      edges:    result.edges.length,
    })
    return result
  }

  // Extract from a generic section chunk.
  async extractFromChunk(chunk: DocumentChunk, projectName: string): Promise<ExtractionResult> {
    const userContent = `Section: ${chunk.heading}\nProject: ${projectName}\n\n${chunk.content}`

    logger.project('gdd: extractFromChunk start', {
      heading: chunk.heading.slice(0, 40), chars: userContent.length,
    })

    const raw = await this.callLLM(SECTION_SYSTEM_PROMPT, userContent)
    if (!raw) return EMPTY_RESULT

    const result = this.parse(raw) ?? this.parse(this.stripMarkdown(raw))
    if (!result) {
      logger.warn('gdd: extractFromChunk parse failed', { heading: chunk.heading, raw: raw.slice(0, 100) })
      return EMPTY_RESULT
    }

    return result
  }

  // Extract from multiple ADR chunks with bounded concurrency.
  // Returns merged results — caller is responsible for dedup.
  async extractFromADRs(
    adrs:          ADRChunk[],
    projectName:   string,
    maxConcurrent: number = 3,
  ): Promise<ExtractionResult> {
    const allEntities: ExtractedEntity[] = []
    const allEdges:    ExtractedEdge[]   = []

    for (let i = 0; i < adrs.length; i += maxConcurrent) {
      const batch   = adrs.slice(i, i + maxConcurrent)
      const results = await Promise.all(
        batch.map(adr => this.extractFromADR(adr, projectName))
      )
      for (const r of results) {
        allEntities.push(...r.entities)
        allEdges.push(...r.edges)
      }
    }

    return { entities: allEntities, edges: allEdges }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async callLLM(system: string, user: string): Promise<string | null> {
    try {
      return await ollamaService.chat(
        [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
        0.0,
        EXTRACTION_TIMEOUT,
      )
    } catch (err) {
      logger.error('gdd: LLM call failed', { error: String(err) })
      return null
    }
  }

  private parse(raw: string): ExtractionResult | null {
    try {
      const json = JSON.parse(raw.trim())

      const entities: ExtractedEntity[] = []
      if (Array.isArray(json.entities)) {
        for (const e of json.entities) {
          if (typeof e !== 'object' || e === null) continue
          const type = e.type as string
          const name = typeof e.name === 'string' ? e.name.trim() : ''
          if (!name || !VALID_NODE_TYPES.has(type as GraphNodeType)) continue
          entities.push({
            type:  type as GraphNodeType,
            name,
            attrs: typeof e.attrs === 'object' && e.attrs !== null ? e.attrs as Record<string, unknown> : {},
          })
        }
      }

      const edges: ExtractedEdge[] = []
      if (Array.isArray(json.edges)) {
        for (const e of json.edges) {
          if (typeof e !== 'object' || e === null) continue
          const fromName = typeof e.fromName === 'string' ? e.fromName.trim() : ''
          const toName   = typeof e.toName   === 'string' ? e.toName.trim()   : ''
          const rel      = e.relationship as string
          const conf     = typeof e.confidence === 'number'
            ? Math.max(0, Math.min(1, e.confidence))
            : 0.8
          if (!fromName || !toName || !VALID_RELATIONSHIPS.has(rel as GraphRelationship)) continue
          if (fromName === toName) continue  // self-loops are meaningless
          edges.push({
            fromName,
            toName,
            relationship: rel as GraphRelationship,
            confidence:   conf,
          })
        }
      }

      return { entities, edges }
    } catch {
      return null
    }
  }

  private stripMarkdown(raw: string): string {
    return raw
      .replace(/^```[a-z]*\n?/m, '')
      .replace(/```$/m, '')
      .trim()
  }
}
