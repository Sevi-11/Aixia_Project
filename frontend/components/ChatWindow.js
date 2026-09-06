"use client";

import { useEffect, useRef, useState } from "react";

const HISTORY_KEY = "aixia-chat-history";
const SIDEBAR_KEY = "aixia-sidebar-open";
const EMPTY_MESSAGES = [];
// Relative path: Next.js proxies this to the backend server-side (see next.config.mjs
// rewrites), so the browser never needs to know the backend's host/port — that means
// no NEXT_PUBLIC_ build-time coupling, and no rebuild when the backend's port changes.
const STREAM_URL = "/api/chat/stream/";
const suggestions = [
  "What is your machine learning experience?",
  "Tell me about your embedded systems background.",
  "What projects has Sean worked on?",
];

function createChatId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeChat() {
  return { id: createChatId(), title: "New conversation", titleSetByUser: false, messages: [], sessionId: null, updatedAt: Date.now() };
}

function loadChats() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(stored) && stored.length ? stored : [makeChat()];
  } catch {
    return [makeChat()];
  }
}

function loadSidebarOpen() {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export default function ChatWindow() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || EMPTY_MESSAGES;
  const loading = loadingChats.has(activeChat?.id);

  useEffect(() => {
    if (!chats.length) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
    } catch {
      // Storage can be disabled or full; the active UI remains usable in memory.
    }
  }, [chats]);

  useEffect(() => {
    const restored = loadChats();
    const fresh = makeChat();
    // Browser storage is external state; initialize it after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats([fresh, ...restored]);
    setActiveChatId(fresh.id);
    setSidebarOpen(loadSidebarOpen());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen));
    } catch {
      // Storage can be disabled or full; the active UI remains usable in memory.
    }
  }, [sidebarOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // The textarea is disabled while `loading`, which blurs it if it was
  // focused (a disabled form element can't hold focus). Restore focus the
  // moment it re-enables, so the next keystroke/Enter isn't silently lost.
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      textareaRef.current?.focus();
    }
    wasLoadingRef.current = loading;
  }, [loading]);

  function updateInput(event) {
    setInput(event.target.value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
  }

  function chooseSuggestion(suggestion) {
    setInput(suggestion);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function startNewChat() {
    const chat = makeChat();
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setInput("");
    textareaRef.current?.focus();
  }

  function deleteChat(chatId) {
    setChats((current) => {
      const remaining = current.filter((chat) => chat.id !== chatId);
      if (chatId === activeChat?.id) {
        const fresh = makeChat();
        setActiveChatId(fresh.id);
        return [fresh, ...remaining];
      }
      return remaining.length ? remaining : [makeChat()];
    });
    setInput("");
  }

  function startRenaming(chat) {
    setRenamingChatId(chat.id);
    setRenameDraft(chat.title);
  }

  function commitRename() {
    const chatId = renamingChatId;
    setRenamingChatId(null);
    if (chatId == null) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    updateChat(chatId, { title: trimmed, titleSetByUser: true });
  }

  function cancelRenaming() {
    setRenamingChatId(null);
  }

  function updateChat(chatId, update) {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, ...update, updatedAt: Date.now() } : chat));
  }

  function updateLastMessage(chatId, updater) {
    setChats((current) => current.map((chat) => {
      if (chat.id !== chatId) return chat;
      const messages = chat.messages.slice();
      const lastIndex = messages.length - 1;
      if (lastIndex < 0) return chat;
      messages[lastIndex] = updater(messages[lastIndex]);
      return { ...chat, messages, updatedAt: Date.now() };
    }));
  }

  async function runChatStream(chatId, requestBody) {
    setLoadingChats((current) => new Set(current).add(chatId));

    try {
      const response = await fetch(STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok || !response.body) throw new Error(`Server responded with ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === "sources") {
            updateLastMessage(chatId, (message) => ({ ...message, sources: event.sources }));
          } else if (event.type === "token") {
            updateLastMessage(chatId, (message) => ({ ...message, content: message.content + event.content }));
          } else if (event.type === "suggestions") {
            updateLastMessage(chatId, (message) => ({ ...message, suggestions: event.suggestions }));
          } else if (event.type === "done") {
            updateChat(chatId, { sessionId: event.session_id, sessionToken: event.session_token });
            updateLastMessage(chatId, (message) => ({ ...message, streaming: false }));
          } else if (event.type === "error") {
            updateLastMessage(chatId, (message) => ({ ...message, role: "error", content: message.content || event.message, streaming: false }));
          }
        }
      }
    } catch (error) {
      updateLastMessage(chatId, (message) => (
        message.content
          ? { ...message, streaming: false }
          : { ...message, role: "error", content: `I couldn't connect to AIxia. ${error.message}`, streaming: false }
      ));
    } finally {
      setLoadingChats((current) => {
        const next = new Set(current);
        next.delete(chatId);
        return next;
      });
    }
  }

  async function sendMessage(text = input) {
    const question = text.trim();
    if (!question || loadingChats.has(activeChat?.id) || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage = { role: "user", content: question };
    const assistantPlaceholder = { role: "assistant", content: "", sources: [], streaming: true };
    const nextMessages = [...activeChat.messages, userMessage, assistantPlaceholder];
    const shouldAutoTitle = !activeChat.messages.length && !activeChat.titleSetByUser;
    updateChat(chatId, { messages: nextMessages, title: shouldAutoTitle ? question.slice(0, 38) : activeChat.title });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    await runChatStream(chatId, { session_id: activeChat.sessionId, session_token: activeChat.sessionToken, question });
  }

  function regenerateMessage(chatId) {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat || loadingChats.has(chatId)) return;
    updateLastMessage(chatId, (message) => ({
      ...message,
      role: "assistant",
      content: "",
      sources: [],
      suggestions: undefined,
      streaming: true,
    }));
    runChatStream(chatId, { session_id: chat.sessionId, session_token: chat.sessionToken, regenerate: true });
  }

  function setMessageFeedback(chatId, messageIndex, value) {
    setChats((current) => current.map((chat) => {
      if (chat.id !== chatId) return chat;
      const messages = chat.messages.slice();
      if (!messages[messageIndex]) return chat;
      const nextValue = messages[messageIndex].feedback === value ? undefined : value;
      messages[messageIndex] = { ...messages[messageIndex], feedback: nextValue };
      return { ...chat, messages, updatedAt: Date.now() };
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="flex min-h-screen bg-[var(--board)] text-[var(--ink)] font-utility">
      <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className={`fixed inset-0 z-10 bg-black/60 transition-opacity duration-200 md:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside className={`fixed inset-y-0 left-0 z-20 flex h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-[var(--trace)] bg-[var(--panel)] pt-20 transition-[width,transform,border] duration-300 md:sticky md:top-0 md:self-start md:inset-auto md:z-auto md:translate-x-0 md:pt-20 ${sidebarOpen ? "translate-x-0 md:w-72" : "-translate-x-full border-0 md:w-0 md:translate-x-0"}`}>
        <div className={`flex min-w-[264px] flex-1 flex-col p-3 transition-[opacity,transform] duration-200 ${sidebarOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-3 opacity-0"}`}>
          <div className="flex items-center justify-between px-2 pb-5 pt-2">
            <span className="font-utility text-[11px] font-semibold tracking-[0.18em] text-[var(--ink-dim)]">SESSIONS</span>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar" className="rounded-md p-2 text-[var(--ink-dim)] transition hover:bg-[var(--panel-active)] hover:text-[var(--ink)] md:hidden"><CloseIcon /></button>
          </div>
          <button type="button" onClick={startNewChat} className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 text-left font-friendly text-xs font-bold tracking-wide text-[var(--accent)] transition hover:bg-[var(--accent)]/25 focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60"><PlusIcon /> New session</button>
          <div className="mt-5 flex-1 space-y-1 overflow-y-auto" aria-label="Chat history">
            {chats.map((chat) => (
              <div key={chat.id} className={`group flex items-center gap-1 rounded-md border-l-2 p-1 transition-colors ${chat.id === activeChatId ? "border-[var(--accent)] bg-[var(--panel-active)]" : "border-transparent hover:bg-[var(--panel-active)]/60"}`}>
                {chat.id === renamingChatId ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); commitRename(); }
                      else if (event.key === "Escape") { event.preventDefault(); cancelRenaming(); }
                    }}
                    className="min-w-0 flex-1 rounded bg-[var(--board)] px-3 py-2.5 text-left text-xs leading-5 text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--signal)]/60"
                  />
                ) : (
                  <button type="button" onClick={() => { setActiveChatId(chat.id); setInput(""); }} className={`flex min-w-0 flex-1 items-baseline gap-2 truncate rounded px-3 py-2.5 text-left text-xs leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60 ${chat.id === activeChatId ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-dim)] group-hover:text-[var(--ink)]"}`}>
                    <span className="shrink-0 font-utility text-[10px] text-[var(--ink-faint)]">#{chat.id.slice(0, 4)}</span>
                    <span className="truncate">{chat.title}</span>
                  </button>
                )}
                {chat.id !== renamingChatId && (
                  <>
                    <button type="button" onClick={() => startRenaming(chat)} aria-label={`Rename ${chat.title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--ink-faint)] opacity-0 transition hover:bg-[var(--panel-active)] hover:text-[var(--ink)] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60 group-hover:opacity-100"><PencilIcon /></button>
                    <button type="button" onClick={() => deleteChat(chat.id)} aria-label={`Delete ${chat.title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--ink-faint)] opacity-0 transition hover:bg-[var(--alert)]/15 hover:text-[var(--alert)] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--alert)]/60 group-hover:opacity-100"><TrashIcon /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="px-2 pt-3 font-utility text-[10px] leading-5 text-[var(--ink-faint)]">History persists locally. Nothing leaves this device.</p>
        </div>
      </aside>

      <section className="flex min-h-screen min-w-0 flex-1 flex-col pt-20">
        <header className="fixed left-0 right-0 top-0 z-30 h-20 border-b border-[var(--trace)] bg-[var(--board)]/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="shell mx-auto flex h-full items-center justify-between">
            <div className="flex items-center gap-3 pl-12">
              <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"} className="absolute left-3 rounded-md p-3 text-[var(--ink-dim)] transition hover:bg-[var(--panel)] hover:text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60"><MenuIcon /></button>
              <button type="button" onClick={startNewChat} aria-label="Start a new conversation" className="rag-badge flex h-10 w-10 items-center justify-center rounded-full border border-[var(--trace)] font-display text-sm font-bold text-[var(--ink)] transition hover:border-[var(--accent)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60"><span aria-hidden="true">Ai</span></button>
              <div>
                <p className="font-display text-lg font-bold tracking-tight">AIxia <span className="font-utility text-[10px] font-semibold tracking-[0.18em] text-[var(--ink-faint)]">RAG-01</span></p>
                <p className="font-friendly text-[11px] text-[var(--ink-dim)]">Sean&apos;s knowledge interface</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-[var(--trace)] px-3 py-1.5 font-utility text-[11px] font-medium tracking-wide text-[var(--ink-dim)]">
              <SignalPulse /> ONLINE
            </div>
          </div>
        </header>
        <div className="shell mx-auto flex w-full flex-1 flex-col px-4 pb-6 pt-10 md:px-8 md:pt-16">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="animate-[fade-up_500ms_ease-out] py-8 text-center md:py-16">
                <p className="font-utility text-[11px] font-semibold tracking-[0.25em] text-[var(--signal)]">SIGNAL ACQUIRED</p>
                <h1 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">What do you want to know about Sean?</h1>
                <p className="mx-auto mt-3 max-w-md font-friendly text-sm leading-6 text-[var(--ink-dim)]">AIxia answers from Sean&apos;s résumé, projects, and notes &mdash; grounded, not guessed.</p>
                <div className="mx-auto mt-8 grid max-w-xl gap-3 text-left md:grid-cols-3">
                  {suggestions.map((suggestion, index) => (
                    <button key={suggestion} type="button" onClick={() => chooseSuggestion(suggestion)} className="min-h-12 rounded-md border border-[var(--trace)] bg-[var(--panel)]/70 p-3 text-left font-friendly text-xs leading-5 text-[var(--ink-dim)] transition hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60">
                      <span className="block font-utility text-[10px] font-semibold tracking-wide text-[var(--accent)]">CH{index + 1}</span>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <MessageBubble
                    key={`${message.role}-${index}`}
                    message={message}
                    chatId={activeChat.id}
                    messageIndex={index}
                    isLast={index === messages.length - 1}
                    onRegenerate={() => regenerateMessage(activeChat.id)}
                    onFeedback={(value) => setMessageFeedback(activeChat.id, index, value)}
                    onSuggestionClick={(text) => sendMessage(text)}
                  />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className="sticky bottom-4 z-10 mt-3 rounded-lg border border-[var(--trace)] bg-[var(--panel)]/95 p-2 shadow-[0_16px_50px_rgba(0,0,0,0.45)] backdrop-blur">
            <label htmlFor="chat-input" className="sr-only">Message AIxia</label>
            <div className="flex items-end gap-2">
              <span aria-hidden="true" className="select-none px-1 pb-3 font-display text-base font-bold text-[var(--accent)]">&gt;</span>
              <textarea ref={textareaRef} id="chat-input" rows="1" value={input} onChange={updateInput} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Query AIxia…" disabled={loading} className="max-h-[140px] min-h-12 flex-1 resize-none bg-transparent py-3 font-friendly text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-50" />
              <button type="submit" aria-label="Send message" disabled={loading || !input.trim()} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--board)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60"><SendIcon /></button>
            </div>
            <p className="px-3 pb-1 font-utility text-[10px] text-[var(--ink-faint)]">Enter to send · Shift + Enter for a new line</p>
          </form>
          </div>
        </div>
      </section>
    </main>
  );
}

function SignalPulse() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      <span className="w-[3px] animate-[signal-pulse_1.1s_ease-in-out_infinite] rounded-full bg-[var(--signal)]" style={{ height: "60%", animationDelay: "0ms" }} />
      <span className="w-[3px] animate-[signal-pulse_1.1s_ease-in-out_infinite] rounded-full bg-[var(--signal)]" style={{ height: "100%", animationDelay: "150ms" }} />
      <span className="w-[3px] animate-[signal-pulse_1.1s_ease-in-out_infinite] rounded-full bg-[var(--signal)]" style={{ height: "80%", animationDelay: "300ms" }} />
    </span>
  );
}

function LoadingBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      <span className="w-[3px] animate-[signal-pulse_0.9s_ease-in-out_infinite] rounded-full bg-[var(--ink-dim)]" style={{ height: "50%", animationDelay: "0ms" }} />
      <span className="w-[3px] animate-[signal-pulse_0.9s_ease-in-out_infinite] rounded-full bg-[var(--ink-dim)]" style={{ height: "100%", animationDelay: "120ms" }} />
      <span className="w-[3px] animate-[signal-pulse_0.9s_ease-in-out_infinite] rounded-full bg-[var(--ink-dim)]" style={{ height: "70%", animationDelay: "240ms" }} />
      <span className="w-[3px] animate-[signal-pulse_0.9s_ease-in-out_infinite] rounded-full bg-[var(--ink-dim)]" style={{ height: "85%", animationDelay: "360ms" }} />
    </span>
  );
}

