/**
 * EntityExtractor unit tests.
 *
 * Focus: alias matching correctness per PSP-02.
 *
 * All tests use extractFromADR() — the public deterministic path.
 * No LLM calls. No IDB. No Ollama required.
 *
 * Naming convention for "false positive" tests:
 *   "must NOT detect X when the text only contains Y"
 *
 * Naming convention for "true positive" tests:
 *   "detects X when the text explicitly names it"
 */

import { describe, it, expect } from 'vitest'
import { EntityExtractor }      from '../EntityExtractor'
import type { ADRChunk }        from '../DocumentChunker'

const extractor = new EntityExtractor()

// Minimal valid ADRChunk for focused tests.
function chunk(overrides: Partial<ADRChunk>): ADRChunk {
  return {
    id:        'test',
    adrid:     'ADR-TEST',
    title:     'Test Decision',
    decision:  '',
    reasoning: '',
    sourceDoc: 'test.md',
    ...overrides,
  }
}

// Helper: extract and return technology names only.
async function techs(c: ADRChunk): Promise<string[]> {
  const result = await extractor.extractFromADR(c, 'TestProject')
  return result.entities
    .filter(e => e.type === 'technology')
    .map(e => e.name)
}

// ── PSP-02: alias "ts" (TypeScript) ──────────────────────────────────────────

describe('PSP-02 — alias "ts" (TypeScript): false positive prevention', () => {

  it('does NOT detect TypeScript when text contains "tts" (TTS synthesis)', async () => {
    const t = await techs(chunk({
      reasoning: 'Voice (Whisper TTS synthesis, audio I/O) adds complexity.',
    }))
    expect(t).not.toContain('TypeScript')
  })

  it('does NOT detect TypeScript when text contains "shortcuts"', async () => {
    const t = await techs(chunk({
      decision: 'Global OS shortcut, works in any app, toggles overlay on/off.',
      reasoning: 'Non-conflicting with common macOS shortcuts. Single-hand accessible.',
    }))
    expect(t).not.toContain('TypeScript')
  })

  it('does NOT detect TypeScript when text contains "its"', async () => {
    const t = await techs(chunk({
      decision: 'All feature code isolated within its folder.',
      reasoning: 'Scale-safe isolation. Blast radius of a change is confined.',
    }))
    expect(t).not.toContain('TypeScript')
  })

  it('does NOT detect TypeScript when text contains "projects" (IDB store name)', async () => {
    const t = await techs(chunk({
      decision:  'IndexedDB v5 with 7 stores: memories, summaries, projects, pendingProjectUpdates, graphNodes, graphEdges, contextVersions.',
      reasoning: 'Browser-native. Transactional.',
    }))
    expect(t).not.toContain('TypeScript')
  })

  it('does NOT detect TypeScript from "index.ts" file extension', async () => {
    const t = await techs(chunk({
      decision:  'All feature code isolated within its folder. Public API via index.ts only.',
      reasoning: 'Scale-safe isolation.',
    }))
    expect(t).not.toContain('TypeScript')
  })

  it('does NOT detect TypeScript from "contextVersions" store name', async () => {
    const t = await techs(chunk({
      decision: 'Persistence via contextVersions, graphEdges, graphNodes stores.',
    }))
    expect(t).not.toContain('TypeScript')
  })

  it('DOES detect TypeScript when "TypeScript" is spelled out', async () => {
    const t = await techs(chunk({
      decision:  'Use TypeScript for the entire frontend.',
      reasoning: 'Type safety catches errors at compile time.',
    }))
    expect(t).toContain('TypeScript')
  })

  it('DOES detect TypeScript when "typescript" appears lowercase', async () => {
    const t = await techs(chunk({
      reasoning: 'Built with typescript and react for the UI layer.',
    }))
    expect(t).toContain('TypeScript')
  })

  it('DOES detect TypeScript when "TS" appears as a standalone token', async () => {
    const t = await techs(chunk({
      reasoning: 'All code is written in TS for type safety.',
    }))
    expect(t).toContain('TypeScript')
  })

})

// ── PSP-02: alias "idb" (IndexedDB) ──────────────────────────────────────────

