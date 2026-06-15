import { getCurrentWindow } from '@tauri-apps/api/window'
import { Shell }            from './features/os/Shell'
import { AmbientPopup }     from './features/overlay/components/AmbientPopup'

// Each Tauri window loads this same app; we render by window label.
// `?view=orb` / `?view=os` lets a plain browser preview either surface.
function resolveView(): 'orb' | 'os' {
  try {
    const q = new URLSearchParams(window.location.search).get('view')
    if (q === 'orb') return 'orb'
    if (q === 'os') return 'os'
    if ('__TAURI_INTERNALS__' in window) {
      return getCurrentWindow().label === 'orb' ? 'orb' : 'os'
    }
  } catch { /* not in Tauri */ }
  return 'os'
}
const VIEW = resolveView()

function App() {
  return VIEW === 'orb' ? <AmbientPopup /> : <Shell />
}

export default App
