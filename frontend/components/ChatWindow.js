"use client";

import { useEffect, useRef, useState } from "react";

const HISTORY_KEY = "aixia-chat-history";
const EMPTY_MESSAGES = [];
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || (
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://127.0.0.1:8000"
);
const API_URL = `${API_ORIGIN}/api/chat/`;
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
  return { id: createChatId(), title: "New conversation", messages: [], sessionId: null, updatedAt: Date.now() };
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

export default function ChatWindow() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || EMPTY_MESSAGES;

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

  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  function updateChat(chatId, update) {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, ...update, updatedAt: Date.now() } : chat));
  }

  async function sendMessage(text = input) {
    const question = text.trim();
    if (!question || loading || !activeChat) return;

    const chatId = activeChat.id;
    const userMessage = { role: "user", content: question };
    const nextMessages = [...activeChat.messages, userMessage];
    updateChat(chatId, { messages: nextMessages, title: activeChat.messages.length ? activeChat.title : question.slice(0, 38) });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: activeChat.sessionId, session_token: activeChat.sessionToken, question }),
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      const data = await response.json();
      updateChat(chatId, { sessionId: data.session_id, sessionToken: data.session_token, messages: [...nextMessages, { role: "assistant", content: data.answer, sources: data.sources }] });
    } catch (error) {
      updateChat(chatId, { messages: [...nextMessages, { role: "error", content: `I couldn't connect to AIxia. ${error.message}` }] });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="flex min-h-screen bg-[#0a1128] text-[#f4f1ea]">
      <button type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className={`fixed inset-0 z-10 bg-black/50 transition-opacity duration-200 md:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside className={`fixed inset-y-0 left-0 z-20 flex h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-[#f4f1ea]/10 bg-[#080e20] pt-20 transition-[width,transform,border] duration-300 md:sticky md:top-0 md:self-start md:inset-auto md:z-auto md:translate-x-0 md:pt-20 ${sidebarOpen ? "translate-x-0 md:w-72" : "-translate-x-full border-0 md:w-0 md:translate-x-0"}`}>
        <div className={`flex min-w-[264px] flex-1 flex-col p-3 transition-[opacity,transform] duration-200 ${sidebarOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-3 opacity-0"}`}>
          <div className="flex items-center justify-between px-2 pb-5 pt-2"><span className="text-sm font-bold">Chat history</span><button type="button" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar" className="rounded-lg p-2 text-[#aab2c9] transition hover:bg-[#111b3a] hover:text-[#f4f1ea] md:hidden"><CloseIcon /></button></div>
          <button type="button" onClick={startNewChat} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#f4f1ea]/15 px-3 text-left text-sm transition hover:bg-[#111b3a] focus:outline-none focus:ring-2 focus:ring-[#f4f1ea]/60"><PlusIcon /> New chat</button>
          <div className="mt-5 flex-1 space-y-1 overflow-y-auto" aria-label="Chat history">
            {chats.map((chat) => <div key={chat.id} className={`group flex items-center gap-1 rounded-xl p-1 transition-colors ${chat.id === activeChatId ? "bg-[#172348]" : "hover:bg-[#111b3a]"}`}><button type="button" onClick={() => { setActiveChatId(chat.id); setInput(""); }} className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-left text-xs leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#f4f1ea]/60 ${chat.id === activeChatId ? "font-semibold text-[#f4f1ea]" : "text-[#aab2c9] group-hover:text-[#f4f1ea]"}`}>{chat.title}</button><button type="button" onClick={() => deleteChat(chat.id)} aria-label={`Delete ${chat.title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#7f8aa8] opacity-0 transition hover:bg-[#3b1d32] hover:text-[#ffb4b4] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#ffb4b4]/70 group-hover:opacity-100"><TrashIcon /></button></div>)}
          </div>
          <p className="px-2 pt-3 text-[10px] leading-5 text-[#66718d]">Your chat history is saved privately on this device.</p>
        </div>
      </aside>

      <section className="flex min-h-screen min-w-0 flex-1 flex-col pt-20">
        <header className="fixed left-0 right-0 top-0 z-30 h-20 border-b border-[#f4f1ea]/10 bg-[#0a1128]/95 px-4 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur md:px-8"><div className="flex h-full items-center justify-between"><div className="flex items-center gap-3 pl-12"><button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"} className="absolute left-3 rounded-xl p-3 text-[#aab2c9] transition hover:bg-[#111b3a] hover:text-[#f4f1ea] focus:outline-none focus:ring-2 focus:ring-[#f4f1ea]/60"><MenuIcon /></button><button type="button" onClick={startNewChat} aria-label="Start a new conversation" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f1ea] text-sm font-bold text-[#0a1128] transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#f4f1ea]"><span aria-hidden="true">A</span></button><div><p className="text-base font-bold tracking-tight">AIxia</p><p className="text-[11px] text-[#aab2c9]">Personal knowledge assistant</p></div></div><div className="flex items-center gap-2 rounded-full border border-[#f4f1ea]/10 px-3 py-1.5 text-[11px] text-[#aab2c9]"><span className="h-2 w-2 rounded-full bg-[#75e6a4] shadow-[0_0_10px_#75e6a4]" /> AIxia is online</div></div></header>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-10 md:px-8 md:pt-16"><div className="flex-1 overflow-y-auto pb-28">{messages.length === 0 && !loading ? <div className="animate-[fade-up_500ms_ease-out] py-8 text-center md:py-16"><div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#f4f1ea]/15 bg-[#111b3a] text-[#f4f1ea]" aria-hidden="true"><SparkIcon /></div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">How can I help you today?</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#aab2c9]">Ask AIxia about Sean&apos;s experience, projects, and technical background.</p><div className="mx-auto mt-8 grid max-w-xl gap-3 text-left md:grid-cols-3">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => chooseSuggestion(suggestion)} className="min-h-12 rounded-2xl border border-[#f4f1ea]/10 bg-[#111b3a]/70 p-3 text-xs leading-5 text-[#cbd2e5] transition hover:-translate-y-0.5 hover:border-[#f4f1ea]/30 hover:bg-[#172348] focus:outline-none focus:ring-2 focus:ring-[#f4f1ea]/60">{suggestion}</button>)}</div></div> : <div className="space-y-6">{messages.map((message, index) => <MessageBubble key={`${message.role}-${index}`} message={message} />)}{loading && <div className="flex items-center gap-2 text-sm text-[#aab2c9]" aria-live="polite"><span className="h-2 w-2 animate-pulse rounded-full bg-[#f4f1ea]" /> AIxia is thinking…</div>}</div>}<div ref={messagesEndRef} /></div><form onSubmit={handleSubmit} className="sticky bottom-4 z-10 mt-3 rounded-3xl border border-[#f4f1ea]/15 bg-[#111b3a]/95 p-2 shadow-[0_16px_50px_rgba(0,0,0,0.35)] backdrop-blur"><label htmlFor="chat-input" className="sr-only">Message AIxia</label><div className="flex items-end gap-2"><textarea ref={textareaRef} id="chat-input" rows="1" value={input} onChange={updateInput} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder="Message AIxia…" disabled={loading} className="max-h-[140px] min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 text-[#f4f1ea] outline-none placeholder:text-[#7f8aa8] disabled:opacity-50" /><button type="submit" aria-label="Send message" disabled={loading || !input.trim()} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f4f1ea] text-[#0a1128] transition hover:scale-105 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-[#f4f1ea]"><SendIcon /></button></div><p className="px-3 pb-1 text-[10px] text-[#7f8aa8]">AIxia answers from uploaded documents. Press Enter to send · Shift + Enter for a new line.</p></form></div>
      </section>
    </main>
  );
}

function MessageBubble({ message }) { const isUser = message.role === "user"; const isError = message.role === "error"; return <div className={`flex animate-[fade-up_300ms_ease-out] gap-3 ${isUser ? "justify-end" : "justify-start"}`}>{!isUser && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f4f1ea] text-xs font-bold text-[#0a1128]">A</div>}<div className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-7 ${isUser ? "rounded-br-md bg-[#f4f1ea] text-[#0a1128]" : isError ? "border border-[#ff8b8b]/30 bg-[#3b1d32] text-[#ffd0d0]" : "rounded-bl-md bg-[#111b3a] text-[#e4e7ef]"}`}><MessageContent content={message.content} />{!isUser && message.sources?.length > 0 && <details className="mt-3 border-t border-[#f4f1ea]/10 pt-2 text-xs text-[#aab2c9]"><summary className="cursor-pointer select-none transition hover:text-[#f4f1ea]">View {message.sources.length} source{message.sources.length > 1 ? "s" : ""}</summary><div className="mt-2 space-y-2">{message.sources.map((source, index) => <div key={index} className="rounded-xl bg-[#0a1128]/60 p-3"><p className="font-bold text-[#f4f1ea]">{source.original_filename}</p><p className="mt-1 line-clamp-3">{source.content}</p></div>)}</div></details>}</div></div>; }

function MessageContent({ content }) {
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
        items.push(<li key={index}>{formatInline(match[1])}</li>);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`} className={`${ordered ? "list-decimal" : "list-disc"} my-2 space-y-1 pl-6`}>{items}</List>);
      continue;
    }

    if (line.trim()) blocks.push(<p key={`paragraph-${index}`} className="my-2 first:mt-0 last:mb-0">{formatInline(line)}</p>);
    index += 1;
  }

  return <div>{blocks}</div>;
}

function formatInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^`.*`$/.test(part)) return <code key={index} className="rounded bg-[#0a1128]/70 px-1.5 py-0.5 text-[0.9em] text-[#f4f1ea]">{part.slice(1, -1)}</code>;
    return part;
  });
}

const Icon = ({ children }) => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const MenuIcon = () => <Icon><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
const CloseIcon = () => <Icon><path d="m6 6 12 12M18 6 6 18" /></Icon>;
const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const SendIcon = () => <Icon><path d="m5 12 14-7-4 14-3-6-7-1Z" /><path d="m12 13 7-8" /></Icon>;
const TrashIcon = () => <Icon><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></Icon>;
const SparkIcon = () => <Icon><path d="M12 3 13.8 9.2 20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" /><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z" /></Icon>;
