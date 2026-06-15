// Shared TypeScript types for Piku.
// Imported by features and global hooks — not by each other directly.

export type PresenceState = 'idle' | 'listening' | 'thinking'

export type Sender = 'user' | 'piku'

export interface Message {
  id: string
  sender: Sender
  text: string
  thinking?: string   // piku's reasoning (qwen3 <think> tokens), shown collapsibly
}

export interface AppState {
  overlayVisible: boolean
  presenceState: PresenceState
  chatHistory: Message[]
  inputText: string
}
