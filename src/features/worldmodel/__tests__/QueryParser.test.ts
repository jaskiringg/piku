import { describe, it, expect } from 'vitest'
import { QueryParser } from '../QueryParser'

const parser = new QueryParser()

describe('QueryParser', () => {
  // ── Intent detection ──────────────────────────────────────────────────────

  describe('intent detection', () => {
    it('detects decisions intent', () => {
      const q = parser.parse('What decisions have we made about OAuth?')
      expect(q.intent.has('decisions')).toBe(true)
    })

    it('detects blockers intent', () => {
      const q = parser.parse('What is currently blocked?')
      expect(q.intent.has('blockers')).toBe(true)
    })

    it('detects current_work intent', () => {
      const q = parser.parse('What are we currently working on?')
      expect(q.intent.has('current_work')).toBe(true)
    })

    it('detects recent_changes intent', () => {
      const q = parser.parse('What changed this week?')
      expect(q.intent.has('recent_changes')).toBe(true)
    })

    it('detects recent_changes from "recently"', () => {
      const q = parser.parse('What did we recently update?')
      expect(q.intent.has('recent_changes')).toBe(true)
    })

    it('detects entities intent for technology queries', () => {
      const q = parser.parse('What technologies does the OAuth project use?')
      expect(q.intent.has('entities')).toBe(true)
    })

    it('detects relationships intent', () => {
      const q = parser.parse('What is related to authentication?')
      expect(q.intent.has('relationships')).toBe(true)
    })

    it('falls back to general when no specific intent matches', () => {
      const q = parser.parse('Tell me about OAuth')
      expect(q.intent.has('general')).toBe(true)
    })

    it('can detect multiple intents', () => {
      const q = parser.parse('What decisions are blocked this week?')
      expect(q.intent.has('decisions')).toBe(true)
      expect(q.intent.has('blockers')).toBe(true)
      expect(q.intent.has('recent_changes')).toBe(true)
    })
  })

  // ── Keyword extraction ────────────────────────────────────────────────────

  describe('keyword extraction', () => {
    it('extracts meaningful tokens from the query', () => {
      const q = parser.parse('What decisions have we made about OAuth?')
      expect(q.normalizedTerms).toContain('oauth')
    })

    it('removes stop words', () => {
      const q = parser.parse('What do we know about JWT?')
      expect(q.normalizedTerms).not.toContain('what')
      expect(q.normalizedTerms).not.toContain('the')
      expect(q.normalizedTerms).not.toContain('do')
      expect(q.normalizedTerms).toContain('jwt')
    })

    it('lowercases all terms', () => {
      const q = parser.parse('What about PKCE and OAuth2?')
      expect(q.normalizedTerms).toContain('pkce')
      expect(q.normalizedTerms).toContain('oauth2')
    })

    it('deduplicates repeated terms', () => {
      const q = parser.parse('oauth oauth oauth')
      const count = q.normalizedTerms.filter(t => t === 'oauth').length
      expect(count).toBe(1)
    })

    it('handles empty query gracefully', () => {
      const q = parser.parse('')
      expect(q.keywords).toEqual([])
      expect(q.intent.has('general')).toBe(true)
    })
  })

  // ── Time filter extraction ─────────────────────────────────────────────────

  describe('time filter', () => {
    it('extracts "this week" as 7 days', () => {
      const q = parser.parse('What changed this week?')
      expect(q.timeFilter).toEqual({ days: 7 })
    })

    it('extracts "last 3 days"', () => {
      const q = parser.parse('What happened in the last 3 days?')
      expect(q.timeFilter).toEqual({ days: 3 })
    })

    it('extracts "last 2 weeks" as 14 days', () => {
      const q = parser.parse('What changed in the last 2 weeks?')
      expect(q.timeFilter).toEqual({ days: 14 })
    })

    it('extracts "today" as 1 day', () => {
      const q = parser.parse("What did I do today?")
      expect(q.timeFilter).toEqual({ days: 1 })
    })

    it('returns undefined timeFilter when no time reference present', () => {
      const q = parser.parse('What is the OAuth status?')
      expect(q.timeFilter).toBeUndefined()
    })
  })

  // ── Raw preservation ──────────────────────────────────────────────────────

  it('preserves the original raw query', () => {
    const raw = 'What decisions have we made about OAuth?'
    const q   = parser.parse(raw)
    expect(q.raw).toBe(raw)
  })
})
