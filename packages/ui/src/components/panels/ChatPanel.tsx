import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Anthropic from '@anthropic-ai/sdk'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { streamBimChat, resetProxySession } from '../../services/ai-service'
import type { UiChatMessage } from '../../services/ai-service'
import type { KernelBackend } from '../../services/kernel-bridge'
import { useEntityStore } from '../../stores/entity-store'
import { useChatStore } from '../../stores/chat-store'

// ── Props ───────────────────────────────────────────────────────────────────

interface ChatPanelProps {
  kernel: KernelBackend
  visible: boolean
}

interface PlanTask {
  text: string
  done: boolean
}

function formatToolResult(result: string | undefined): string {
  if (!result) return ''
  try {
    const parsed = JSON.parse(result) as { error?: unknown; message?: unknown; success?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.message === 'string' && parsed.success !== true) return parsed.message
    return result
  } catch {
    return result
  }
}

function extractPlanTasks(markdown: string): PlanTask[] {
  const lines = markdown.split(/\r?\n/)
  const tasks: PlanTask[] = []

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]|\d+\.)\s+\[([ xX])\]\s+(.+?)\s*$/)
    if (match) {
      tasks.push({
        done: match[1].toLowerCase() === 'x',
        text: match[2],
      })
    }
  }

  return tasks
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChatPanel({ kernel, visible }: ChatPanelProps) {
  // ── Store state ──
  const chats = useChatStore((s) => s.chats)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const createChat = useChatStore((s) => s.createChat)
  const deleteChat = useChatStore((s) => s.deleteChat)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const setUiMessages = useChatStore((s) => s.setUiMessages)
  const setApiMessages = useChatStore((s) => s.setApiMessages)
  const setPlanMode = useChatStore((s) => s.setPlanMode)
  const setChatTitle = useChatStore((s) => s.setChatTitle)
  const setIsStreaming = useChatStore((s) => s.setIsStreaming)
  const setStreamingAssistantId = useChatStore((s) => s.setStreamingAssistantId)
  const setAbortController = useChatStore((s) => s.setAbortController)
  const stopGeneration = useChatStore((s) => s.stopGeneration)

  // ── Local state ──
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [attachedImages, setAttachedImages] = useState<Array<{ base64: string; mimeType: string; name: string }>>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeChat = useMemo(
    () => (activeChatId ? chats.get(activeChatId) : undefined),
    [activeChatId, chats],
  )
  const chatList = useMemo(
    () => Array.from(chats.values()).sort((a, b) => b.createdAt - a.createdAt),
    [chats],
  )

  const uiMessages = activeChat?.uiMessages ?? []
  const apiMessages = activeChat?.apiMessages ?? []
  const planMode = activeChat?.planMode ?? true

  // Auto-scroll whenever messages change
  useEffect(() => {
    if (visible) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [uiMessages, visible])

  // ── Auto-title: set chat title from first user message ───────────────────

  const autoTitle = useCallback(
    (chatId: string, text: string) => {
      const chat = useChatStore.getState().chats.get(chatId)
      if (chat && chat.title === 'New Chat') {
        const title = text.length > 40 ? text.slice(0, 40) + '...' : text
        setChatTitle(chatId, title)
      }
    },
    [setChatTitle],
  )

  // ── Streaming loop helper ──────────────────────────────────────────────────

  const runStreamingLoop = useCallback(
    async (
      chatId: string,
      initialApiMessages: Anthropic.MessageParam[],
      localPlanMode: boolean,
      assistantMsgId: string,
    ): Promise<void> => {
      const currentElements = Array.from(useEntityStore.getState().elements.values())
      const streamingAssistantIds = new Set<string>([assistantMsgId])
      let activeAssistantMsgId: string | null = assistantMsgId
      let startNewAssistantSegment = false

      const controller = new AbortController()
      setAbortController(controller)

      const gen = streamBimChat(initialApiMessages, currentElements, kernel, localPlanMode, controller.signal)

      const clearStreamingFlags = (appendStoppedNote: boolean): void => {
        setUiMessages(chatId, (prev) => {
          let lastStreamingAssistantId: string | null = null
          const next = prev.map((msg) => {
            if (msg.role === 'assistant' && streamingAssistantIds.has(msg.id)) {
              lastStreamingAssistantId = msg.id
              const { streaming: _streaming, ...rest } = msg
              return rest
            }
            return msg
          })
          if (!appendStoppedNote || !lastStreamingAssistantId) return next
          return next.map((msg) => {
            if (msg.role === 'assistant' && msg.id === lastStreamingAssistantId) {
              return { ...msg, content: msg.content + '\n\n*[Generation stopped]*' }
            }
            return msg
          })
        })
      }

      const appendAssistantDelta = (delta: string): void => {
        setUiMessages(chatId, (prev) => {
          const activeExists = Boolean(
            activeAssistantMsgId &&
              prev.some((msg) => msg.role === 'assistant' && msg.id === activeAssistantMsgId),
          )

          if (!activeAssistantMsgId || startNewAssistantSegment || !activeExists) {
            const nextAssistantId = crypto.randomUUID()
            streamingAssistantIds.add(nextAssistantId)
            activeAssistantMsgId = nextAssistantId
            startNewAssistantSegment = false
            const nextAssistant: UiChatMessage = {
              id: nextAssistantId,
              role: 'assistant',
              content: delta,
              streaming: true,
            }
            return [...prev, nextAssistant]
          }

          return prev.map((msg) => {
            if (msg.role === 'assistant' && msg.id === activeAssistantMsgId) {
              return { ...msg, content: msg.content + delta }
            }
            return msg
          })
        })
      }

      for await (const event of gen) {
        if (controller.signal.aborted) break
        switch (event.type) {
          case 'text_delta': {
            appendAssistantDelta(event.delta)
            break
          }

          case 'tool_call': {
            const toolMsg: UiChatMessage = {
              id: event.id,
              role: 'tool_call',
              name: event.name,
              input: event.input,
              status: 'pending',
            }
            setUiMessages(chatId, (prev) => {
              const compacted = prev.filter((msg) => {
                if (msg.role !== 'assistant') return true
                if (!streamingAssistantIds.has(msg.id)) return true
                return msg.content.trim().length > 0
              })
              return [...compacted, toolMsg]
            })
            activeAssistantMsgId = null
            startNewAssistantSegment = true
            break
          }

          case 'tool_result': {
            setUiMessages(chatId, (prev) => {
              const byId = prev.find(
                (msg) => msg.role === 'tool_call' && msg.id === event.id,
              )
              const target =
                byId ??
                [...prev]
                  .reverse()
                  .find((msg) => msg.role === 'tool_call' && msg.status === 'pending')

              if (!target) return prev

              return prev.map((msg) => {
                if (msg.id === target.id && msg.role === 'tool_call') {
                  return {
                    ...msg,
                    status: event.isError ? 'error' : 'done',
                    result: event.result,
                  }
                }
                return msg
              })
            })
            activeAssistantMsgId = null
            startNewAssistantSegment = true
            break
          }

          case 'plan_ready': {
            setUiMessages(chatId, (prev) => {
              const withoutStreamingAssistants = prev.filter(
                (msg) => !(msg.role === 'assistant' && streamingAssistantIds.has(msg.id)),
              )
              const planMsgId =
                activeAssistantMsgId && streamingAssistantIds.has(activeAssistantMsgId)
                  ? activeAssistantMsgId
                  : assistantMsgId
              const planMsg: UiChatMessage = {
                id: planMsgId,
                role: 'plan',
                content: event.planText,
                status: 'pending',
              }
              return [...withoutStreamingAssistants, planMsg]
            })
            activeAssistantMsgId = null
            startNewAssistantSegment = false
            break
          }

          case 'complete': {
            setApiMessages(chatId, event.apiMessages)
            clearStreamingFlags(false)
            setIsStreaming(false)
            setStreamingAssistantId(null)
            setAbortController(null)
            return
          }
        }
      }

      // If loop ended due to abort, clean up the streaming UI state
      if (controller.signal.aborted) {
        clearStreamingFlags(true)
        setIsStreaming(false)
        setStreamingAssistantId(null)
        setAbortController(null)
      } else {
        // Defensive cleanup for unexpected stream termination without a complete event.
        clearStreamingFlags(false)
        setIsStreaming(false)
        setStreamingAssistantId(null)
        setAbortController(null)
      }
    },
    [kernel, setUiMessages, setApiMessages, setIsStreaming, setStreamingAssistantId, setAbortController],
  )

  // ── handleSend ────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (): Promise<void> => {
    const trimmed = input.trim()
    if ((!trimmed && attachedImages.length === 0) || isStreaming || !activeChatId) return

    const chatId = activeChatId
    const msgId = crypto.randomUUID()
    const assistantMsgId = crypto.randomUUID()

    const userUiMsg: UiChatMessage = {
      id: msgId,
      role: 'user',
      content: trimmed,
      ...(attachedImages.length > 0 && { images: attachedImages.map(img => img.base64) }),
    }
    const assistantPlaceholder: UiChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    const contentBlocks: any[] = []
    for (const img of attachedImages) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      })
    }
    if (trimmed) {
      contentBlocks.push({ type: 'text', text: trimmed })
    }
    const newApiMessage: Anthropic.MessageParam = {
      role: 'user',
      content: contentBlocks.length === 1 && !attachedImages.length ? trimmed : contentBlocks,
    }
    const nextApiMessages = [...apiMessages, newApiMessage]
    const hasApprovedPlan = uiMessages.some((msg) => msg.role === 'plan' && msg.status === 'approved')
    const effectivePlanMode = planMode && !hasApprovedPlan

    setUiMessages(chatId, (prev) => [...prev, userUiMsg, assistantPlaceholder])
    setApiMessages(chatId, nextApiMessages)
    setInput('')
    setAttachedImages([])
    setIsStreaming(true)
    setStreamingAssistantId(assistantMsgId)
    autoTitle(chatId, trimmed)

    try {
      if (hasApprovedPlan && planMode) {
        setPlanMode(chatId, false)
      }
      await runStreamingLoop(chatId, nextApiMessages, effectivePlanMode, assistantMsgId)
    } catch (err) {
      // Ignore abort errors — they're expected when user stops generation
      if (err instanceof DOMException && err.name === 'AbortError') {
        setIsStreaming(false)
        setStreamingAssistantId(null)
        setAbortController(null)
      } else {
        const errorText = err instanceof Error ? err.message : String(err)
        const errorMsg: UiChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${errorText}`,
        }
        setUiMessages(chatId, (prev) =>
          prev
            .map((msg) => {
              if (msg.role === 'assistant' && msg.streaming) {
                const { streaming: _streaming, ...rest } = msg
                return rest
              }
              return msg
            })
            .concat(errorMsg),
        )
        setIsStreaming(false)
        setStreamingAssistantId(null)
        setAbortController(null)
      }
    }

    textareaRef.current?.focus()
  }, [input, isStreaming, activeChatId, apiMessages, uiMessages, planMode, runStreamingLoop, setUiMessages, setApiMessages, setPlanMode, setIsStreaming, setStreamingAssistantId, setAbortController, autoTitle, attachedImages])

  // ── handleApprovePlan ─────────────────────────────────────────────────────

  const handleApprovePlan = useCallback(
    async (planMsgId: string): Promise<void> => {
      if (!activeChatId) return
      const chatId = activeChatId

      setUiMessages(chatId, (prev) =>
        prev.map((msg) => {
          if (msg.id === planMsgId && msg.role === 'plan') {
            return { ...msg, status: 'approved' }
          }
          return msg
        }),
      )

      const approvalMsg: Anthropic.MessageParam = {
        role: 'user',
        content: 'Plan approved. Please build it now.',
      }
      const nextApiMessages = [...apiMessages, approvalMsg]
      setApiMessages(chatId, nextApiMessages)
      setPlanMode(chatId, false)

      const assistantMsgId = crypto.randomUUID()
      const assistantPlaceholder: UiChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        streaming: true,
      }
      setUiMessages(chatId, (prev) => [...prev, assistantPlaceholder])
      setIsStreaming(true)
      setStreamingAssistantId(assistantMsgId)

      try {
        await runStreamingLoop(chatId, nextApiMessages, false, assistantMsgId)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setIsStreaming(false)
          setStreamingAssistantId(null)
          setAbortController(null)
        } else {
          const errorText = err instanceof Error ? err.message : String(err)
          const errorMsg: UiChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${errorText}`,
          }
          setUiMessages(chatId, (prev) =>
            prev
              .map((msg) => {
                if (msg.role === 'assistant' && msg.streaming) {
                  const { streaming: _streaming, ...rest } = msg
                  return rest
                }
                return msg
              })
              .concat(errorMsg),
          )
          setIsStreaming(false)
          setStreamingAssistantId(null)
          setAbortController(null)
        }
      }
    },
    [activeChatId, apiMessages, runStreamingLoop, setUiMessages, setApiMessages, setPlanMode, setIsStreaming, setStreamingAssistantId, setAbortController],
  )

  // ── handleRevisePlan ──────────────────────────────────────────────────────

  const handleRevisePlan = useCallback(
    async (planMsgId: string): Promise<void> => {
      if (!activeChatId) return
      const chatId = activeChatId

      setUiMessages(chatId, (prev) =>
        prev.map((msg) => {
          if (msg.id === planMsgId && msg.role === 'plan') {
            return { ...msg, status: 'revised' }
          }
          return msg
        }),
      )

      const reviseMsg: Anthropic.MessageParam = {
        role: 'user',
        content: 'Please revise the plan for the same request and provide an updated structured plan with a TODO Task List ending with [PLAN READY].',
      }
      const nextApiMessages = [...apiMessages, reviseMsg]
      setApiMessages(chatId, nextApiMessages)
      setPlanMode(chatId, true)

      const assistantMsgId = crypto.randomUUID()
      const assistantPlaceholder: UiChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        streaming: true,
      }
      setUiMessages(chatId, (prev) => [...prev, assistantPlaceholder])
      setIsStreaming(true)
      setStreamingAssistantId(assistantMsgId)

      try {
        await runStreamingLoop(chatId, nextApiMessages, true, assistantMsgId)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setIsStreaming(false)
          setStreamingAssistantId(null)
          setAbortController(null)
        } else {
          const errorText = err instanceof Error ? err.message : String(err)
          const errorMsg: UiChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${errorText}`,
          }
          setUiMessages(chatId, (prev) =>
            prev
              .map((msg) => {
                if (msg.role === 'assistant' && msg.streaming) {
                  const { streaming: _streaming, ...rest } = msg
                  return rest
                }
                return msg
              })
              .concat(errorMsg),
          )
          setIsStreaming(false)
          setStreamingAssistantId(null)
          setAbortController(null)
        }
      }
    },
    [activeChatId, apiMessages, runStreamingLoop, setUiMessages, setApiMessages, setPlanMode, setIsStreaming, setStreamingAssistantId, setAbortController],
  )

  // ── handleNewChat ────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    if (isStreaming) return
    resetProxySession()
    createChat()
    setInput('')
    setShowHistory(false)
  }, [isStreaming, createChat])

  // ── handleDeleteChat ─────────────────────────────────────────────────────

  const handleDeleteChat = useCallback(
    (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation()
      if (isStreaming) return
      deleteChat(chatId)
    },
    [isStreaming, deleteChat],
  )

  // ── Image handling ──────────────────────────────────────────────────────

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(',')[1]
        const mimeType = file.type
        setAttachedImages((prev) => [...prev, { base64, mimeType, name: file.name }])
      }
      reader.readAsDataURL(file)
    })

    // Reset file input so the same file can be re-selected
    e.target.value = ''
  }, [])

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile()
        if (!blob) continue
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(',')[1]
          setAttachedImages((prev) => [...prev, { base64, mimeType: item.type, name: 'pasted-image.png' }])
        }
        reader.readAsDataURL(blob)
      }
    }
  }, [])

  // ── handleSwitchChat ─────────────────────────────────────────────────────

  const handleSwitchChat = useCallback(
    (chatId: string) => {
      if (isStreaming || chatId === activeChatId) return
      resetProxySession()
      setActiveChat(chatId)
      setShowHistory(false)
    },
    [isStreaming, activeChatId, setActiveChat],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="chat-panel" style={{ display: visible ? 'flex' : 'none' }}>
      {/* Header */}
      <div className="chat-header">
        <button
          className="chat-history-toggle"
          onClick={() => setShowHistory((v) => !v)}
          title="Chat history"
        >
          {showHistory ? '\u2715' : '\u2630'}
        </button>
        <span className="chat-header-title">
          {activeChat?.title ?? 'AI Assistant'}
        </span>
        <div className="chat-header-actions">
          <button
            className={`chat-plan-toggle${planMode ? ' active' : ''}`}
            onClick={() => activeChatId && setPlanMode(activeChatId, !planMode)}
            title="Plan mode: AI describes what it will build before executing"
          >
            {planMode ? 'Plan: ON' : 'Plan: OFF'}
          </button>
          <button
            className="chat-new-btn"
            onClick={handleNewChat}
            disabled={isStreaming}
            title="New chat"
          >
            +
          </button>
        </div>
      </div>

      {/* Chat history sidebar */}
      {showHistory && (
        <div className="chat-history-list">
          {chatList.map((chat) => (
            <div
              key={chat.id}
              className={`chat-history-item${chat.id === activeChatId ? ' active' : ''}`}
              onClick={() => handleSwitchChat(chat.id)}
            >
              <span className="chat-history-item-title">{chat.title}</span>
              <span className="chat-history-item-date">
                {new Date(chat.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              {chatList.length > 1 && (
                <button
                  className="chat-history-item-delete"
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  title="Delete chat"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {uiMessages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="chat-bubble chat-bubble-user">
                <span className="chat-bubble-label">You</span>
                {msg.images && msg.images.length > 0 && (
                  <div className="chat-image-previews">
                    {msg.images.map((b64, idx) => (
                      <img key={idx} src={`data:image/png;base64,${b64}`} alt="Attached" className="chat-attached-image" />
                    ))}
                  </div>
                )}
                <p>{msg.content}</p>
              </div>
            )
          }

          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} className="chat-bubble chat-bubble-assistant">
                <span className="chat-bubble-label">
                  AI Assistant{' '}
                  {msg.streaming && <span className="chat-streaming-dot" />}
                </span>
                {msg.content ? (
                  <div className="chat-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.streaming ? '...' : ''}</p>
                )}
              </div>
            )
          }

          if (msg.role === 'tool_call') {
            const formattedResult = formatToolResult(msg.result)
            const hasResult = formattedResult.trim().length > 0
            return (
              <div
                key={msg.id}
                className={`chat-tool-card chat-tool-${msg.status}`}
              >
                <div className="chat-tool-row">
                  <span className="chat-tool-icon">&#9881;</span>
                  <span className="chat-tool-name">{msg.name}</span>
                  <span className="chat-tool-status">
                    {msg.status === 'pending' && (
                      <span className="chat-spinner" />
                    )}
                    {msg.status === 'done' && '\u2713'}
                    {msg.status === 'error' && '\u2717'}
                  </span>
                </div>
                {msg.status !== 'pending' && (
                  hasResult ? (
                    <details className={`chat-tool-result-box${msg.status === 'error' ? ' error' : ''}`} open={msg.status === 'error'}>
                      <summary className="chat-tool-result-summary">Response</summary>
                      <pre className="chat-tool-result">{formattedResult}</pre>
                    </details>
                  ) : (
                    <div className="chat-tool-result-empty">No response payload.</div>
                  )
                )}
              </div>
            )
          }

          if (msg.role === 'plan') {
            const planTasks = extractPlanTasks(msg.content)
            return (
              <div
                key={msg.id}
                className={`chat-plan-card chat-plan-${msg.status}`}
              >
                <div className="chat-plan-header">
                  <span>&#128203; Building Plan</span>
                  {msg.status === 'approved' && (
                    <span className="chat-plan-badge approved">
                      &#10003; Approved
                    </span>
                  )}
                  {msg.status === 'revised' && (
                    <span className="chat-plan-badge revised">
                      &#10007; Revised
                    </span>
                  )}
                </div>
                {planTasks.length > 0 && (
                  <div className="chat-plan-todos">
                    <div className="chat-plan-todos-title">TODO Task List</div>
                    <ul className="chat-plan-todos-list">
                      {planTasks.map((task, idx) => (
                        <li key={`${msg.id}-todo-${idx}`}>
                          <label>
                            <input type="checkbox" checked={task.done} readOnly />
                            <span>{task.text}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="chat-markdown chat-plan-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
                {msg.status === 'pending' && (
                  <div className="chat-plan-actions">
                    <button
                      className="chat-plan-approve"
                      onClick={() => void handleApprovePlan(msg.id)}
                    >
                      Approve Plan &#10003;
                    </button>
                    <button
                      className="chat-plan-revise"
                      onClick={() => void handleRevisePlan(msg.id)}
                    >
                      Revise &#10007;
                    </button>
                  </div>
                )}
              </div>
            )
          }

          return null
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        {attachedImages.length > 0 && (
          <div className="chat-attached-previews">
            {attachedImages.map((img, idx) => (
              <div key={idx} className="chat-attached-preview">
                <img src={`data:${img.mimeType};base64,${img.base64}`} alt={img.name} />
                <button className="chat-attached-remove" onClick={() => handleRemoveImage(idx)}>&#215;</button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <button
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title="Attach image (or paste from clipboard)"
          >
            &#128206;
          </button>
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            onPaste={handlePaste}
            placeholder="Describe what to build... (Enter to send, paste images)"
            rows={2}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              className="chat-stop-btn"
              onClick={stopGeneration}
              title="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={() => void handleSend()}
              disabled={!input.trim() && attachedImages.length === 0}
            >
              Send
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
      </div>
    </div>
  )
}
