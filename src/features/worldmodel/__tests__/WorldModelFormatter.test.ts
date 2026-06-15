import { describe, it, expect } from 'vitest'
import { formatWorldModelResult } from '../WorldModelFormatter'
import type { WorldModelResult } from '../types'

function emptyResult(): WorldModelResult {
  return {
    projects:      [],
    decisions:     [],
    blockers:      [],
    currentWork:   [],
    entities:      [],
    relationships: [],
    memories:      [],
    recentChanges: [],
    confidence:    0,
    queryTerms:    [],
    sources:       [],
    isEmpty:       true,
  }
}

describe('WorldModelFormatter', () => {
  it('returns empty string for an empty result', () => {
    expect(formatWorldModelResult(emptyResult())).toBe('')
  })

  it('includes project name in output', () => {
    const result: WorldModelResult = {
      ...emptyResult(),
      isEmpty: false,
      projects: [{
        id: 'p1', name: 'OAuth Migration',
        vision: 'Implement OAuth 2.0', currentState: 'In Progress', relevance: 0.9,
      }],
    }
    const output = formatWorldModelResult(result)
    expect(output).toContain('OAuth Migration')
    expect(output).toContain('In Progress')
  })

  it('includes decision title and reasoning', () => {
    const result: WorldModelResult = {
      ...emptyResult(),
      isEmpty: false,
      decisions: [{
        id: 'd1', projectId: 'p1', projectName: 'OAuth Migration',
        title: 'Use PKCE', reasoning: 'Better security',
        createdAt: Date.now(), relevance: 0.9,
      }],
    }
    const output = formatWorldModelResult(result)
    expect(output).toContain('Use PKCE')
    expect(output).toContain('Better security')
  })

  it('includes memories in Relevant Context section', () => {
    const result: WorldModelResult = {
      ...emptyResult(),
      isEmpty: false,
      memories: [{
        id: 'm1', content: 'User prefers PKCE', category: 'preference',
        relevance: 0.8, createdAt: Date.now(),
      }],
    }
    const output = formatWorldModelResult(result)
    expect(output).toContain('Relevant Context')
    expect(output).toContain('User prefers PKCE')
  })

  it('starts with "World Model:" header', () => {
    const result: WorldModelResult = {
      ...emptyResult(),
      isEmpty: false,
      projects: [{
        id: 'p1', name: 'Test', vision: 'Vision', currentState: '', relevance: 0.8,
      }],
    }
    const output = formatWorldModelResult(result)
    expect(output.startsWith('World Model:')).toBe(true)
  })

  it('omits empty sections', () => {
    const result: WorldModelResult = {
      ...emptyResult(),
      isEmpty: false,
      projects: [{
        id: 'p1', name: 'Test', vision: 'Vision', currentState: '', relevance: 0.8,
      }],
    }
    const output = formatWorldModelResult(result)
    expect(output).not.toContain('Decisions:')
    expect(output).not.toContain('Blockers:')
    expect(output).not.toContain('In Progress:')
  })
})
