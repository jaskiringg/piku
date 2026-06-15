import type { Message } from '../../../types'
import { ChatMessage } from './ChatMessage'

interface Props {
  messages: Message[]
}

// Auto-scroll to latest message wired in v0.0 chat task (useRef + useEffect).
export function ChatHistory({ messages }: Props) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto max-h-48 w-full">
      {messages.map(m => (
        <ChatMessage key={m.id} message={m} />
      ))}
    </div>
  )
}
