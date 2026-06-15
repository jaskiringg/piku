import { useState, useEffect, useCallback, useRef } from 'react'
import type { GraphNode, GraphEdge }                 from '../types'
import { graphService }                              from '../index'
import { graphActivityLog }                          from '../GraphActivityLog'
import type { GraphActivityEvent }                   from '../GraphActivityLog'

// ── Constants ──────────────────────────────────────────────────────────────

const REL_LABEL: Record<string, string> = {
  depends_on: 'depends on',
  supports:   'supports',
  blocks:     'blocks',
  caused_by:  'caused by',
  related_to: 'related to',
  owned_by:   'owned by',
}

const TYPE_COLOR: Record<string, string> = {
  project:  'text-blue-400/70',
  goal:     'text-purple-400/70',
  skill:    'text-green-400/70',
  person:   'text-yellow-400/70',
  memory:   'text-pink-400/70',
  decision: 'text-orange-400/70',
}

const TYPE_DOT: Record<string, string> = {
  project:  'bg-blue-400/60',
  goal:     'bg-purple-400/60',
  skill:    'bg-green-400/60',
  person:   'bg-yellow-400/60',
  memory:   'bg-pink-400/60',
  decision: 'bg-orange-400/60',
}

// ── Types ──────────────────────────────────────────────────────────────────

interface EdgeRow {
  edge:     GraphEdge
  fromNode: GraphNode | undefined
  toNode:   GraphNode | undefined
}

type StampedEvent = GraphActivityEvent & { id: number; ts: number }

// ── Component ──────────────────────────────────────────────────────────────

