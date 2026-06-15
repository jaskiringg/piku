import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useIpc(onHotkeyPressed: () => void, onCloseRequest: () => void): void {
  useEffect(() => {
    const unlistenHotkey = listen('hotkey-pressed', () => onHotkeyPressed())
    const unlistenClose = listen('overlay-close-request', () => onCloseRequest())
    return () => {
      void unlistenHotkey.then(fn => fn())
      void unlistenClose.then(fn => fn())
    }
  }, [onHotkeyPressed, onCloseRequest])
}
