export type NavKey =
  | 'home' | 'models' | 'projects' | 'knowledge' | 'datasets'
  | 'apps' | 'files' | 'calendar' | 'people' | 'settings'

const ITEMS: { key: NavKey; label: string; glyph: string }[] = [
  { key: 'home',      label: 'Home',      glyph: '⌂' },
  { key: 'models',    label: 'Models',    glyph: '◈' },
  { key: 'projects',  label: 'Projects',  glyph: '▤' },
  { key: 'knowledge', label: 'Knowledge', glyph: '✦' },
  { key: 'datasets',  label: 'Datasets',  glyph: '≣' },
  { key: 'apps',      label: 'Apps',      glyph: '⊞' },
  { key: 'files',     label: 'Files',     glyph: '▭' },
  { key: 'calendar',  label: 'Calendar',  glyph: '◷' },
  { key: 'people',    label: 'People',    glyph: '◍' },
  { key: 'settings',  label: 'Settings',  glyph: '⚙' },
]

export function Sidebar({ view, onNavigate }: { view: NavKey; onNavigate: (k: NavKey) => void }) {
  return (
    <aside className="relative z-20 w-56 shrink-0 h-full flex flex-col bg-black/30 backdrop-blur-xl border-r border-white/10 px-3 py-5">
      <div className="flex items-center gap-2 px-2 mb-7">
        <span className="text-cyan-300 text-xl drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">✦</span>
        <span className="text-lg font-semibold tracking-tight text-white/90">piku</span>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {ITEMS.map(it => {
          const active = view === it.key
          return (
            <button key={it.key} onClick={() => onNavigate(it.key)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors
                ${active
                  ? 'bg-cyan-500/15 text-cyan-100 border border-cyan-400/20'
                  : 'text-white/55 hover:text-white/90 hover:bg-white/[0.04] border border-transparent'}`}>
              <span className={`w-4 text-center ${active ? 'text-cyan-300' : 'text-white/40'}`}>{it.glyph}</span>
              {it.label}
            </button>
          )
        })}
      </nav>
      <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/20 px-3 py-3 flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-full bg-cyan-400/20 flex items-center justify-center text-cyan-300 shrink-0">✦</span>
        <span className="text-xs text-white/60 leading-snug">
          piku is here.<br /><span className="text-white/40">How can I help?</span>
        </span>
      </div>
    </aside>
  )
}
