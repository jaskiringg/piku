import { useState } from 'react'
import type { Message, PresenceState } from '../../types'
import { useAppState }                        from '../../hooks/useAppState'
import { useChat, useConversationPersistence } from '../chat'
import { usePresenceCycle }                   from '../orb'
import { Sidebar, type NavKey }               from './Sidebar'
import { Dock }                               from './Dock'
import { Dashboard }                          from './Dashboard'
import { NeuralBackground }                   from '../overlay/components/NeuralBackground'
import { GraphCanvas }                        from '../graph/components/GraphCanvas'
import { ChatHistory }                        from '../chat/components/ChatHistory'
import { ChatInput }                          from '../chat/components/ChatInput'

// The Piku OS shell: sidebar + view + dock over a neural field, with a chat
// slide-over the "Ask piku" bar opens. The graph lives in the Knowledge view.
export function Shell() {
  const {
    presenceState, setPresenceState,
    chatHistory, setChatHistory,
    addMessage, updateLastPikuMessage, updateLastPikuThinking,
    inputText, setInputText,
  } = useAppState()

  const { sendMessage, isSending } = useChat({
    addMessage, setPresenceState, setInputText, updateLastPikuMessage, updateLastPikuThinking,
  })
  useConversationPersistence({ chatHistory, setChatHistory, isSending })
  usePresenceCycle(setPresenceState, isSending)

  const [view, setView] = useState<NavKey>('home')
  const [chatOpen, setChatOpen] = useState(false)

  const ask = () => {
    const t = inputText.trim()
    if (!t || isSending) return
    setChatOpen(true)
    sendMessage(t)
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#03060D] text-white flex antialiased">
      <NeuralBackground />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(12,40,60,0.5),transparent_70%)] pointer-events-none" />

      <Sidebar view={view} onNavigate={setView} />

      <main className="relative flex-1 min-w-0 overflow-y-auto z-10">
        {view === 'home' && (
          <Dashboard
            inputText={inputText}
            onInputChange={setInputText}
            isSending={isSending}
            onAsk={ask}
            onNavigate={setView}
          />
        )}
        {view === 'knowledge' && <div className="absolute inset-0"><GraphCanvas /></div>}
        {view !== 'home' && view !== 'knowledge' && <ComingSoon label={view} />}
      </main>

      <Dock view={view} onNavigate={setView} />

      {chatOpen && (
        <ChatPanelOverlay
          presence={presenceState}
          messages={chatHistory}
          inputText={inputText}
          isSending={isSending}
          onInputChange={setInputText}
          onSend={ask}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-8">
      <span className="text-cyan-300/60 text-3xl drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]">✦</span>
      <div className="text-white/75 text-lg capitalize">{label}</div>
      <div className="text-white/35 text-sm max-w-sm">This surface is specified in the UI plan — its data and actions wire in a later sprint.</div>
    </div>
  )
}

function ChatPanelOverlay({ presence, messages, inputText, isSending, onInputChange, onSend, onClose }: {
  presence:      PresenceState
  messages:      Message[]
  inputText:     string
  isSending:     boolean
  onInputChange: (t: string) => void
  onSend:        () => void
  onClose:       () => void
}) {
  return (
    <div className="absolute top-0 right-0 bottom-0 w-[420px] z-40 bg-black/55 backdrop-blur-2xl border-l border-white/10 flex flex-col p-4 shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-white/80 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${presence === 'thinking' ? 'bg-cyan-300 animate-pulse' : 'bg-cyan-400'}`} />
          Piku
        </span>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ChatHistory messages={messages} />
      </div>
      <div className="mt-3 rounded-2xl bg-white/[0.05] border border-white/10 px-3 py-1.5">
        <ChatInput value={inputText} isLoading={isSending} onChange={onInputChange} onSend={onSend} />
      </div>
    </div>
  )
}
