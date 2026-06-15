import type { PresenceState } from '../../../types'

interface Props {
  presenceState: PresenceState
}

// Placeholder — Canvas particle system implemented in v0.0 orb task.
// useRef + requestAnimationFrame loop added there.
// presenceState prop drives particle speed/density/pattern.
export function ParticleOrb({ presenceState: _ }: Props) {
  return (
    <div className="w-48 h-48 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
      <span className="text-blue-400/30 text-xs tracking-widest uppercase">orb</span>
    </div>
  )
}
