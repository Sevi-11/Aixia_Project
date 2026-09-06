"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./AppHeader";
import Composer from "./Composer";
import MessageRow from "./MessageRow";
import Sidebar from "./Sidebar";
import SourcesPanel from "./SourcesPanel";
import { ArrowDownIcon } from "./icons";
import { createTypingPacer } from "./typingPacer";

const HISTORY_KEY = "aixia-chat-history";
const RAIL_KEY = "aixia-sidebar-open";
const THEME_KEY = "aixia-theme";
const EMPTY_MESSAGES = [];
// Relative paths: Next.js proxies these to the backend server-side (see
// next.config.mjs rewrites), so the browser never needs to know the backend's
// host/port — that means no NEXT_PUBLIC_ build-time coupling, and no rebuild
// when the backend's port changes.
const STREAM_URL = "/api/chat/stream/";
const HEALTH_URL = "/api/healthz";
const HEALTH_INTERVAL_MS = 60_000;

// Drawn from, not shown whole — each conversation opens with its own three, so
// the empty hero is not the same wall of text every time you hit New.
const STARTER_POOL = [
  "What is Sean's machine learning experience?",
  "Tell me about his embedded systems background.",
  "What projects has Sean worked on?",
  "What certifications does he hold?",
  "Where did he study, and how did he do?",
  "What does he use day to day — languages, frameworks, tools?",
  "Walk me through his most technically ambitious project.",
  "What is his current role, and what does he do there?",
  "Has he worked with computer vision?",
  "What is he trying to learn next?",
  "How does he approach testing and documentation?",
  "What would make him a good fit for an AI team?",
];
const STARTER_COUNT = 3;

// FNV-1a. Any stable string-to-int would do; the point is that the same chat
// always draws the same three prompts — so they do not reshuffle under the
// cursor on re-render, or change between the server's HTML and the client's.
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function startersFor(chatId) {
  const remaining = STARTER_POOL.slice();
  const picked = [];
  let seed = hashString(chatId || "aixia");
  while (picked.length < STARTER_COUNT && remaining.length) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    picked.push(remaining.splice(seed % remaining.length, 1)[0]);
  }
  return picked;
}

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

function readStored(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored;
  } catch {
    return fallback;
  }
}

