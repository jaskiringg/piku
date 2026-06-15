import { useEffect } from 'react'
import type { PresenceState } from '../../../types'

// Cycles the orb through idle→thinking→listening when no chat is active.
// Pauses during chat (isActive=true) so the chat pipeline owns presence state.
export function usePresenceCycle(
  setPresenceState: (state: PresenceState) => void,
  isActive: boolean,
): void {
  useEffect(() => {
    if (isActive) return

    const steps: [PresenceState, number][] = [
      ['idle',      3000],
      ['thinking',  1000],
      ['listening', 2000],
    ]
    let index = 0
    let timer: ReturnType<typeof setTimeout>

    const cycle = () => {
      const [state, duration] = steps[index]
      setPresenceState(state)
      index = (index + 1) % steps.length
      timer = setTimeout(cycle, duration)
    }

    cycle()
    return () => clearTimeout(timer)
  }, [setPresenceState, isActive])
}
