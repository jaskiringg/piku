// ── Shared text-cleaning utilities ────────────────────────────────────────
// Used by both OpencodeProvider (cloud path) and OllamaService / ToolRouter (local path).
// Single source of truth — no duplication.

// ---------------------------------------------------------------------------
// stripThinkingTokens — remove <think>…</think> blocks from a completed string.
// Used as a post-processing pass on final accumulated text.
// ---------------------------------------------------------------------------
export function stripThinkingTokens(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

// ---------------------------------------------------------------------------
// META_PREAMBLE_PATTERNS — sentences where the model narrates its plan or
// refers to the user in the third person, leaking chain-of-thought into the
// answer field.  These patterns match ONLY at the start of a sentence.
// ---------------------------------------------------------------------------
export const META_PREAMBLE_PATTERNS: RegExp[] = [
  /^The user wants\b/i,
  /^The user needs\b/i,
  /^The user is\b/i,
  /^Let me\b/i,
  /^Let's give\b/i,
  /^I'll /i,
  /^I will /i,
  /^I should\b/i,
  /^I don'?t need\b/i,
  /^I need to\b/i,
  /^Okay,? so\b/i,
  /^First,? I\b/i,
  /^So,? the user\b/i,
  /^They want\b/i,
  /^They need\b/i,
]

/**
 * Split `text` into { preamble, answer }.
 * `preamble` is the leading contiguous block of meta-narration sentences (may be empty).
 * `answer`   is the rest — the first genuine first-person/direct reply.
 */
export function stripMetaPreamble(text: string): { preamble: string; answer: string } {
  // Quick bail — no match anywhere near the start saves the split cost.
  const first200 = text.slice(0, 200)
  if (!META_PREAMBLE_PATTERNS.some(p => p.test(first200.trimStart()))) {
    return { preamble: '', answer: text }
  }

  // Sentence tokeniser: split keeping the delimiter so we can reassemble losslessly.
  const sentenceRe = /(?<=[.!?])\s+/g
  const sentences: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = sentenceRe.exec(text)) !== null) {
    sentences.push(text.slice(last, m.index + 1).trimEnd())
    last = m.index + m[0].length
  }
  if (last < text.length) sentences.push(text.slice(last))

  let cutIdx = 0
  for (const s of sentences) {
    const trimmed = s.trimStart()
    if (META_PREAMBLE_PATTERNS.some(p => p.test(trimmed))) {
      cutIdx++
    } else {
      break
    }
  }

  if (cutIdx === 0) return { preamble: '', answer: text }
  if (cutIdx >= sentences.length) return { preamble: text.trim(), answer: '' }

  const preamble = sentences.slice(0, cutIdx).join(' ').trim()
  const answer   = sentences.slice(cutIdx).join(' ').trim()
  return { preamble, answer }
}

// ---------------------------------------------------------------------------
// makePreambleFilter — returns an onContent wrapper that buffers the first
// tokens until we can determine whether the stream starts with a meta-preamble.
// Once the filter has seen enough content (a sentence-ending character), it
// strips any preamble and emits the clean answer to `realOnContent`. Preamble
// text is routed to `onPreamble` (→ thinking panel) instead of the chat.
//
// Usage:
//   const wrappedOnContent = makePreambleFilter(onContent, onThinking)
//   // pass wrappedOnContent to the streaming call instead of onContent
//   wrappedOnContent.flush()   // call when stream ends to emit any held remainder
// ---------------------------------------------------------------------------
export function makePreambleFilter(
  realOnContent: (delta: string) => void,
  onPreamble?: (delta: string) => void,
): { onContent: (delta: string) => void; flush: () => void } {
  // Buffer up to ~300 chars before we commit (covers typical one-sentence preambles).
  const BUFFER_LIMIT = 300
  let buf = ''
  let decided = false   // once we've stripped/passed the preamble, emit deltas directly

  const tryDecide = () => {
    // Wait for at least a sentence boundary (. ! ? \n) before deciding.
    const hasBoundary = /[.!?\n]/.test(buf)
    if (!hasBoundary && buf.length < BUFFER_LIMIT) return   // keep buffering

    // We have enough context — strip and emit.
    const { preamble, answer } = stripMetaPreamble(buf)
    if (preamble) {
      onPreamble?.('\n[preamble stripped]\n' + preamble)
    }
    if (answer) realOnContent(answer)
    buf = ''
    decided = true
  }

  return {
    onContent: (delta: string) => {
      if (decided) { realOnContent(delta); return }
      buf += delta
      tryDecide()
    },
    flush: () => {
      if (decided) return
      // Stream ended before we decided — emit whatever we have (may be preamble-only).
      if (!buf) return
      const { preamble, answer } = stripMetaPreamble(buf)
      if (preamble) onPreamble?.('\n[preamble stripped]\n' + preamble)
      if (answer) realOnContent(answer)
      buf = ''
      decided = true
    },
  }
}