function dayLabel(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const diff = Math.round((startOf(today) - startOf(date)) / dayMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function ChatWindow() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(new Set());
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [status, setStatus] = useState("connecting");
  // The panel keeps its sources after closing. Clearing them would swap the
  // cards for the empty state mid-slide-out, and the viewer would watch the
  // answer's own sources disappear on the way off screen.
  const [sourcesView, setSourcesView] = useState({ open: false, sources: EMPTY_MESSAGES, index: null });
  const [showScrollFab, setShowScrollFab] = useState(false);

  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || EMPTY_MESSAGES;
  const loading = loadingChats.has(activeChat?.id);

  useEffect(() => {
    const restored = loadChats();
    const fresh = makeChat();
    // Browser storage is external state; initialize it after hydration.
    setChats([fresh, ...restored]);
    setActiveChatId(fresh.id);
    setRailCollapsed(readStored(RAIL_KEY, "true") !== "true");
    setTheme(readStored(THEME_KEY, "dark") === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!chats.length) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
    } catch {
      // Storage can be disabled or full; the active UI remains usable in memory.
    }
  }, [chats]);

  // Skips the first run: the theme is already correct at first paint (the
  // bootstrap script in layout.js sets it), and crossfading into it would look
  // like the page loading wrong and then correcting itself.
  const themeSettled = useRef(false);
  useEffect(() => {
    const root = document.documentElement;

    if (themeSettled.current) {
      // Every panel and bubble changes color at once here. Component rules own
      // the `transition` shorthand, so the only way to tween all of them is to
      // outrank those rules for the length of the swap — see .theme-transition
      // in globals.css — then get out of the way so hover timings stay snappy.
      root.classList.add("theme-transition");
      // The flush is load-bearing: a transition only starts when the property
      // is already in the *previous* computed style. Adding the class and
      // flipping data-theme in one tick batches into a single recalc, the
      // browser sees no prior transition, and every colour snaps instead.
      void root.offsetHeight;
      const done = setTimeout(() => root.classList.remove("theme-transition"), 460);
      root.setAttribute("data-theme", theme);
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Storage can be disabled; the theme still applies for this session.
      }
      return () => clearTimeout(done);
    }

    themeSettled.current = true;
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage can be disabled; the theme still applies for this session.
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, String(!railCollapsed));
    } catch {
      // Storage can be disabled; the rail still toggles for this session.
    }
  }, [railCollapsed]);

  // The status pill reports the backend, not the frontend, so it has to ask.
  // Render's free tier sleeps the service, and the first request after a sleep
  // takes ~30s to cold-start — the pill sitting on "connecting" through that
  // wait is the honest reading, not a stall.
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const response = await fetch(HEALTH_URL, { cache: "no-store" });
        if (!cancelled) setStatus(response.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }
    ping();
    const interval = setInterval(ping, HEALTH_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;
    setShowScrollFab(node.scrollHeight - node.scrollTop - node.clientHeight >= 80);
  }

  function scrollToLatest() {
    const node = scrollRef.current;
    node?.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
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

  // Below 60rem the sidebar is a drawer over the conversation, so anything that
  // changes which conversation you are looking at has to get out of the way —
  // otherwise you pick a chat and keep staring at the list that covers it.
  function dismissDrawer() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 60rem)").matches) {
      setRailCollapsed(true);
    }
  }

  function startNewChat() {
    const chat = makeChat();
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setInput("");
    dismissDrawer();
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

  async function runChatStream(chatId, requestBody) {
    setLoadingChats((current) => new Set(current).add(chatId));

    // Tokens are revealed through the pacer rather than painted on arrival, so
    // the answer types itself evenly instead of lurching a phrase at a time.
    const pacer = createTypingPacer({
      onReveal: (chunk) => updateLastMessage(chatId, (message) => ({ ...message, content: message.content + chunk })),
      onSettled: () => updateLastMessage(chatId, (message) => ({ ...message, streaming: false })),
    });

    try {
      const response = await fetch(STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok || !response.body) throw new Error(`Server responded with ${response.status}`);
      setStatus("online");

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
            pacer.push(event.content);
          } else if (event.type === "suggestions") {
            updateLastMessage(chatId, (message) => ({ ...message, suggestions: event.suggestions }));
          } else if (event.type === "title") {
            // The opening question was used as a placeholder title the moment
            // the message was sent; this is the summary that replaces it. A
            // title the reader chose themselves always wins.
            setChats((current) => current.map((chat) => (
              chat.id === chatId && !chat.titleSetByUser
                ? { ...chat, title: event.title, updatedAt: Date.now() }
                : chat
            )));
          } else if (event.type === "done") {
            updateChat(chatId, { sessionId: event.session_id, sessionToken: event.session_token });
            // Not `streaming: false` — the pacer may still have text queued.
            // It flips that flag itself once the buffer has drained.
            pacer.close();
          } else if (event.type === "error") {
            pacer.flush();
            updateLastMessage(chatId, (message) => ({ ...message, role: "error", content: message.content || event.message, streaming: false }));
          }
        }
      }

      // The server can close without a "done" (a dropped connection mid-answer);
      // settle whatever is buffered rather than leaving a caret blinking forever.
      pacer.close();
      await pacer.whenSettled();
    } catch (error) {
      setStatus("offline");
      pacer.flush();
      updateLastMessage(chatId, (message) => (
        message.content
          ? { ...message, streaming: false }
          : { ...message, role: "error", content: `I couldn't connect to AIxia. ${error.message}`, streaming: false }
      ));
    } finally {
      // Cleared only after the reveal finishes, so the composer does not
      // re-enable while the answer is still typing itself out.
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
    const now = Date.now();
    const userMessage = { role: "user", content: question, at: now };
    const assistantPlaceholder = { role: "assistant", content: "", sources: [], streaming: true, at: now };
    const nextMessages = [...activeChat.messages, userMessage, assistantPlaceholder];
    const shouldAutoTitle = !activeChat.messages.length && !activeChat.titleSetByUser;
    updateChat(chatId, { messages: nextMessages, title: shouldAutoTitle ? question.slice(0, 38) : activeChat.title });
    setInput("");

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

  function exportConversation() {
    if (!activeChat?.messages.length) return;
    const lines = [`# ${activeChat.title}`, "", `_Exported ${new Date().toLocaleString()}_`, ""];
    for (const message of activeChat.messages) {
      if (message.role === "user") lines.push(`## You`, "", message.content, "");
      else lines.push(`## AIxia`, "", message.content, "");
      if (message.sources?.length) {
        lines.push("**Sources**", "");
        message.sources.forEach((source, index) => {
          lines.push(`${index + 1}. ${source.original_filename}${Number.isInteger(source.page) ? ` · p.${source.page + 1}` : ""}`);
        });
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeChat.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "aixia-conversation"}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const showSources = useCallback((sources, index) => setSourcesView({ open: true, sources, index }), []);
  const closeSources = useCallback(() => setSourcesView((view) => ({ ...view, open: false })), []);

  const starters = useMemo(() => startersFor(activeChat?.id), [activeChat?.id]);

  // A divider is emitted only where the day actually changes. Threads saved
  // before messages carried timestamps have none, and get no divider rather
  // than a fabricated one.
  const rows = useMemo(() => {
    let lastDay = null;
    return messages.map((message, index) => {
      const day = message.at ? dayLabel(message.at) : null;
      const divider = day && day !== lastDay ? day : null;
      if (day) lastDay = day;
      return { message, index, divider };
    });
  }, [messages]);

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <div className="fade-top" aria-hidden="true" />
      <div className="fade-bottom" aria-hidden="true" />

      <div className={`shell${railCollapsed ? " rail-collapsed" : ""}`}>
        {/* Always mounted, faded by class — mounting it only while open meant
            the dimming blinked in and out around a drawer that was sliding. */}
        <button
          type="button"
          className={`rail-scrim${railCollapsed ? "" : " open"}`}
          aria-label="Collapse sidebar"
          tabIndex={railCollapsed ? -1 : 0}
          aria-hidden={railCollapsed}
          onClick={() => setRailCollapsed(true)}
        />

        <Sidebar
          chats={chats}
          activeChatId={activeChat?.id}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((collapsed) => !collapsed)}
          onSelectChat={(chatId) => { setActiveChatId(chatId); setInput(""); dismissDrawer(); }}
          onNewChat={startNewChat}
          onRenameChat={(chatId, title) => updateChat(chatId, { title, titleSetByUser: true })}
          onDeleteChat={deleteChat}
        />

        <div className="main">
          <AppHeader
            title={activeChat?.title || "New conversation"}
            status={status}
            theme={theme}
            onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          />

          <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
            <div className="chat-thread">
              {messages.length === 0 ? (
                <div className="empty-hero">
                  <h1>Ask me anything about <em>Vince</em></h1>
                  <p>I answer from his CV, projects and notes — grounded in the documents, with the sources you can check.</p>
                  <div className="starter-grid">
                    {starters.map((starter, index) => (
                      <button key={starter} type="button" className="starter-card" onClick={() => sendMessage(starter)}>
                        <span className="starter-index">0{index + 1}</span>
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                rows.map(({ message, index, divider }) => (
                  <ThreadRow key={`${message.role}-${index}`} divider={divider}>
                    <MessageRow
                      message={message}
                      isLast={index === messages.length - 1}
                      onOpenSources={(sourceIndex) => showSources(message.sources || [], sourceIndex)}
                      onRegenerate={() => regenerateMessage(activeChat.id)}
                      onFeedback={(value) => setMessageFeedback(activeChat.id, index, value)}
                      onSuggestionClick={(text) => sendMessage(text)}
                    />
                  </ThreadRow>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <Composer
            value={input}
            onChange={setInput}
            onSend={sendMessage}
            onExport={exportConversation}
            disabled={loading}
            canExport={messages.length > 0}
          />

          <button
            type="button"
            className={`scroll-fab${showScrollFab ? " show" : ""}`}
            onClick={scrollToLatest}
            aria-label="Scroll to latest"
            tabIndex={showScrollFab ? 0 : -1}
          >
            <ArrowDownIcon />
          </button>
        </div>
      </div>

      <SourcesPanel
        open={sourcesView.open}
        sources={sourcesView.sources}
        highlightedIndex={sourcesView.index}
        onClose={closeSources}
      />
    </>
  );
}

function ThreadRow({ divider, children }) {
  return (
    <>
      {divider && <div className="day-divider">{divider}</div>}
      {children}
    </>
  );
}
