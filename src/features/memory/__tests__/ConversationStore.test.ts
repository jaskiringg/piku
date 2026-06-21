// ── IDB polyfill — must be first ──────────────────────────────────────────
import 'fake-indexeddb/auto'

import { describe, it, expect } from 'vitest'
import { ConversationStore }    from '../ConversationStore'
import type { Conversation }    from '../types'

function makeConversation(id: string, updatedAt: number): Conversation {
  return {
    id,
    messages: [
      { id: `${id}-m1`, sender: 'user', text: 'hello' },
      { id: `${id}-m2`, sender: 'piku', text: 'hi there' },
    ],
    startedAt: updatedAt - 1000,
    updatedAt,
  }
}

// Tests run sequentially within a file (vitest default), so they build on
// shared store state intentionally — the v6 `conversations` store is created
// on first openMemoryDB() against fake-indexeddb.
describe('ConversationStore', () => {
  const store = new ConversationStore()

  it('saves and retrieves a conversation by id', async () => {
    const conv = makeConversation('c1', 1000)
    await store.save(conv)
    const got = await store.get('c1')
    expect(got).toEqual(conv)
    expect(got?.messages).toHaveLength(2)
  })

  it('upserts on save with the same id', async () => {
    const conv = makeConversation('c1', 2000)
    conv.messages.push({ id: 'c1-m3', sender: 'user', text: 'more' })
    await store.save(conv)
    const got = await store.get('c1')
    expect(got?.updatedAt).toBe(2000)
    expect(got?.messages).toHaveLength(3)
    expect(await store.count()).toBe(1)
  })

  it('getLatest returns the most-recently-updated conversation', async () => {
    await store.save(makeConversation('c2', 500))   // older than c1
    await store.save(makeConversation('c3', 5000))  // newest
    const latest = await store.getLatest()
    expect(latest?.id).toBe('c3')
  })

  it('getAll returns every conversation', async () => {
    const all = await store.getAll()
    expect(all.map(c => c.id).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('deletes a conversation', async () => {
    await store.delete('c2')
    expect(await store.get('c2')).toBeUndefined()
    expect(await store.count()).toBe(2)
  })

  it('getLatest returns undefined when the store is empty', async () => {
    for (const c of await store.getAll()) await store.delete(c.id)
    expect(await store.getLatest()).toBeUndefined()
    expect(await store.count()).toBe(0)
  })
})
