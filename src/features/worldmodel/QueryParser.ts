import type { ParsedQuery, QueryIntent } from './types'

// ── Stop words ─────────────────────────────────────────────────────────────
// Removed before keyword extraction. Includes common English function words
// plus generic query verbs that carry no entity signal.

const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','shall','can','need','ought','must',
  'what','which','who','whom','whose','when','where','why','how',
  'and','but','or','nor','for','yet','so',
  'at','by','in','of','on','to','up','as','if','into','through','about','with',
  'that','this','these','those',
  'i','me','my','we','our','you','your','he','she','it','they','them','their',
  'all','any','some','each','every','both','few','more','most','other','such',
  'tell','show','give','list','find','get','know','explain','describe',
  'made','make','done','doing','currently','now','there','here',
  'related','relating','regarding','concerning','across','between','among',
  'piku','please','just','want','need','like','think',
])

// ── Intent patterns ────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: QueryIntent }> = [
  {
    pattern: /\bdecision[s]?\b|\bdecid[ed]?\b|\bchose?\b|\bchoice[s]?\b|\bpick[ed]?\b|\bselect[ed]?\b/i,
    intent:  'decisions',
  },
  {
    pattern: /\bblock(ed|ing|ers?|s)?\b|\bstuck\b|\bimpediments?\b/i,
    intent:  'blockers',
  },
  {
    pattern: /\bin.?progress\b|\bcurrent(ly)?\b|\bworking on\b|\bactive\b|\bbeing built\b|\bbuilding\b|\bimplementing\b/i,
    intent:  'current_work',
  },
  {
    pattern: /\bchange[sd]?\b|\bupdat[ed]?\b|\brecent(ly)?\b|\blast \d+ day[s]?\b|\bthis week\b|\blast week\b|\bthis month\b|\bnew(ly)?\b|\bmodif[ied]+\b/i,
    intent:  'recent_changes',
  },
  {
    pattern: /\btechnolog[y|ies]+\b|\bstack\b|\bframework[s]?\b|\btool[s]?\b|\blibrar[y|ies]+\b|\bdependenc[y|ies]+\b/i,
    intent:  'entities',
  },
  {
    pattern: /\brelated?\b|\brelationships?\b|\bconnected?\b|\blinked?\b|\bdepends?\b|\bassociated?\b/i,
    intent:  'relationships',
  },
]

// ── Time filter patterns ───────────────────────────────────────────────────

const TIME_PATTERNS: Array<{ pattern: RegExp; days: number | 'extract' }> = [
  { pattern: /last (\d+) days?/i,  days: 'extract' },
  { pattern: /last (\d+) weeks?/i, days: 'extract' },  // will multiply by 7
  { pattern: /this week/i,         days: 7  },
  { pattern: /last week/i,         days: 14 },
  { pattern: /this month/i,        days: 30 },
  { pattern: /last month/i,        days: 60 },
  { pattern: /recently/i,          days: 7  },
  { pattern: /today/i,             days: 1  },
  { pattern: /yesterday/i,         days: 2  },
]

// ── Parser ─────────────────────────────────────────────────────────────────

export class QueryParser {
  parse(raw: string): ParsedQuery {
    const lower = raw.toLowerCase()

    // Extract keywords: tokenise, filter stop words, deduplicate
    const tokens = lower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))

    const keywords        = [...new Set(tokens)]
    const normalizedTerms = keywords

    // Detect intents
    const intent = new Set<QueryIntent>()
    for (const { pattern, intent: i } of INTENT_PATTERNS) {
      if (pattern.test(raw)) intent.add(i)
    }
    if (intent.size === 0) intent.add('general')

    // Detect time filter
    let timeFilter: { days: number } | undefined
    for (const { pattern, days } of TIME_PATTERNS) {
      const match = raw.match(pattern)
      if (match) {
        if (days === 'extract') {
          const n = parseInt(match[1] ?? '7', 10)
          // Check if the original pattern was "weeks" — multiply by 7
          const isWeeks = /week/i.test(match[0])
          timeFilter = { days: isNaN(n) ? 7 : (isWeeks ? n * 7 : n) }
        } else {
          timeFilter = { days }
        }
        break
      }
    }

    return { raw, keywords, normalizedTerms, intent, timeFilter }
  }
}
