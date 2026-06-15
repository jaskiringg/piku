import { useEffect, useRef, useCallback } from 'react'
import type { Message }       from '../../../types'
import { ConversationStore }  from '../../memory'
import { logger }             from '../../../lib/logger'

// One rolling conversation per install (Sprint 2.5-B). On mount we resume the
// most recent conversation so chat history survives overlay close/reopen and
// app restart; each completed exchange is written fire-and-forget so it never
// blocks the chat path (Invariant 3). Streaming token updates happen while
// isSending is true and are deliberately not persisted mid-flight.
const store = new ConversationStore()

interface Options {
  chatHistory:    Message[]
  setChatHistory: (messages: Message[]) => void
  isSending:      boolean
}

export function useConversationPersistence({ chatHistory, setChatHistory, isSending }: Options) {
  const idRef        = useRef<string | null>(null)
  const startedAtRef = useRef<number>(Date.now())
  const interacted   = useRef(false)  // true once the first send begins

  // Resume the latest conversation on mount.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const latest = await store.getLatest()
        if (cancelled) return
        if (latest) {
          idRef.current        = latest.id
          startedAtRef.current = latest.startedAt
          // Don't clobber a conversation the user already started typing into.
          if (latest.messages.length && !interacted.current) {
            setChatHistory(latest.messages)
          }
        } else {
          idRef.current = crypto.randomUUID()
        }
      } catch (err) {
        logger.error('conversation load failed', { error: String(err) })
      }
    })()
    return () => { cancelled = true }
  }, [setChatHistory])

  const persist = useCallback((messages: Message[]) => {
    if (!messages.length) return
    if (!idRef.current) idRef.current = crypto.randomUUID()
    void store
      .save({
        id:        idRef.current,
        messages,
        startedAt: startedAtRef.current,
        updatedAt: Date.now(),
      })
      .catch(err => logger.error('conversation persist failed', { error: String(err) }))
  }, [])

  // Persist on send completion. While isSending is true (incl. token streaming)
  // we only mark that an exchange has begun; the write happens when it flips false.
  useEffect(() => {
    if (isSending) { interacted.current = true; return }
    if (!interacted.current) return
    persist(chatHistory)
  }, [isSending, chatHistory, persist])
}