export function GraphPanel() {
  const [rows,           setRows]           = useState<EdgeRow[]>([])
  const [isExpanded,     setIsExpanded]     = useState(false)
  const [isLoading,      setIsLoading]      = useState(false)
  const [activityEvents, setActivityEvents] = useState<StampedEvent[]>(() =>
    graphActivityLog.getHistory() as StampedEvent[]
  )
  const [isExtracting,   setIsExtracting]   = useState(false)
  const [unreadCount,    setUnreadCount]    = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  // ── Load graph state ─────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [edges, nodes] = await Promise.all([
        graphService['store'].getConfirmedEdges(),
        graphService.getAllNodes(),
      ])
      const nodeMap = new Map(nodes.map(n => [n.id, n]))
      setRows(
        edges.map(edge => ({
          edge,
          fromNode: nodeMap.get(edge.fromId),
          toNode:   nodeMap.get(edge.toId),
        }))
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Subscribe to activity log ────────────────────────────────────────────

  useEffect(() => {
    const unsub = graphActivityLog.subscribe((event) => {
      setActivityEvents(graphActivityLog.getHistory() as StampedEvent[])

      if (event.type === 'extraction_start') {
        setIsExtracting(true)
      } else if (
        event.type === 'extraction_complete' ||
        event.type === 'extraction_empty'
      ) {
        setIsExtracting(false)
        // After extraction completes, refresh the edge table
        void load()
      }

      // Increment unread badge when panel is collapsed
      setUnreadCount(prev => prev + 1)
    })
    return unsub
  }, [load])

  // Auto-scroll activity feed to bottom when new events arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [activityEvents])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggle = () => {
    setIsExpanded(v => {
      if (!v) {
        void load()
        setUnreadCount(0)
      }
      return !v
    })
  }

  const clearActivity = () => {
    graphActivityLog.clear()
    setActivityEvents([])
    setUnreadCount(0)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col gap-2">

      {/* Toggle header */}
      <button
        onClick={toggle}
        className="
          flex items-center justify-between w-full
          px-3 py-2 rounded-xl
          text-xs text-white/40 hover:text-white/60
          border border-white/6 hover:border-white/12
          transition-colors duration-150
        "
      >
        <span className="flex items-center gap-2">
          {/* Pulsing dot when extraction is in progress */}
          {isExtracting ? (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80 animate-pulse" />
          ) : (
            <span className="text-white/25">⬡</span>
          )}
          Knowledge Graph
          {rows.length > 0 && (
            <span className="text-white/25">({rows.length} link{rows.length !== 1 ? 's' : ''})</span>
          )}
          {/* Unread activity badge — shown when panel is collapsed */}
          {!isExpanded && unreadCount > 0 && (
            <span className="
              text-[9px] bg-blue-500/30 text-blue-300/80
              rounded-full px-1.5 py-0.5 leading-none
            ">
              {unreadCount} new
            </span>
          )}
        </span>
        <span className="text-white/20">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="flex flex-col gap-3">

          {/* ── Edge table ─────────────────────────────────────────────── */}
          {isLoading ? (
            <p className="text-xs text-white/25 text-center py-3">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-white/25 text-center py-3">
              No relationships yet — chat to build the graph.
            </p>
          ) : (
            <div className="rounded-xl border border-white/6 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/6">
                    <th className="text-left text-white/25 font-normal px-3 py-2">From</th>
                    <th className="text-left text-white/25 font-normal px-3 py-2">Rel</th>
                    <th className="text-left text-white/25 font-normal px-3 py-2">To</th>
                    <th className="text-right text-white/25 font-normal px-3 py-2">Str</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ edge, fromNode, toNode }) => (
                    <tr key={edge.id} className="border-b border-white/4 last:border-0 hover:bg-white/2">
                      <td className="px-3 py-2">
                        {fromNode ? (
                          <span>
                            <span className={`${TYPE_COLOR[fromNode.type] ?? 'text-white/40'} mr-1`}>
                              [{fromNode.type}]
                            </span>
                            <span className="text-white/70">{fromNode.name}</span>
                          </span>
                        ) : (
                          <span className="text-white/20">{edge.fromId.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-white/35 italic">
                        {REL_LABEL[edge.relationship] ?? edge.relationship}
                      </td>
                      <td className="px-3 py-2">
                        {toNode ? (
                          <span>
                            <span className={`${TYPE_COLOR[toNode.type] ?? 'text-white/40'} mr-1`}>
                              [{toNode.type}]
                            </span>
                            <span className="text-white/70">{toNode.name}</span>
                          </span>
                        ) : (
                          <span className="text-white/20">{edge.toId.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-white/35">
                        {Math.round(edge.strength * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Graph Activity Feed ─────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-white/25 flex items-center gap-1.5">
                {isExtracting && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400/70 animate-pulse inline-block" />
                )}
                Graph Activity
              </span>
              {activityEvents.length > 0 && (
                <button
                  onClick={clearActivity}
                  className="text-[10px] text-white/20 hover:text-white/45 transition-colors"
                >
                  clear
                </button>
              )}
            </div>

            <div
              ref={feedRef}
              className="
                flex flex-col gap-1 max-h-52 overflow-y-auto
                rounded-xl border border-white/6 bg-black/30
                p-2
              "
            >
              {activityEvents.length === 0 ? (
                <p className="text-[11px] text-white/20 text-center py-2">
                  Activity will appear here during extraction.
                </p>
              ) : (
                activityEvents.map(event => (
                  <ActivityRow key={event.id} event={event} />
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => void load()}
            className="text-[10px] text-white/20 hover:text-white/40 text-right transition-colors"
          >
            refresh
          </button>
        </div>
      )}
    </div>
  )
}

// ── Activity row ───────────────────────────────────────────────────────────

function ActivityRow({ event }: { event: StampedEvent }) {
  switch (event.type) {
    case 'extraction_start':
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400/50 shrink-0 animate-pulse" />
          <span className="text-[11px] text-blue-300/50">Extraction started</span>
        </div>
      )

    case 'extraction_empty':
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
          <span className="text-[11px] text-white/25">No relationships found</span>
        </div>
      )

    case 'extraction_complete':
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
          <span className="text-[11px] text-emerald-300/60">
            Complete — {event.itemCount} item{event.itemCount !== 1 ? 's' : ''} processed
          </span>
        </div>
      )

    case 'node_created': {
      const dot   = TYPE_DOT[event.node.type]   ?? 'bg-white/30'
      const color = TYPE_COLOR[event.node.type] ?? 'text-white/40'
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${event.isNew ? '' : 'opacity-40'}`} />
          <span className="text-[11px] text-white/50">
            {event.isNew ? '＋' : '→'}
            {' '}
            <span className={`${color} text-[10px]`}>[{event.node.type}]</span>
            {' '}
            <span className={event.isNew ? 'text-white/70' : 'text-white/35'}>
              {event.node.name}
            </span>
            {!event.isNew && (
              <span className="text-white/20 text-[10px] ml-1">(existing)</span>
            )}
          </span>
        </div>
      )
    }

    case 'edge_created': {
      const fromColor = TYPE_COLOR[event.fromType] ?? 'text-white/40'
      const toColor   = TYPE_COLOR[event.toType]   ?? 'text-white/40'
      const relLabel  = REL_LABEL[event.edge.relationship] ?? event.edge.relationship
      return (
        <div className="flex flex-col gap-0.5 py-0.5 pl-3 border-l border-white/8">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={`${fromColor} text-[10px]`}>[{event.fromType}]</span>
            <span className="text-white/65">{event.fromName}</span>
            <span className="text-white/25">·</span>
            <span className="text-white/30 italic text-[10px]">{relLabel}</span>
            <span className="text-white/25">·</span>
            <span className={`${toColor} text-[10px]`}>[{event.toType}]</span>
            <span className="text-white/65">{event.toName}</span>
          </div>
          <span className="text-[10px] text-white/25 pl-0.5">
            confidence: {Math.round(event.edge.strength * 100)}%
            {event.edge.status === 'pending' && (
              <span className="ml-1 text-amber-400/40">(pending)</span>
            )}
          </span>
        </div>
      )
    }
  }
}
