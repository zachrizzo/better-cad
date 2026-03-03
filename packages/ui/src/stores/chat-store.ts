import { create } from 'zustand'
import type Anthropic from '@anthropic-ai/sdk'
import type { UiChatMessage } from '../services/ai-service'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Chat {
  id: string
  title: string
  uiMessages: UiChatMessage[]
  apiMessages: Anthropic.MessageParam[]
  planMode: boolean
  createdAt: number
}

interface ChatState {
  /** All chats keyed by id */
  chats: Map<string, Chat>
  /** Currently active chat id */
  activeChatId: string | null
  /** Whether a stream is in progress */
  isStreaming: boolean
  /** The id of the assistant message currently being streamed */
  streamingAssistantId: string | null
  /** AbortController for the current streaming generation */
  abortController: AbortController | null

  // ── Actions ──
  createChat: () => string
  deleteChat: (id: string) => void
  setActiveChat: (id: string) => void
  setUiMessages: (chatId: string, updater: UiChatMessage[] | ((prev: UiChatMessage[]) => UiChatMessage[])) => void
  setApiMessages: (chatId: string, msgs: Anthropic.MessageParam[]) => void
  setPlanMode: (chatId: string, on: boolean) => void
  setChatTitle: (chatId: string, title: string) => void
  setIsStreaming: (v: boolean) => void
  setStreamingAssistantId: (id: string | null) => void
  setAbortController: (controller: AbortController | null) => void
  stopGeneration: () => void

  // ── Derived helpers ──
  getActiveChat: () => Chat | undefined
  getChatList: () => Chat[]
}

// ── Welcome message ──────────────────────────────────────────────────────

const WELCOME_MESSAGE: UiChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hello! I'm your AI BIM assistant. Describe what you want to build and I'll create it for you. Try: \"Create a small house with 4 walls, a door, and 2 windows\"",
}

function makeNewChat(): Chat {
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    uiMessages: [WELCOME_MESSAGE],
    apiMessages: [],
    planMode: true,
    createdAt: Date.now(),
  }
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => {
  const initial = makeNewChat()

  return {
    chats: new Map([[initial.id, initial]]),
    activeChatId: initial.id,
    isStreaming: false,
    streamingAssistantId: null,
    abortController: null,

    createChat: () => {
      const chat = makeNewChat()
      set((s) => {
        const next = new Map(s.chats)
        next.set(chat.id, chat)
        return { chats: next, activeChatId: chat.id }
      })
      return chat.id
    },

    deleteChat: (id) => {
      set((s) => {
        const next = new Map(s.chats)
        next.delete(id)
        // If we deleted the active chat, switch to the most recent remaining
        let newActiveId = s.activeChatId
        if (s.activeChatId === id) {
          const remaining = Array.from(next.values()).sort((a, b) => b.createdAt - a.createdAt)
          newActiveId = remaining[0]?.id ?? null
        }
        // If no chats left, create a new one
        if (next.size === 0) {
          const fresh = makeNewChat()
          next.set(fresh.id, fresh)
          newActiveId = fresh.id
        }
        return { chats: next, activeChatId: newActiveId }
      })
    },

    setActiveChat: (id) => {
      if (get().chats.has(id)) {
        set({ activeChatId: id })
      }
    },

    setUiMessages: (chatId, updater) => {
      set((s) => {
        const chat = s.chats.get(chatId)
        if (!chat) return s
        const next = new Map(s.chats)
        const newMessages = typeof updater === 'function' ? updater(chat.uiMessages) : updater
        next.set(chatId, { ...chat, uiMessages: newMessages })
        return { chats: next }
      })
    },

    setApiMessages: (chatId, msgs) => {
      set((s) => {
        const chat = s.chats.get(chatId)
        if (!chat) return s
        const next = new Map(s.chats)
        next.set(chatId, { ...chat, apiMessages: msgs })
        return { chats: next }
      })
    },

    setPlanMode: (chatId, on) => {
      set((s) => {
        const chat = s.chats.get(chatId)
        if (!chat) return s
        const next = new Map(s.chats)
        next.set(chatId, { ...chat, planMode: on })
        return { chats: next }
      })
    },

    setChatTitle: (chatId, title) => {
      set((s) => {
        const chat = s.chats.get(chatId)
        if (!chat) return s
        const next = new Map(s.chats)
        next.set(chatId, { ...chat, title })
        return { chats: next }
      })
    },

    setIsStreaming: (v) => set({ isStreaming: v }),
    setStreamingAssistantId: (id) => set({ streamingAssistantId: id }),
    setAbortController: (controller) => set({ abortController: controller }),
    stopGeneration: () => {
      const { abortController } = get()
      if (abortController) {
        abortController.abort()
      }
    },

    getActiveChat: () => {
      const s = get()
      return s.activeChatId ? s.chats.get(s.activeChatId) : undefined
    },

    getChatList: () => {
      return Array.from(get().chats.values()).sort((a, b) => b.createdAt - a.createdAt)
    },
  }
})
