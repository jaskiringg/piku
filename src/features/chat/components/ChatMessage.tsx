import { useState } from 'react'
import type { Message } from '../../../types'

interface Props {
  message: Message
}

export function ChatMessage({ message }: Props) {
  const isUser   = message.sender === 'user'
  const thinking = (!isUser && message.thinking?.trim()) || ''
  const [showThinking, setShowThinking] = useState(true)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-xs rounded-xl px-3 py-2 text-sm
          ${isUser
            ? 'bg-blue-600/20 text-blue-100'
            : 'bg-white/5 text-white/80'
          }
        `}
      >
        {thinking && (
          <div className="mb-1.5">
            <button
              type="button"
              onClick={() => setShowThinking(v => !v)}
              className="text-[11px] italic text-blue-300/50 hover:text-blue-300/80 select-none transition-colors"
            >
              {showThinking ? '▾ thinking' : '▸ thinking'}
            </button>
            {showThinking && (
              <div className="mt-1 whitespace-pre-wrap border-l border-blue-400/20 pl-2 text-[11px] leading-relaxed text-white/40 italic">
                {thinking}
              </div>
            )}
          </div>
        )}
        <span className="text-white/40 text-xs mr-1">
          {isUser ? 'You' : 'Piku'}:
        </span>
        {message.text}
      </div>
    </div>
  )
}
