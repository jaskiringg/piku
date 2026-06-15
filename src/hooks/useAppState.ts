import { useState, useCallback } from 'react'
import type { Message, PresenceState, Sender } from '../types'

// Central state hook — single source of truth for all app state (ADR-007).
// All state setters live here; components receive only what they need via props.
export function useAppState() {
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [presenceState, setPresenceState] = useState<PresenceState>('idle')
  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')

  const toggleOverlay = () => {
    setOverlayVisible(v => !v)
  }

  const addMessage = (sender: Sender, text: string) => {
    setChatHistory(prev => [
      ...prev,
      { id: crypto.randomUUID(), sender, text },
    ])
  }

  // Replaces the text of the most recent piku message in-place (for streaming).
  const updateLastPikuMessage = useCallback((text: string) => {
    setChatHistory(prev => {
      const copy = [...prev]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].sender === 'piku') {
          copy[i] = { ...copy[i], text }
          return copy
        }
      }
      return copy
    })
  }, [])

  // Updates the reasoning (<think> tokens) of the most recent piku message,
  // shown collapsibly in the UI as it streams.
  const updateLastPikuThinking = useCallback((thinking: string) => {
    setChatHistory(prev => {
      const copy = [...prev]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].sender === 'piku') {
          copy[i] = { ...copy[i], thinking }
          return copy
        }
      }
      return copy
    })
  }, [])

  return {
    overlayVisible,
    presenceState,
    chatHistory,
    inputText,
    setInputText,
    setPresenceState,
    setChatHistory,        // used by conversation persistence to resume history
    toggleOverlay,
    addMessage,
    updateLastPikuMessage,
    updateLastPikuThinking,
  }
}
