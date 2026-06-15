import type { Message } from '../../../types'
import { ChatHistory } from './ChatHistory'
import { ChatInput }   from './ChatInput'

interface Props {
  chatHistory:   Message[]
  inputText:     string
  isLoading:     boolean
  onInputChange: (text: string) => void
  onSend:        (text: string) => void
}

export function ChatPanel({ chatHistory, inputText, isLoading, onInputChange, onSend }: Props) {
  return (
    <div className="w-full flex flex-col gap-3">
      <ChatHistory messages={chatHistory} />
      <ChatInput
        value={inputText}
        isLoading={isLoading}
        onChange={onInputChange}
        onSend={() => onSend(inputText)}
      />
    </div>
  )
}
