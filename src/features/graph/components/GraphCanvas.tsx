import { useEffect, useRef, useState, useCallback } from 'react'
import { graphService } from '../index'

// World-Model graph as the OS centerpiece (Obsidian-style, but ours).
// Force-laid-out node-link map: pan, zoom, zoom-to-fit, search/filter, and a
// node detail card on click. Renders a mock graph synchronously so it's never
// empty, then swaps in the real graphNodes/graphEdges from IndexedDB.

const COLOR: Record<string, string> = {
  project: '#60A5FA', goal: '#A78BFA', skill: '#34D399', person: '#FBBF24',
  memory: '#F472B6', decision: '#FB923C', technology: '#38BDF8', concept: '#22D3EE',
}
const DEFAULT_COLOR = '#93C5FD'

interface PNode { id: string; name: string; type: string; x: number; y: number; vx: number; vy: number; deg: number }
interface PLink { from: string; to: string }
type RawNode = { id: string; name: string; type: string }

const W = 1600
const H = 1000

const MOCK_NODES: RawNode[] = [
  { id: 'piku', name: 'Piku', type: 'project' },
  { id: 'wm', name: 'World Model', type: 'concept' },
  { id: 'obs', name: 'Observation Loop', type: 'goal' },
  { id: 'graph', name: 'Knowledge Graph', type: 'concept' },
  { id: 'mem', name: 'Memory', type: 'memory' },
  { id: 'ollama', name: 'Ollama', type: 'technology' },
  { id: 'qwen', name: 'qwen3', type: 'technology' },
  { id: 'tauri', name: 'Tauri', type: 'technology' },
  { id: 'jas', name: 'Jaskirat', type: 'person' },
  { id: 'local', name: 'Local-first', type: 'decision' },
  { id: 'companion', name: 'Ambient Companion', type: 'goal' },
]
const MOCK_LINKS: PLink[] = [
  ['piku', 'wm'], ['piku', 'obs'], ['piku', 'tauri'], ['piku', 'ollama'],
  ['wm', 'graph'], ['wm', 'mem'], ['ollama', 'qwen'], ['jas', 'piku'],
  ['piku', 'local'], ['graph', 'obs'], ['piku', 'companion'], ['obs', 'companion'],
].map(([from, to]) => ({ from, to }))

function toPNodes(raw: RawNode[]): PNode[] {
  return raw.map(n => ({
    ...n,
    x: W / 2 + (Math.random() - 0.5) * W * 0.6,
    y: H / 2 + (Math.random() - 0.5) * H * 0.6,
    vx: 0, vy: 0, deg: 0,
  }))
}

function computeLayout(nodes: PNode[], links: PLink[]): void {
  const cx = W / 2, cy = H / 2
  const byId = new Map(nodes.map(n => [n.id, n]))
  for (const l of links) { const a = byId.get(l.from), b = byId.get(l.to); if (a) a.deg++; if (b) b.deg++ }
  const REPULSE = 9000, SPRING = 0.012, LINK_LEN = 110, GRAVITY = 0.025, DAMP = 0.85
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const d2 = dx * dx + dy * dy || 0.01
        const d = Math.sqrt(d2)
        const f = REPULSE / d2
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }
    }
    for (const l of links) {
      const a = byId.get(l.from), b = byId.get(l.to)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = (d - LINK_LEN) * SPRING
      a.vx += (dx / d) * f; a.vy += (dy / d) * f
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }
    for (const n of nodes) {
      n.vx += (cx - n.x) * GRAVITY; n.vy += (cy - n.y) * GRAVITY
      n.vx *= DAMP; n.vy *= DAMP
      n.x += n.vx; n.y += n.vy
    }
  }
}

function buildGraph(rawNodes: RawNode[], links: PLink[]): { nodes: PNode[]; links: PLink[] } {
  const nodes = toPNodes(rawNodes)
  computeLayout(nodes, links)
  return { nodes, links }
}

