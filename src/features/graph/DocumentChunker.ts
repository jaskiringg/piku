// Splits documents into small, independently extractable chunks.
// Phase 1 implements bySection() and byADR() — the two patterns needed
// for the canonical docs. byADR() is specialised for 05_DECISIONS.md format.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentChunk {
  id:        string   // stable FNV-1a hash of content — deterministic across runs
  heading:   string   // section heading for context
  content:   string   // body text (heading excluded), max ~600 chars
  chars:     number
  position:  number   // byte offset of heading in source doc
  sourceDoc: string   // e.g. "docs/CANONICAL/05_DECISIONS.md"
}

export interface ADRChunk {
  id:         string  // stable hash
  adrid:      string  // "ADR-005"
  title:      string  // "Framework — Tauri (Rust + WebView)"
  decision:   string  // the decision or superseded statement
  reasoning:  string  // the reasoning text
  tradeoffs?: string  // optional trade-off text
  sourceDoc:  string
}

// ── Stable ID ─────────────────────────────────────────────────────────────────

// FNV-1a 32-bit: fast, deterministic, no async.
function fnv32a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// ── DocumentChunker ───────────────────────────────────────────────────────────

export class DocumentChunker {

  // ── bySection ───────────────────────────────────────────────────────────────
  //
  // Splits a markdown document at ## and ### heading boundaries.
  // Each chunk = heading text + body up to maxChars.
  // Chunks that exceed maxChars are split further at blank-line boundaries.
  // Headings that introduce only sub-headings (no body of their own) are skipped.

  bySection(content: string, sourceDoc: string, maxChars = 600): DocumentChunk[] {
    const lines   = content.split('\n')
    const chunks: DocumentChunk[] = []

    let heading    = ''
    let bodyLines: string[] = []
    let headingPos = 0

    const flush = () => {
      const body = bodyLines.join('\n').trim()
      if (!body || !heading) return
      const combined = `${heading}\n${body}`
      if (combined.length <= maxChars) {
        chunks.push({
          id:        fnv32a(combined),
          heading:   heading.replace(/^#{1,6}\s*/, '').trim(),
          content:   body,
          chars:     combined.length,
          position:  headingPos,
          sourceDoc,
        })
      } else {
        // Split at blank-line boundaries
        const paragraphs = body.split(/\n\n+/)
        let buf = ''
        let first = true
        for (const para of paragraphs) {
          if (buf.length + para.length + 2 > maxChars && buf) {
            chunks.push({
              id:        fnv32a(buf),
              heading:   heading.replace(/^#{1,6}\s*/, '').trim(),
              content:   buf.trim(),
              chars:     buf.trim().length,
              position:  headingPos,
              sourceDoc,
            })
            buf = para
          } else {
            buf = first ? para : `${buf}\n\n${para}`
          }
          first = false
        }
        if (buf.trim()) {
          chunks.push({
            id:        fnv32a(buf),
            heading:   heading.replace(/^#{1,6}\s*/, '').trim(),
            content:   buf.trim(),
            chars:     buf.trim().length,
            position:  headingPos,
            sourceDoc,
          })
        }
      }
    }

    let offset = 0
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) {
        flush()
        heading    = line
        headingPos = offset
        bodyLines  = []
      } else {
        bodyLines.push(line)
      }
      offset += line.length + 1
    }
    flush()

    return chunks.filter(c => c.content.length > 0)
  }

  // ── byADR ───────────────────────────────────────────────────────────────────
  //
  // Extracts individual ADR blocks from 05_DECISIONS.md.
  // Handles two ADR formats:
  //   Standard:   **Decision**: ...\n**Reasoning**: ...
  //   Superseded: **Original**: ...\n**Superseded**: ...
  //
  // Each returned ADRChunk is ~150–400 chars — well within fast extraction range.

  byADR(content: string, sourceDoc: string): ADRChunk[] {
    const chunks: ADRChunk[] = []

    // Match ### ADR-NNN: Title blocks
    // Split on lines that start a new ADR heading or a top-level --- separator
    const adrHeadingRe = /^### (ADR-\d+):\s*(.+)$/m

    // Split the document into blocks delimited by --- or next ### ADR- heading
    // Strategy: find all ADR heading positions, slice between them
    const lines   = content.split('\n')
    let inADR     = false
    let currentLines: string[] = []
    let currentAdrid  = ''
    let currentTitle  = ''

    const parseBlock = (adrid: string, title: string, blockLines: string[]) => {
      const block = blockLines.join('\n')

      // Extract fields using regex
      const decisionMatch  = /\*\*Decision\*\*:\s*(.+?)(?=\n\*\*|\n\n|$)/s.exec(block)
      const supersededMatch = /\*\*Superseded\*\*:\s*(.+?)(?=\n\*\*|\n\n|$)/s.exec(block)
      const originalMatch  = /\*\*Original\*\*:\s*(.+?)(?=\n\*\*|\n\n|$)/s.exec(block)

      // Reasoning patterns: "**Reasoning**:" or "**Reasoning for X**:"
      const reasoningMatch = /\*\*Reasoning(?:[^*]*)?\*\*:\s*(.+?)(?=\n\*\*|\n\n---|\n\n##|$)/s.exec(block)

      const tradeoffMatch  = /\*\*Trade-off\*\*:\s*(.+?)(?=\n\*\*|\n\n---|\n\n##|$)/s.exec(block)

      const decision  = clean(decisionMatch?.[1] ?? supersededMatch?.[1] ?? '')
      const reasoning = clean(reasoningMatch?.[1] ?? originalMatch?.[1] ?? '')
      const tradeoffs = clean(tradeoffMatch?.[1] ?? '')

      if (!decision && !reasoning) return  // empty block

      const id = fnv32a(`${adrid}:${title}:${decision}`)

      chunks.push({
        id,
        adrid,
        title,
        decision,
        reasoning,
        ...(tradeoffs ? { tradeoffs } : {}),
        sourceDoc,
      })
    }

    for (const line of lines) {
      const headingMatch = adrHeadingRe.exec(line)
      if (headingMatch) {
        if (inADR && currentAdrid) {
          parseBlock(currentAdrid, currentTitle, currentLines)
        }
        inADR        = true
        currentAdrid = headingMatch[1]
        currentTitle = headingMatch[2].trim()
        currentLines = []
      } else if (inADR) {
        // Stop at Part headings (## Part N) or end of ADR section
        if (/^## /.test(line) && !/^### /.test(line)) {
          parseBlock(currentAdrid, currentTitle, currentLines)
          inADR = false
          currentLines = []
        } else {
          currentLines.push(line)
        }
      }
    }

    if (inADR && currentAdrid) {
      parseBlock(currentAdrid, currentTitle, currentLines)
    }

    return chunks
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(s: string): string {
  return s
    .replace(/\*\*/g, '')           // strip markdown bold
    .replace(/`([^`]+)`/g, '$1')   // strip inline code markers
    .replace(/\n\s*[-•]\s*/g, ' ') // flatten bullet lists into prose
    .replace(/\s+/g, ' ')
    .trim()
}