describe('PSP-02 — alias "idb" (IndexedDB): word-boundary matching', () => {

  it('DOES detect IndexedDB when "idb" appears as standalone token', async () => {
    const t = await techs(chunk({
      reasoning: 'Using the idb library wrapper for IndexedDB access.',
    }))
    expect(t).toContain('IndexedDB')
  })

  it('DOES detect IndexedDB when "indexeddb" appears', async () => {
    const t = await techs(chunk({
      decision: 'IndexedDB v5 with 7 stores.',
    }))
    expect(t).toContain('IndexedDB')
  })

  it('does NOT detect IndexedDB when "idb" is embedded mid-word', async () => {
    // Contrived but tests the boundary: "btidbx" should not match
    const t = await techs(chunk({
      reasoning: 'The btidbx component is irrelevant.',
    }))
    expect(t).not.toContain('IndexedDB')
  })

})

// ── PSP-02: alias "rust" (Rust) ───────────────────────────────────────────────

describe('PSP-02 — alias "rust" (Rust): word-boundary matching', () => {

  it('DOES detect Rust when "Rust" is named explicitly', async () => {
    const t = await techs(chunk({
      decision:  'Rust backend for OS integration, WebView for UI.',
      reasoning: 'Type-safe Rust backend. Native system integration.',
    }))
    expect(t).toContain('Rust')
  })

  it('does NOT detect Rust from "trust"', async () => {
    const t = await techs(chunk({
      reasoning: 'We trust the OS to handle window management natively.',
    }))
    expect(t).not.toContain('Rust')
  })

  it('does NOT detect Rust from "trustworthy"', async () => {
    const t = await techs(chunk({
      reasoning: 'Local-first is more trustworthy than cloud-dependent approaches.',
    }))
    expect(t).not.toContain('Rust')
  })

})

// ── True positives: correctly detected technologies ───────────────────────────

describe('True positive detection: technologies that must still be found', () => {

  it('detects Tauri when named', async () => {
    const t = await techs(chunk({ decision: 'Use Tauri for the desktop shell.' }))
    expect(t).toContain('Tauri')
  })

  it('detects Rust when named alongside other tech', async () => {
    const t = await techs(chunk({
      decision: 'Rust backend for OS integration, WebView for UI.',
      tradeoffs: 'Rust learning curve. Smaller community than Electron (growing).',
    }))
    expect(t).toContain('Rust')
    expect(t).toContain('WebView')
    expect(t).toContain('Electron')
  })

  it('detects Ollama when named', async () => {
    const t = await techs(chunk({
      decision: 'Ollama local AI replaces mock responses. qwen3:14b produces real responses.',
    }))
    expect(t).toContain('Ollama')
    expect(t).toContain('qwen3:14b')
  })

  it('detects Canvas and WebGL when named', async () => {
    const t = await techs(chunk({
      decision:  'Particle orb uses 2D Canvas/WebGL, not Three.js or Babylon.js.',
      reasoning: '50–200 particles on Canvas run at 60fps on minimal CPU.',
    }))
    expect(t).toContain('Canvas')
    expect(t).toContain('WebGL')
    expect(t).toContain('Three.js')
  })

  it('detects Whisper when named', async () => {
    const t = await techs(chunk({
      reasoning: 'Voice (Whisper STT, TTS synthesis, audio I/O) adds complexity.',
    }))
    expect(t).toContain('Whisper')
  })

  it('detects IndexedDB when named', async () => {
    const t = await techs(chunk({
      decision: 'IndexedDB v5 with 7 stores for all persistent state.',
    }))
    expect(t).toContain('IndexedDB')
  })

  it('detects Claude Code when named', async () => {
    const t = await techs(chunk({
      decision:  'Claude Code is the primary builder.',
      reasoning: 'Large codebase consistency, architecture decisions, refactoring.',
    }))
    expect(t).toContain('Claude Code')
  })

  it('detects React when named', async () => {
    const t = await techs(chunk({
      decision: 'App state lives in React. Rust backend is event-only handler.',
    }))
    expect(t).toContain('React')
    expect(t).toContain('Rust')
  })

})

// ── Bug #2 regression: foundTechs.length guard removed ───────────────────────
//
// The guard `foundTechs.length <= 3` incorrectly blocked `uses` when >3 technologies
// were found, regardless of whether a chosenWord was present.
// After the fix, chosenWords alone determine the relationship type.