export function GraphCanvas() {
  const [graph, setGraph] = useState(() => buildGraph(MOCK_NODES, MOCK_LINKS))
  const [view, setView] = useState({ tx: 0, ty: 0, k: 0.62 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [allNodes, confirmed] = await Promise.all([
          graphService.getAllNodes(),
          graphService['store'].getConfirmedEdges(),
        ])
        if (cancelled || allNodes.length === 0) return
        const raw: RawNode[] = allNodes.map(n => ({ id: n.id, name: n.name, type: n.type }))
        const links: PLink[] = confirmed.map(e => ({ from: e.fromId, to: e.toId }))
        setGraph(buildGraph(raw, links))
      } catch { /* keep mock */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Zoom-to-fit: frame the whole graph in the viewport whenever data changes.
  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const vw = el.clientWidth, vh = el.clientHeight
    if (vw === 0 || vh === 0) { requestAnimationFrame(() => fitView()); return }
    if (graph.nodes.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of graph.nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y)
    }
    const pad = 130
    const bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2
    const k = Math.max(0.3, Math.min(1.5, Math.min(vw / bw, vh / bh)))
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setView({ tx: vw / 2 - cx * k, ty: vh / 2 - cy * k - vh * 0.04, k })
  }, [graph])

  useEffect(() => { fitView() }, [fitView])

  const onWheel = useCallback((e: React.WheelEvent) => {
    setView(v => ({ ...v, k: Math.min(2.5, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }))
  }, [])
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }; moved.current = false
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true
    drag.current = { x: e.clientX, y: e.clientY }
    setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
  }, [])
  const onPointerUp = useCallback(() => { drag.current = null }, [])
  const onBackgroundClick = useCallback(() => { if (!moved.current) setSelectedId(null) }, [])

  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  const selected = selectedId ? byId.get(selectedId) : undefined
  const neighbors = selected
    ? Array.from(new Set(
        graph.links
          .filter(l => l.from === selected.id || l.to === selected.id)
          .map(l => (l.from === selected.id ? l.to : l.from))
      )).map(id => byId.get(id)).filter((n): n is PNode => !!n)
    : []

  const q = query.trim().toLowerCase()
  const presentTypes = Array.from(new Set(graph.nodes.map(n => n.type))).sort()

  return (
    <div ref={containerRef} className="absolute inset-0">
      <svg
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={onBackgroundClick}
      >
        <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.k})`}>
          {graph.links.map((l, i) => {
            const a = byId.get(l.from), b = byId.get(l.to)
            if (!a || !b) return null
            const active = selected && (l.from === selected.id || l.to === selected.id)
            return (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#3B82F6" strokeOpacity={active ? 0.5 : 0.18} strokeWidth={active ? 1.8 : 1.2} />
            )
          })}
          {graph.nodes.map(n => {
            const c = COLOR[n.type] ?? DEFAULT_COLOR
            const r = 5 + Math.min(10, n.deg * 1.6)
            const selDim = selected && n.id !== selected.id && !neighbors.some(nb => nb.id === n.id)
            const qDim = q.length > 0 && !n.name.toLowerCase().includes(q)
            const dim = selDim || qDim
            return (
              <g key={n.id} className="cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setSelectedId(n.id) }}>
                <circle cx={n.x} cy={n.y} r={r + 13} fill={c} opacity={dim ? 0.03 : 0.10} />
                <circle cx={n.x} cy={n.y} r={r + 4} fill={c} opacity={dim ? 0.08 : 0.30} />
                <circle cx={n.x} cy={n.y} r={r} fill={c} opacity={dim ? 0.3 : 1} />
                <circle cx={n.x - r * 0.32} cy={n.y - r * 0.32} r={r * 0.42} fill="#ffffff" opacity={dim ? 0 : 0.55} />
                {selected?.id === n.id && (
                  <circle cx={n.x} cy={n.y} r={r + 4} fill="none" stroke={c} strokeOpacity={0.8} strokeWidth={1.5} />
                )}
                <text x={n.x} y={n.y + r + 13} textAnchor="middle"
                  fontSize={12} fill="#ffffff" fillOpacity={dim ? 0.18 : 0.6}
                  style={{ pointerEvents: 'none' }}>
                  {n.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Graph search */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30">
        <div className="flex items-center gap-2 rounded-full bg-white/[0.05] backdrop-blur-xl border border-white/10 px-3 py-1.5 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.7)]">
          <span className="text-white/30 text-xs">⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="filter the graph…"
            className="bg-transparent text-xs text-white/85 placeholder:text-white/30 outline-none w-44" />
          {query && <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/65 text-xs">✕</button>}
        </div>
      </div>

      {/* Legend + fit */}
      <div className="absolute bottom-7 right-6 z-30 flex flex-col items-end gap-1 rounded-xl bg-white/[0.04] backdrop-blur-xl border border-white/10 px-3 py-2">
        <button onClick={fitView} className="text-[10px] text-white/35 hover:text-white/75 mb-0.5 transition-colors">⊡ fit</button>
        {presentTypes.map(t => (
          <div key={t} className="flex items-center gap-2 text-[10px] text-white/45 self-start">
            <span className="w-2 h-2 rounded-full" style={{ background: COLOR[t] ?? DEFAULT_COLOR }} />
            {t}
          </div>
        ))}
      </div>

      {/* Node detail card */}
      {selected && (
        <div className="absolute top-28 right-6 w-72 z-30 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 p-4 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider"
              style={{ color: COLOR[selected.type] ?? DEFAULT_COLOR }}>
              {selected.type}
            </span>
            <button onClick={() => setSelectedId(null)}
              className="text-white/30 hover:text-white/70 text-xs leading-none">✕</button>
          </div>
          <div className="text-white/90 text-base mb-3">{selected.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">
            Connected to ({neighbors.length})
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {neighbors.length ? neighbors.map(nb => (
              <button key={nb.id} onClick={() => setSelectedId(nb.id)}
                className="text-[11px] text-white/55 hover:text-white/85 bg-white/5 hover:bg-white/10 border border-white/10 rounded px-2 py-0.5 transition-colors">
                {nb.name}
              </button>
            )) : <span className="text-[11px] text-white/25">nothing yet</span>}
          </div>
          <div className="flex gap-2">
            <button className="text-[11px] text-blue-300/60 hover:text-blue-300 border border-blue-400/20 rounded px-2.5 py-1 transition-colors">ask about this</button>
            <button className="text-[11px] text-white/30 hover:text-white/55 border border-white/10 rounded px-2.5 py-1 transition-colors">open in Vault</button>
          </div>
        </div>
      )}
    </div>
  )
}