function MessageBubble({ message, chatId, messageIndex, isLast, onRegenerate, onFeedback, onSuggestionClick }) {
  const isUser = message.role === "user";
  const isError = message.role === "error";
  const isStreaming = Boolean(message.streaming);
  const tag = isUser ? "TX" : "RX";
  const sources = message.sources || [];
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [highlightedSource, setHighlightedSource] = useState(null);
  const [copied, setCopied] = useState(false);

  function handleCiteClick(n) {
    setSourcesOpen(true);
    setHighlightedSource(n - 1);
    requestAnimationFrame(() => {
      document.getElementById(`source-${chatId}-${messageIndex}-${n - 1}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the copy button simply has no effect.
    }
  }

  return (
    <div className={`flex animate-[fade-up_300ms_ease-out] gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--trace)] bg-[var(--panel)] font-utility text-[10px] font-bold text-[var(--signal)]">{tag}</div>}
      <div className={`max-w-[85%] rounded-lg px-4 py-3 font-friendly text-sm leading-7 ${isUser ? "border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--ink)]" : isError ? "border border-[var(--alert)]/30 bg-[var(--alert)]/10 text-[var(--alert)]" : "border border-[var(--trace)] border-l-2 border-l-[var(--accent)] bg-[var(--panel)] text-[var(--ink)]"}`}>
        {isStreaming && !message.content ? (
          <span className="flex items-center gap-2 font-utility text-xs font-medium tracking-wide text-[var(--ink-dim)]" aria-live="polite"><LoadingBars /> RECEIVING</span>
        ) : (
          <>
            <MessageContent content={message.content} sources={sources} onCiteClick={handleCiteClick} />
            {isStreaming && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-[var(--signal)]" />}
          </>
        )}
        {!isUser && sources.length > 0 && (
          <details open={sourcesOpen} onToggle={(event) => setSourcesOpen(event.target.open)} className="mt-3 border-t border-[var(--trace)] pt-2 font-utility text-[11px] text-[var(--ink-dim)]">
            <summary className="cursor-pointer select-none transition hover:text-[var(--signal)]">{sources.length} record{sources.length > 1 ? "s" : ""} retrieved</summary>
            <div className="mt-2 space-y-2">
              {sources.map((source, index) => (
                <div
                  key={index}
                  id={`source-${chatId}-${messageIndex}-${index}`}
                  className={`rounded-md border p-3 text-xs leading-5 transition ${index === highlightedSource ? "border-[var(--signal)] bg-[var(--board)]/90 ring-2 ring-[var(--signal)]/60" : "border-[var(--trace)] bg-[var(--board)]/60"}`}
                >
                  <p className="font-utility text-[10px] font-semibold text-[var(--accent)]">[{index + 1}] {source.original_filename}</p>
                  <p className="mt-1 text-[var(--ink-dim)] line-clamp-3">{source.content}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        {!isUser && !isStreaming && (
          <div className="mt-2 flex items-center gap-1 border-t border-[var(--trace)] pt-2">
            <button type="button" onClick={handleCopy} aria-label="Copy response" className="flex h-7 w-7 items-center justify-center rounded text-[var(--ink-faint)] transition hover:bg-[var(--panel-active)] hover:text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60">
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            {isLast && !isError && (
              <button type="button" onClick={onRegenerate} aria-label="Regenerate response" className="flex h-7 w-7 items-center justify-center rounded text-[var(--ink-faint)] transition hover:bg-[var(--panel-active)] hover:text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60">
                <RegenerateIcon />
              </button>
            )}
            {!isError && (
              <>
                <button type="button" onClick={() => onFeedback("up")} aria-pressed={message.feedback === "up"} aria-label="Good response" className={`flex h-7 w-7 items-center justify-center rounded transition hover:bg-[var(--panel-active)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60 ${message.feedback === "up" ? "text-[var(--signal)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"}`}>
                  <ThumbUpIcon />
                </button>
                <button type="button" onClick={() => onFeedback("down")} aria-pressed={message.feedback === "down"} aria-label="Bad response" className={`flex h-7 w-7 items-center justify-center rounded transition hover:bg-[var(--panel-active)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60 ${message.feedback === "down" ? "text-[var(--alert)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)]"}`}>
                  <ThumbDownIcon />
                </button>
              </>
            )}
          </div>
        )}
        {!isUser && isLast && !isStreaming && message.suggestions?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.suggestions.map((suggestion, index) => (
              <button key={index} type="button" onClick={() => onSuggestionClick(suggestion)} className="rounded-full border border-[var(--trace)] px-3 py-1.5 text-left font-friendly text-xs leading-5 text-[var(--ink-dim)] transition hover:border-[var(--accent)]/50 hover:text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/60">
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      {isUser && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] font-utility text-[10px] font-bold text-[var(--accent)]">{tag}</div>}
    </div>
  );
}

function MessageContent({ content, sources, onCiteClick }) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      const items = [];
      const ordered = Boolean(numbered);
      while (index < lines.length) {
        const match = lines[index].match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(<li key={index}>{formatInline(match[1], sources, onCiteClick)}</li>);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`${ordered ? "list-decimal" : "list-disc"} my-2 space-y-1 pl-6`}>{items}</List>);
      continue;
    }

    if (line.trim()) blocks.push(<p key={`paragraph-${index}`} className="my-2 first:mt-0 last:mb-0">{formatInline(line, sources, onCiteClick)}</p>);
    index += 1;
  }

  return <div>{blocks}</div>;
}

function formatInline(text, sources = [], onCiteClick) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[\d+\])/g);
  return parts.map((part, index) => {
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^`.*`$/.test(part)) return <code key={index} className="rounded bg-[var(--board)]/70 px-1.5 py-0.5 font-utility text-[0.85em] text-[var(--signal)]">{part.slice(1, -1)}</code>;
    const citation = part.match(/^\[(\d+)\]$/);
    if (citation) {
      const n = Number(citation[1]);
      if (n < 1 || n > sources.length) return part;
      return (
        <button
          key={index}
          type="button"
          onClick={() => onCiteClick?.(n)}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-[var(--accent-soft)] px-1 align-super font-utility text-[9px] font-bold text-[var(--accent)] transition hover:bg-[var(--accent)]/30"
        >
          {n}
        </button>
      );
    }
    return part;
  });
}

const Icon = ({ children, width = "18", height = "18" }) => <svg aria-hidden="true" width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const MenuIcon = () => <Icon><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
const CloseIcon = () => <Icon><path d="m6 6 12 12M18 6 6 18" /></Icon>;
const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const SendIcon = () => <Icon><path d="m5 12 14-7-4 14-3-6-7-1Z" /><path d="m12 13 7-8" /></Icon>;
const TrashIcon = () => <Icon><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></Icon>;
const PencilIcon = () => <Icon width="15" height="15"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>;
const CopyIcon = () => <Icon width="15" height="15"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Icon>;
const CheckIcon = () => <Icon width="15" height="15"><path d="M20 6 9 17l-5-5" /></Icon>;
const RegenerateIcon = () => <Icon width="15" height="15"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></Icon>;
const ThumbUpIcon = () => <Icon width="15" height="15"><path d="M7 10v11" /><path d="M11 21h6.5a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.7 11H14V6a2 2 0 0 0-2-2l-1 2-3 5.5V21z" /></Icon>;
const ThumbDownIcon = () => <Icon width="15" height="15"><path d="M17 14V3" /><path d="M13 3H6.5a2 2 0 0 0-2 1.6l-1.2 6A2 2 0 0 0 5.3 13H10v5a2 2 0 0 0 2 2l1-2 3-5.5V3z" /></Icon>;