describe('Bug #2 — foundTechs.length guard: uses fires correctly when foundTechs > 3', () => {

  it('emits uses for all technologies when chosenWord present and foundTechs = 4', async () => {
    // 4 technologies + "using" in text → all 4 should get `uses` (not `related_to`)
    const result = await extractor.extractFromADR(chunk({
      title:     'Stack — Four Technologies',
      decision:  'We are using Tauri, Rust, React, and Ollama for the application.',
      reasoning: 'Each technology was selected for specific reasons.',
    }), 'TestProject')

    const techEdges = result.edges.filter(e =>
      result.entities.find(en => en.name === e.toName && en.type === 'technology')
    )

    expect(techEdges.length).toBeGreaterThanOrEqual(4)
    for (const edge of techEdges) {
      expect(edge.relationship).toBe('uses')
    }
  })

  it('emits related_to when no chosenWord present regardless of count', async () => {
    // 4 technologies, no chosenWord → all should get `related_to`
    const result = await extractor.extractFromADR(chunk({
      title:     'Framework Comparison',
      decision:  'Tauri, Rust, React, and Ollama were evaluated.',
      reasoning: 'Each technology has different trade-offs.',
    }), 'TestProject')

    const techEdges = result.edges.filter(e =>
      result.entities.find(en => en.name === e.toName && en.type === 'technology')
    )

    expect(techEdges.length).toBeGreaterThanOrEqual(3)
    for (const edge of techEdges) {
      expect(edge.relationship).toBe('related_to')
    }
  })

  it('ADR-003 still emits uses (3 techs + chosenWord — previously worked, still works)', async () => {
    const result = await extractor.extractFromADR(chunk({
      adrid:     'ADR-003',
      title:     'Animation — 2D Canvas, Not 3D Engine',
      decision:  'Particle orb uses 2D Canvas/WebGL, not Three.js or Babylon.js.',
      reasoning: '50–200 particles on Canvas run at 60fps on minimal CPU.',
    }), 'TestProject')

    const techEdges = result.edges.filter(e =>
      result.entities.find(en => en.name === e.toName && en.type === 'technology')
    )
    // chosenWord "uses" is present → all tech edges should be `uses`
    expect(techEdges.length).toBeGreaterThanOrEqual(1)
    for (const edge of techEdges) {
      expect(edge.relationship).toBe('uses')
    }
  })

})

// ── Regression: exact ADR texts that produced false positives ─────────────────

describe('Regression: ADR texts that previously triggered TypeScript false positives', () => {

  it('ADR-002 text: detects only Whisper (not TypeScript)', async () => {
    const t = await techs(chunk({
      adrid:     'ADR-002',
      title:     'Voice — Text First, Voice Later',
      decision:  'Piku is text-only until the World Model is proven. Voice deferred to Phase 3+.',
      reasoning: 'Voice (Whisper STT, TTS synthesis, audio I/O) adds 4+ weeks of complexity. Text-first validates the core World Model architecture before adding another interface layer.',
    }))
    expect(t).toContain('Whisper')
    expect(t).not.toContain('TypeScript')
    expect(t).toHaveLength(1)
  })

  it('ADR-004 text: detects no technologies (not TypeScript)', async () => {
    const t = await techs(chunk({
      adrid:     'ADR-004',
      title:     'Invocation — ⌥ (Option) + Space Global Hotkey',
      decision:  'Global OS shortcut, works in any app, toggles overlay on/off.',
      reasoning: 'Non-conflicting with common macOS shortcuts. Single-hand accessible. Fast.',
    }))
    expect(t).not.toContain('TypeScript')
    expect(t).toHaveLength(0)
  })

  it('ADR-009 text: detects Tauri, WebView, IndexedDB, SQLite (not TypeScript)', async () => {
    const t = await techs(chunk({
      adrid:     'ADR-009',
      title:     'Persistence — IndexedDB (supersedes no-persistence)',
      decision:  'IndexedDB v5 with 7 stores: memories, summaries, projects, pendingProjectUpdates, graphNodes, graphEdges, contextVersions.',
      reasoning: 'Browser-native (Tauri exposes via WebView). No serialization needed for Float32Array embeddings. Transactional. Sufficient for Phase 1–2. Evaluate SQLite for Phase 3 if full-text search becomes critical.',
    }))
    expect(t).toContain('Tauri')
    expect(t).toContain('WebView')
    expect(t).toContain('IndexedDB')
    expect(t).toContain('SQLite')
    expect(t).not.toContain('TypeScript')
    expect(t).toHaveLength(4)
  })

  it('ADR-013 text: detects no technologies (not TypeScript)', async () => {
    const t = await techs(chunk({
      adrid:     'ADR-013',
      title:     'Feature Isolation — `src/features/<name>/`',
      decision:  'All feature code isolated within its folder. Public API via index.ts only.',
      reasoning: 'Scale-safe isolation. Blast radius of a change is confined. Deletion is safe.',
    }))
    expect(t).not.toContain('TypeScript')
    expect(t).toHaveLength(0)
  })

})
