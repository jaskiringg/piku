// Provides a file-picker path for the UpdateContextPanel.
// Uses the browser File API — no Tauri plugin or Rust command required.
// Works in Tauri's WKWebView (macOS) without additional capabilities config.

export class DocumentAbsorptionService {
  // Opens a native file picker filtered to .md and .txt files.
  // Resolves with the file content string, or null if the user cancelled.
  pickAndRead(): Promise<{ content: string; filename: string } | null> {
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type   = 'file'
      input.accept = '.md,.txt,.markdown'

      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }

        const reader = new FileReader()
        reader.onload  = () => resolve({ content: reader.result as string, filename: file.name })
        reader.onerror = () => resolve(null)
        reader.readAsText(file, 'utf-8')
      }

      // Cancelled when focus returns to window without a selection
      window.addEventListener(
        'focus',
        () => { if (!input.files?.length) resolve(null) },
        { once: true },
      )

      input.click()
    })
  }
}

export const documentAbsorptionService = new DocumentAbsorptionService()
