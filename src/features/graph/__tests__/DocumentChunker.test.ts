import { describe, it, expect } from 'vitest'
import { DocumentChunker } from '../DocumentChunker'

const chunker = new DocumentChunker()

// Minimal 05_DECISIONS.md-like fixture — two ADRs covering both formats.
const FIXTURE_ADR = `
## Part 3 — Architecture Decision Records

### ADR-001: Platform — macOS 12.0+ Only

**Decision**: Target macOS exclusively for initial releases.

**Reasoning**: Single platform means faster iteration, tighter feedback loops, access to mature macOS APIs.

**Trade-off**: Windows and Linux users excluded. Multi-platform deferred.

---

### ADR-005: Framework — Tauri (Rust + WebView)

**Decision**: Rust backend for OS integration, WebView for UI.

**Reasoning**: 30–50MB binary vs 150MB+ Electron. Native system integration. Type-safe Rust backend.

**Trade-off**: Rust learning curve. Smaller community than Electron.

---

### ADR-008: Chat Response — Ollama (supersedes mock)

**Original**: v0.0 uses hardcoded mock responses.
**Superseded**: Ollama local AI replaces mock responses. qwen3:14b produces real responses.

---

### ADR-009: Persistence — IndexedDB (supersedes no-persistence)

**Original**: v0.0 has no persistence.
**Superseded**: IndexedDB v5 with 7 stores.

**Reasoning for IDB over SQLite**: Browser-native. No serialization needed for Float32Array embeddings.

---
`.trim()

const SOURCE = 'docs/CANONICAL/05_DECISIONS.md'

// ── byADR tests ──────────────────────────────────────────────────────────────

describe('DocumentChunker.byADR', () => {

  it('returns one chunk per ADR', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    expect(chunks).toHaveLength(4)
  })

  it('extracts correct adrid and title', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    expect(chunks[0].adrid).toBe('ADR-001')
    expect(chunks[0].title).toBe('Platform — macOS 12.0+ Only')
    expect(chunks[1].adrid).toBe('ADR-005')
    expect(chunks[1].title).toBe('Framework — Tauri (Rust + WebView)')
  })

  it('extracts decision text for standard ADR', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    const adr001 = chunks[0]
    expect(adr001.decision).toContain('macOS exclusively')
    expect(adr001.decision.length).toBeGreaterThan(10)
  })

  it('extracts reasoning for standard ADR', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    const adr001 = chunks[0]
    expect(adr001.reasoning).toContain('iteration')
  })

  it('extracts trade-off text', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    const adr001 = chunks[0]
    expect(adr001.tradeoffs).toContain('Windows')
  })

  it('handles superseded ADR format — uses Superseded as decision', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    const adr008 = chunks.find(c => c.adrid === 'ADR-008')!
    expect(adr008).toBeDefined()
    expect(adr008.decision).toContain('Ollama')
  })

  it('handles superseded ADR with additional reasoning', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    const adr009 = chunks.find(c => c.adrid === 'ADR-009')!
    expect(adr009).toBeDefined()
    expect(adr009.reasoning).toBeTruthy()
  })

  it('generates stable IDs — same content produces same ID', () => {
    const chunks1 = chunker.byADR(FIXTURE_ADR, SOURCE)
    const chunks2 = chunker.byADR(FIXTURE_ADR, SOURCE)
    for (let i = 0; i < chunks1.length; i++) {
      expect(chunks1[i].id).toBe(chunks2[i].id)
    }
  })

  it('IDs are unique across different ADRs', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    const ids    = chunks.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('stores sourceDoc on every chunk', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    for (const c of chunks) {
      expect(c.sourceDoc).toBe(SOURCE)
    }
  })

  it('strips markdown bold markers from extracted text', () => {
    const chunks = chunker.byADR(FIXTURE_ADR, SOURCE)
    for (const c of chunks) {
      expect(c.decision).not.toContain('**')
      expect(c.reasoning).not.toContain('**')
    }
  })

  it('parses all 13 ADRs from a realistic 05_DECISIONS excerpt', () => {
    // Build a fixture with 13 ADRs
    const adrs = Array.from({ length: 13 }, (_, i) => {
      const n = String(i + 1).padStart(3, '0')
      return `### ADR-${n}: Decision ${n}\n\n**Decision**: Choose option ${n}.\n\n**Reasoning**: Reason ${n}.\n\n---`
    }).join('\n\n')
    const fixture = `## Part 3 — Architecture Decision Records\n\n${adrs}`
    const chunks  = chunker.byADR(fixture, SOURCE)
    expect(chunks).toHaveLength(13)
  })
})

// ── bySection tests ──────────────────────────────────────────────────────────

const FIXTURE_SECTION = `
# Piku Architecture

## World Model

The World Model is the product. It is the aggregate of everything Piku knows.

## Memory System

Stores durable personal facts. Extraction runs after every chat turn.

### Memory Categories

There are 13 memory categories ranging from personal_fact to user_correction.
`.trim()

describe('DocumentChunker.bySection', () => {

  it('returns one chunk per heading with body content', () => {
    const chunks = chunker.bySection(FIXTURE_SECTION, SOURCE)
    // Should have chunks for: World Model, Memory System, Memory Categories
    // (top-level # heading has no body before first ##)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('sets heading from the section heading text', () => {
    const chunks = chunker.bySection(FIXTURE_SECTION, SOURCE)
    const names  = chunks.map(c => c.heading)
    expect(names).toContain('World Model')
    expect(names).toContain('Memory System')
  })

  it('includes body content without the heading line', () => {
    const chunks = chunker.bySection(FIXTURE_SECTION, SOURCE)
    const wm     = chunks.find(c => c.heading === 'World Model')!
    expect(wm.content).toContain('World Model is the product')
    expect(wm.content).not.toContain('## World Model')
  })

  it('respects maxChars by splitting large chunks at paragraph boundaries', () => {
    const longBody = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} content here.`).join('\n\n')
    const fixture  = `## Big Section\n\n${longBody}`
    const chunks   = chunker.bySection(fixture, SOURCE, 200)
    // Should be split into multiple chunks
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.chars).toBeLessThanOrEqual(200 + 50)  // allow small overshoot at boundaries
    }
  })

  it('generates stable IDs', () => {
    const chunks1 = chunker.bySection(FIXTURE_SECTION, SOURCE)
    const chunks2 = chunker.bySection(FIXTURE_SECTION, SOURCE)
    for (let i = 0; i < chunks1.length; i++) {
      expect(chunks1[i].id).toBe(chunks2[i].id)
    }
  })

  it('sets sourceDoc correctly', () => {
    const chunks = chunker.bySection(FIXTURE_SECTION, SOURCE)
    for (const c of chunks) {
      expect(c.sourceDoc).toBe(SOURCE)
    }
  })
})
