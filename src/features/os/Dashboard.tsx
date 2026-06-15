import { useEffect, useState } from 'react'
import { Card } from './Card'
import type { NavKey } from './Sidebar'
import { NeuralBackground } from '../overlay/components/NeuralBackground'
import { projectService } from '../projects/components/ProjectDashboard'

interface Props {
  inputText:     string
  onInputChange: (t: string) => void
  isSending:     boolean
  onAsk:         () => void
  onNavigate:    (k: NavKey) => void
}

const MODELS = [
  { name: 'Nova 1.3',      kind: 'LLM · 70B params',       status: 'Running' },
  { name: 'Visionix',      kind: 'Vision · 8B params',     status: 'Idle' },
  { name: 'Embedder Pro',  kind: 'Embedding · 1.3B params', status: 'Idle' },
  { name: 'Piku Reranker', kind: 'Ranker · 335M params',   status: 'Running' },
]
const ACTIVITY = [
  { t: 'Model trained',       s: 'Nova 1.3',           ago: '2m ago' },
  { t: 'Dataset uploaded',    s: 'product_data_v2.csv', ago: '15m ago' },
  { t: 'Project updated',     s: 'Piku OS Core',       ago: '1h ago' },
  { t: 'Inference completed', s: 'Visionix',           ago: '2h ago' },
]
const TASKS = [
  { t: 'Training Nova 1.3',       p: 68 },
  { t: 'Fine-tuning Visionix',    p: 42 },
  { t: 'Indexing knowledge base', p: 91 },
  { t: 'Evaluating Piku Reranker', p: 27 },
]
const STATUS = [
  { t: 'Core Systems', v: 'Online' },
  { t: 'AI Services',  v: 'Online' },
  { t: 'Data Layer',   v: 'Healthy' },
  { t: 'Vector DB',    v: 'Online' },
]
const QUICK = ['New Model', 'New Project', 'Upload Dataset', 'Create Note', 'Run Inference', 'Open Playground']
const MOCK_PROJECTS = [
  { name: 'Piku OS Core',          state: 'In Progress' },
  { name: 'Personal AI Assistant', state: 'In Progress' },
  { name: 'Research Copilot',      state: 'Planning' },
  { name: 'DataSynth Engine',      state: 'In Progress' },
]

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
function dateline(): string {
  const d = new Date()
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function Dashboard({ inputText, onInputChange, isSending, onAsk, onNavigate }: Props) {
  const [projects, setProjects] = useState(MOCK_PROJECTS)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await projectService.getAllProjects()
        if (!cancelled && all.length) {
          setProjects(all.slice(0, 4).map(p => ({ name: p.name, state: p.currentState || 'Active' })))
        }
      } catch { /* keep mock */ }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="px-8 py-7 pb-28 max-w-[1500px] mx-auto">
      {/* Greeting */}
      <div className="text-center mb-5">
        <div className="text-xs text-white/40 mb-2">{dateline()}</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white/95">
          {greeting()}, Jaskirat <span className="text-cyan-300">✦</span>
        </h1>
        <p className="text-white/45 mt-1">Let's build, ship and evolve.</p>
      </div>

      {/* Ask bar */}
      <div className="max-w-3xl mx-auto mb-7">
        <div className="relative flex items-center gap-3 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/12 ring-1 ring-inset ring-white/5 pl-4 pr-2.5 py-3 shadow-[0_18px_70px_-14px_rgba(0,0,0,0.9),0_0_60px_-22px_rgba(34,211,238,0.55)]">
          <span className="text-cyan-300 text-lg">✦</span>
          <input
            value={inputText}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && inputText.trim() && !isSending) { e.preventDefault(); onAsk() } }}
            placeholder="Ask piku anything…"
            className="flex-1 bg-transparent text-[15px] text-white/90 placeholder:text-white/35 outline-none"
          />
          <button onClick={() => { if (inputText.trim() && !isSending) onAsk() }}
            className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-200 flex items-center justify-center hover:bg-cyan-500/30 transition-colors">≋</button>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Models */}
        <Card title="Models" action={<span className="text-[11px] text-cyan-300/70 cursor-pointer">+ New Model</span>} className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="flex flex-col gap-2.5">
            {MODELS.map(m => (
              <div key={m.name} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300/70 text-xs shrink-0">◈</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/85 truncate">{m.name}</div>
                  <div className="text-[10px] text-white/35 truncate">{m.kind}</div>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.status === 'Running' ? 'text-emerald-300/80 bg-emerald-500/10' : 'text-white/40 bg-white/5'}`}>{m.status}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-cyan-300/60 mt-3 cursor-pointer">View all models →</div>
        </Card>

        {/* Neural Activity */}
        <Card title="Neural Activity"
          action={<span className="text-[10px] text-emerald-300/80 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</span>}
          className="col-span-12 lg:col-span-6">
          <div className="relative h-40 rounded-xl overflow-hidden border border-white/5 mb-3 bg-[#040810]">
            <NeuralBackground />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[['Nodes', '24.6K'], ['Connections', '512K'], ['Tokens / s', '2.35M'], ['Inference ms', '38']].map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] text-white/35">{k}</div>
                <div className="text-sm text-white/85">{v}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Projects (real data) */}
        <Card title="Projects" action={<span className="text-[11px] text-cyan-300/70 cursor-pointer">+ New</span>} className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="flex flex-col gap-2.5">
            {projects.map(p => (
              <div key={p.name} className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300/70 text-xs shrink-0">▤</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/85 truncate">{p.name}</div>
                  <div className="text-[10px] text-white/35 truncate">{p.state}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate('projects')} className="text-[11px] text-cyan-300/60 mt-3">View all projects →</button>
        </Card>

        {/* Recent Activity */}
        <Card title="Recent Activity" className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="flex flex-col gap-2.5">
            {ACTIVITY.map(a => (
              <div key={a.t} className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-white/40 text-[10px] shrink-0">▣</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/80 truncate">{a.t}</div>
                  <div className="text-[10px] text-white/35 truncate">{a.s}</div>
                </div>
                <span className="text-[10px] text-white/30 shrink-0">{a.ago}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Active Tasks */}
        <Card title="Active Tasks" className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="flex flex-col gap-3 pt-1">
            {TASKS.map(t => (
              <div key={t.t}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white/70 truncate pr-2">{t.t}</span>
                  <span className="text-white/40">{t.p}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-400" style={{ width: `${t.p}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Knowledge Graph (mini) */}
        <Card title="Knowledge Graph" className="col-span-12 md:col-span-6 lg:col-span-3">
          <MiniGraph />
          <button onClick={() => onNavigate('knowledge')} className="text-[11px] text-cyan-300/60 mt-1">Open Knowledge →</button>
        </Card>

        {/* Quick Actions */}
        <Card title="Quick Actions" className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="flex flex-col gap-1.5">
            {QUICK.map(q => (
              <button key={q} className="flex items-center gap-2 text-xs text-white/60 hover:text-white/90 hover:bg-white/5 rounded-lg px-2.5 py-1.5 transition-colors text-left">
                <span className="text-cyan-300/60">+</span>{q}
              </button>
            ))}
          </div>
        </Card>

        {/* piku panel */}
        <Card className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="text-sm font-semibold text-white/85 mb-1">piku</div>
          <p className="text-xs text-white/45 mb-2">Your AI Operating System that thinks with you.</p>
          <div className="flex items-center justify-center py-3">
            <span className="relative flex w-20 h-20 items-center justify-center">
              <span className="absolute w-20 h-20 rounded-full bg-cyan-400/10 blur-xl" />
              <span className="absolute w-14 h-14 rounded-full border border-cyan-400/30" />
              <span className="text-cyan-200 text-2xl drop-shadow-[0_0_14px_rgba(34,211,238,0.85)]">✦</span>
            </span>
          </div>
        </Card>

        {/* System Status */}
        <Card title="System Status" className="col-span-12 md:col-span-6 lg:col-span-3">
          <div className="flex flex-col gap-2.5 pt-0.5">
            {STATUS.map(s => (
              <div key={s.t} className="flex items-center justify-between text-xs">
                <span className="text-white/55 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{s.t}</span>
                <span className="text-emerald-300/80">{s.v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* System Terminal */}
        <Card title="System Terminal" className="col-span-12 lg:col-span-6">
          <pre className="text-[11px] leading-relaxed font-mono text-emerald-300/70 bg-black/40 rounded-xl p-3 border border-white/5 overflow-x-auto">{`piku@os:~$ status
System: piku OS v1.0.0
Uptime: 2h 14m   Models: 4 loaded   Projects: 7
Active Users: 1
GPU: 78%   Memory: 62%   Storage: 1.2TB / 2TB
piku@os:~$ ▊`}</pre>
        </Card>
      </div>
    </div>
  )
}

function MiniGraph() {
  const hub = { x: 60, y: 65 }
  const nodes = [
    { x: 95, y: 40, label: 'Insights' },
    { x: 28, y: 32, label: 'Datasets' },
    { x: 22, y: 80, label: 'People' },
    { x: 96, y: 95, label: 'APIs' },
    { x: 52, y: 110, label: 'Files' },
  ]
  return (
    <svg viewBox="0 0 120 125" className="w-full h-28">
      {nodes.map((n, i) => (
        <line key={i} x1={hub.x} y1={hub.y} x2={n.x} y2={n.y} stroke="#22D3EE" strokeOpacity={0.28} strokeWidth={0.7} />
      ))}
      {nodes.map((n, i) => (
        <g key={'n' + i}>
          <circle cx={n.x} cy={n.y} r={3} fill="#7DD3FC" />
          <text x={n.x} y={n.y - 5} fontSize={5} fill="#ffffff" fillOpacity={0.4} textAnchor="middle">{n.label}</text>
        </g>
      ))}
      <circle cx={hub.x} cy={hub.y} r={7} fill="#22D3EE" opacity={0.25} />
      <circle cx={hub.x} cy={hub.y} r={4.5} fill="#22D3EE" />
    </svg>
  )
}
