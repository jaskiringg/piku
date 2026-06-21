import { useEffect, useState } from 'react'
import type { Memory } from '../types'
import { MemoryService } from '../MemoryService'

// Real memories from the World Model, newest first, for the OS left-rail panel.
const memoryService = new MemoryService()

export function MemoriesPanel() {
  const [memories, setMemories] = useState<Memory[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await memoryService.getAll()
        if (!cancelled) setMemories(all.sort((a, b) => b.createdAt - a.createdAt))
      } catch {
        if (!cancelled) setMemories([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (memories === null) return <p className="text-[11px] text-white/25 py-2">loading…</p>
  if (memories.length === 0) {
    return (
      <p className="text-[11px] text-white/35 py-2 leading-relaxed">
        No memories yet. As you talk, Piku quietly remembers facts about you — they'll appear here with their category.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {memories.map(m => (
        <div key={m.id} className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] uppercase tracking-wider text-cyan-300/50">
              {m.category.replace(/_/g, ' ')}
            </span>
            {m.status === 'pending' && <span className="text-[9px] text-cyan-400/40">pending</span>}
          </div>
          <div className="text-xs text-white/70 leading-relaxed">{m.content}</div>
        </div>
      ))}
    </div>
  )
}
