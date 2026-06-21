// Shared TypeScript types for Piku.
// Imported by features and global hooks — not by each other directly.

// The orb's presence. idle/listening/thinking are the three base motions tuned in orb/variants.ts;
// acting/speaking/updating are real-loop states (running a tool / speaking a reply / weaving the
// turn into the World Model) — OrbCore maps each to a base motion + a distinct cue.
export type PresenceState = 'idle' | 'listening' | 'thinking' | 'acting' | 'speaking' | 'updating'

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
