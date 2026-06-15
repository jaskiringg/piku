import type { NavKey } from './Sidebar'

const DOCK: { key: NavKey; label: string; glyph: string }[] = [
  { key: 'home',      label: 'Home',      glyph: '⌂' },
  { key: 'models',    label: 'Models',    glyph: '◈' },
  { key: 'projects',  label: 'Projects',  glyph: '▤' },
  { key: 'knowledge', label: 'Knowledge', glyph: '✦' },
  { key: 'apps',      label: 'Apps',      glyph: '⊞' },
  { key: 'settings',  label: 'Settings',  glyph: '⚙' },
]

export function Dock({ view, onNavigate }: { view: NavKey; onNavigate: (k: NavKey) => void }) {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/10 ring-1 ring-inset ring-white/5 px-2 py-1.5 shadow-[0_18px_60px_-16px_rgba(0,0,0,0.9)]">
      {DOCK.map(it => {
        const active = view === it.key
        return (
          <button key={it.key} onClick={() => onNavigate(it.key)} title={it.label}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3.5 py-1.5 transition-colors
              ${active ? 'text-cyan-200 bg-cyan-500/15' : 'text-white/45 hover:text-white/80 hover:bg-white/5'}`}>
            <span className="text-base leading-none">{it.glyph}</span>
            <span className="text-[9px] tracking-wide">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
