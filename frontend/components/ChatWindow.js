"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "./AppHeader";
import Composer from "./Composer";
import EmptyHero from "./EmptyHero";
import MessageRow from "./MessageRow";
import Sidebar from "./Sidebar";
import SourcesPanel from "./SourcesPanel";
import VoiceScreen from "./VoiceScreen";
import { ArrowDownIcon } from "./icons";
import { dayLabel, loadChats, makeChat, saveChats } from "./chatStore";
import { downloadConversation } from "./exportChat";
import { startersFor } from "./starters";
import { useBackendStatus } from "./useBackendStatus";
import { useTheme } from "./useTheme";
import { useXiaState } from "./xia/useXiaState";
import { streamChat } from "./xia/chatStream";
import { createSpeaker } from "./xia/tts";
import { speakableText } from "./xia/speakable";
import { createListener, probeListener } from "./xia/stt";

const VOICE_KEY = "aixia-voice";
const EMPTY_MESSAGES = [];

export default function ChatWindow() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(new Set());
  const [railCollapsed, setRailCollapsed] = useState(null);
  const [, setTheme] = useTheme();
  const [voiceOn, setVoiceOn] = useState(() => (
    typeof document !== "undefined" && document.documentElement.getAttribute("data-voice") === "on"
  ));
  // A presentation mode, not a per-conversation setting -- it stays put across
  // chat switches, and always starts on "chat" (never persisted): a call
  // screen greeting the reader on arrival is exactly the surprise the sidebar
  // rail avoided by the same rule.
  const [interactionMode, setInteractionMode] = useState("chat");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState(null);
  const [status, setStatus] = useBackendStatus();
  // The panel keeps its sources after closing. Clearing them would swap the
  // cards for the empty state mid-slide-out, and the viewer would watch the
  // answer's own sources disappear on the way off screen.
  const [sourcesView, setSourcesView] = useState({ open: false, sources: EMPTY_MESSAGES, index: null });
  const [showScrollFab, setShowScrollFab] = useState(false);

  const scrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Xia is one figure on screen but several chats can stream at once, so she
  // reflects the ACTIVE chat only. runChatStream reads this ref at event time
  // rather than closing over activeChatId, which would be stale for a stream
  // that outlives a chat switch.
  const { state: xiaState, send: sendXia } = useXiaState();
  const activeChatIdRef = useRef(null);
  // Read inside a running stream, so flipping the toggle mid-answer takes
  // effect on that answer rather than the next one.
  const voiceOnRef = useRef(voiceOn);
  // Same reason: the streaming callbacks below close over render-time values,
  // and a call in progress has to see a mode switch that happens mid-answer.
  const interactionModeRef = useRef(interactionMode);

  // Built on first use, not at module scope: `window.speechSynthesis` does not
  // exist while this renders on the server.
  const speakerRef = useRef(null);
  function getSpeaker() {
    if (!speakerRef.current) {
      speakerRef.current = createSpeaker({
        // "reveal" rather than a state of its own: from `thinking` it moves her
        // to speaking, and from `speaking` it is a no-op. Audio starting is the
        // same event as text starting, as far as she is concerned.
        onStart: () => sendXia("reveal"),
        onEnd: () => sendXia("settle"),
      });
    }
    return speakerRef.current;
  }

  const activeChat = chats.find((chat) => chat.id === activeChatId) || chats[0];
  // Threads saved before modes existed have none; they were grounded.
  const mode = activeChat?.mode === "general" ? "general" : "grounded";
  const messages = activeChat?.messages || EMPTY_MESSAGES;
  const loading = loadingChats.has(activeChat?.id);

  useEffect(() => {
    const restored = loadChats();
    const fresh = makeChat();
    // Browser storage is external state; initialize it after hydration.
    //
    // This is the cascading render the rule warns about, and it is the point:
    // localStorage does not exist on the server, so the list cannot be seeded
    // in a useState initialiser without the server and client rendering
    // different HTML. One extra render on mount is the price of not flashing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats([fresh, ...restored]);
    setActiveChatId(fresh.id);
    // Adopt what the bootstrap resolved before paint, then take the attribute
    // away: from here the shell's own class is the single source of truth, and
    // leaving both in play would let them drift apart.
    const root = document.documentElement;
    setRailCollapsed(root.getAttribute("data-rail") === "collapsed");
    root.removeAttribute("data-rail");
  }, []);

  useEffect(() => {
    if (chats.length) saveChats(chats);
  }, [chats]);

  const voiceSettled = useRef(false);
  useEffect(() => {
    voiceOnRef.current = voiceOn;
    document.documentElement.setAttribute("data-voice", voiceOn ? "on" : "off");
    if (!voiceSettled.current) {
      // Adoption pass: apply what the bootstrap already resolved, write nothing.
      voiceSettled.current = true;
      return;
    }
    if (!voiceOn) speakerRef.current?.cancel();
    try {
      localStorage.setItem(VOICE_KEY, voiceOn ? "on" : "off");
    } catch {
      // Storage can be disabled; the setting still applies for this session.
    }
  }, [voiceOn]);

  const listenerRef = useRef(null);
  // sendMessage is redefined every render; the listener is built once, so its
  // callbacks reach the current one through a ref rather than a stale closure.
  const sendMessageRef = useRef(null);

  function getListener() {
    if (!listenerRef.current) {
      listenerRef.current = createListener({
        onStart: () => { setMicError(null); setListening(true); sendXia("listen"); },
        onInterim: (text) => setInput(text),
        onFinal: (text) => {
          // Dictation ends by asking the question. stop() first, so the
          // recogniser is already winding down while the request goes out.
          listenerRef.current?.stop();
          sendMessageRef.current?.(text);
        },
        onError: (message, info) => {
          setMicError(message);
          // A browser that cannot reach a speech service will fail this way
          // every time. Offering the button again would invite the reader to
          // press it until they conclude the app is broken, so it goes away
          // and typing carries on. The same attribute the bootstrap sets, so
          // the CSS that already hides the mic does the work.
          if (info?.fatal) document.documentElement.setAttribute("data-stt", "no");
        },
        // Not a blanket cancel: by the time this fires after a final result,
        // the question is already in flight and she is thinking, not listening.
        onEnd: () => { setListening(false); sendXia("endListen"); },
      });
    }
    return listenerRef.current;
  }

  function toggleListening() {
    const listener = getListener();
    if (listener.listening) { listener.stop(); return; }
    // Barge-in: speaking over her should interrupt her, not talk across her.
    speakerRef.current?.cancel();
    setInput("");
    listener.start();
  }

  useEffect(() => {
    interactionModeRef.current = interactionMode;
    if (interactionMode === "voice") {
      // A call nobody can hear is not a call. This is the one direction that
      // auto-adjusts the speaker -- leaving Voice never turns it back off,
      // since a reader who wanted answers read aloud in Chat too should not
      // have that taken away by a mode switch they made for other reasons.
      setVoiceOn(true);
    } else {
      // Leaving the call ends it, rather than leaving the mic running
      // somewhere the reader can no longer see or stop it from.
      listenerRef.current?.stop();
      speakerRef.current?.cancel();
    }
  }, [interactionMode]);

  // Release the microphone if the component goes away mid-dictation.
  useEffect(() => () => {
    listenerRef.current?.abort();
    speakerRef.current?.cancel();
  }, []);

  useEffect(() => {
    let cancelled = false;
    probeListener().then((usable) => {
      if (!cancelled && !usable) document.documentElement.setAttribute("data-stt", "no");
    });
    return () => { cancelled = true; };
  }, []);

  // A microphone complaint is about the last attempt only.
  useEffect(() => {
    if (!micError) return;
    // Left standing when the microphone is gone for good: it is the only
    // explanation the reader gets for a button that just disappeared.
    if (document.documentElement.getAttribute("data-stt") === "no") return;
    const clear = setTimeout(() => setMicError(null), 6000);
    return () => clearTimeout(clear);
  }, [micError]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const id = activeChat?.id ?? null;
    // Guarded on an ACTUAL change of conversation. This effect also re-runs
    // whenever loadingChats changes, and a stream removes its id there in its
    // finally block -- so cancelling unconditionally here killed the speaker
    // one chunk into every answer, because the answer starts being spoken at
    // the very moment the stream finishes.
    if (activeChatIdRef.current === id) return;
    activeChatIdRef.current = id;
    // Xia follows the conversation on screen, and so does her voice: reading
    // out an answer the reader has navigated away from is worse than silence.
    speakerRef.current?.cancel();
    sendXia(loadingChats.has(id) ? "ask" : "cancel");
  }, [activeChat?.id, loadingChats, sendXia]);

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

  // The sidebar is a drawer over the conversation at every width now, so
  // anything that changes which conversation you're looking at has to get out
  // of the way — otherwise you pick a chat and keep staring at the list that
  // covers it.
  function dismissDrawer() {
    setRailCollapsed(true);
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

    // Xia reflects the conversation on screen, so events from a stream the
    // reader has navigated away from are dropped rather than animated.
    const forXia = (event) => { if (chatId === activeChatIdRef.current) sendXia(event); };

    // Reads the answer aloud when voice is on, and resolves when she stops.
    // Returns false when nothing was spoken, so the caller knows it still owes
    // Xia a settle -- exactly one of the two must happen, or she is left
    // mid-sentence forever.
    const speakIfEnabled = async (text) => {
      const speaker = getSpeaker();
      if (chatId !== activeChatIdRef.current || !voiceOnRef.current || !speaker.isAvailable()) return false;
      const spoken = speakableText(text);
      if (!spoken) return false;
      await speaker.speak(spoken);
      return true;
    };

    // Keeps a voice call going: once she has finished the reply, listen for
    // the next turn without being asked again. Only after a clean answer --
    // not after an error, where retrying blind into whatever just failed is
    // the wrong default, and the reader can always tap the mic themselves.
    const resumeListeningIfOnCall = () => {
      if (interactionModeRef.current !== "voice") return;
      if (chatId !== activeChatIdRef.current) return;
      if (document.documentElement.getAttribute("data-stt") === "no") return;
      const listener = getListener();
      if (!listener.listening) listener.start();
    };

    try {
      await streamChat(requestBody, {
        onStatus: setStatus,

        onSources: (sources) => updateLastMessage(chatId, (message) => ({ ...message, sources })),

        onReveal: (chunk) => {
          // "speaking" tracks text revealing -- except on a voice call, where
          // there is no text on screen and she does not read aloud until the
          // answer has fully settled. Flipping to speaking on the first token
          // there would show the speaking figure for the whole (silent) stream,
          // then start the voice seconds later. On a call, let the audio drive
          // it: she stays thinking until the speaker's onStart fires at real
          // audio onset (see tts.js), which sends its own "reveal".
          if (interactionModeRef.current !== "voice") forXia("reveal");
          updateLastMessage(chatId, (message) => ({ ...message, content: message.content + chunk }));
        },

        onSuggestions: (suggestions) => updateLastMessage(chatId, (message) => ({ ...message, suggestions })),

        onTitle: (title) => {
          // The opening question was used as a placeholder title the moment the
          // message was sent; this is the summary that replaces it. A title the
          // reader chose themselves always wins.
          setChats((current) => current.map((chat) => (
            chat.id === chatId && !chat.titleSetByUser
              ? { ...chat, title, updatedAt: Date.now() }
              : chat
          )));
        },

        onSession: ({ sessionId, sessionToken }) => updateChat(chatId, { sessionId, sessionToken }),

        onSettled: async (fullText) => {
          updateLastMessage(chatId, (message) => ({ ...message, streaming: false }));
          // Speaking begins only once the text has finished revealing.
          // Synthesis mid-stream would queue an utterance per token burst and
          // read the answer back in overlapping fragments.
          if (!(await speakIfEnabled(fullText))) forXia("settle");
          resumeListeningIfOnCall();
        },

        onError: async ({ text, revealed, friendly, midStream }) => {
          updateLastMessage(chatId, (message) => {
            // An error carried by the stream marks the turn as failed even if
            // some of the answer had arrived. A failure of the request itself
            // keeps a half-written answer as an ordinary message -- it is the
            // connection that broke, not the reply.
            if (midStream) {
              return { ...message, role: "error", content: message.content || text, streaming: false };
            }
            return revealed
              ? { ...message, streaming: false }
              : { ...message, role: "error", content: text, streaming: false };
          });

          // She says it rather than simply stopping. A character that goes
          // quiet reads as a bug; one that explains reads as a limit.
          if (!(await speakIfEnabled(revealed ? "" : text))) forXia("cancel");
        },
      });
    } finally {
      // Cleared only after the reveal -- and any speech -- finishes, so the
      // composer does not re-enable while the answer is still arriving.
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
    // One read, shared by both messages: taking the clock inside the state
    // updater instead would re-stamp them on unrelated re-renders.
    const now = Date.now();
    const userMessage = { role: "user", content: question, at: now };
    const assistantPlaceholder = { role: "assistant", content: "", sources: [], streaming: true, at: now };
    const nextMessages = [...activeChat.messages, userMessage, assistantPlaceholder];
    const shouldAutoTitle = !activeChat.messages.length && !activeChat.titleSetByUser;
    updateChat(chatId, { messages: nextMessages, title: shouldAutoTitle ? question.slice(0, 38) : activeChat.title });
    setInput("");
    speakerRef.current?.cancel();
    sendXia("ask");

    await runChatStream(chatId, { session_id: activeChat.sessionId, session_token: activeChat.sessionToken, question, mode });
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
    speakerRef.current?.cancel();
    sendXia("ask");
    runChatStream(chatId, {
      session_id: chat.sessionId,
      session_token: chat.sessionToken,
      regenerate: true,
      mode: chat.mode === "general" ? "general" : "grounded",
    });
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
    downloadConversation(activeChat);
  }

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  const showSources = useCallback((sources, index) => setSourcesView({ open: true, sources, index }), []);
  const closeSources = useCallback(() => setSourcesView((view) => ({ ...view, open: false })), []);

  const starters = useMemo(() => startersFor(activeChat?.id, mode), [activeChat?.id, mode]);

  // A divider is emitted only where the day actually changes. Threads saved
  // before messages carried timestamps have none, and get no divider rather
  // than a fabricated one.
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      const day = message.at ? dayLabel(message.at) : null;
      const divider = day && day !== lastDay ? day : null;
      if (day) lastDay = day;
      out.push({ message, index, divider });
    }
    return out;
  }, [messages]);

  // The lotus shows six states; the state machine drives four. Trouble and
  // muted are overlays from signals that live outside the conversation flow, so
  // they resolve here rather than in the transition table. A mic complaint wins
  // (it needs the reader's attention), then a muted call (voice off in Voice
  // mode — reachable via the header's voice toggle), then the base state.
  const xiaDisplayState = micError
    ? "trouble"
    : interactionMode === "voice" && !voiceOn
    ? "muted"
    : xiaState;

  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <div className="fade-top" aria-hidden="true" />
      <div className="fade-bottom" aria-hidden="true" />

      <div className={`shell${railCollapsed === true ? " rail-collapsed" : ""}${railCollapsed === false ? " rail-expanded" : ""}`}>
        {/* Always mounted, faded by class — mounting it only while open meant
            the dimming blinked in and out around a drawer that was sliding. */}
        <button
          type="button"
          className={`rail-scrim${railCollapsed === false ? " open" : ""}`}
          aria-label="Collapse sidebar"
          tabIndex={railCollapsed === false ? 0 : -1}
          aria-hidden={railCollapsed !== false}
          onClick={() => setRailCollapsed(true)}
        />

        <Sidebar
          chats={chats}
          activeChatId={activeChat?.id}
          collapsed={railCollapsed !== false}
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
            xiaState={xiaDisplayState}
            mode={mode}
            onSetMode={(next) => activeChat && updateChat(activeChat.id, { mode: next })}
            interactionMode={interactionMode}
            onSetInteractionMode={setInteractionMode}
            onToggleVoice={() => setVoiceOn((on) => !on)}
            onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            onOpenSidebar={() => setRailCollapsed(false)}
          />

          {interactionMode === "voice" ? (
            <VoiceScreen
              xiaState={xiaDisplayState}
              listening={listening}
              micError={micError}
              disabled={loading}
              interimText={input}
              onToggleListening={toggleListening}
            />
          ) : (
            <>
              <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
                <div className="chat-thread">
                  {messages.length === 0 ? (
                    <EmptyHero mode={mode} starters={starters} onPick={sendMessage} />
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
                listening={listening}
                micError={micError}
                onToggleListening={toggleListening}
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
            </>
          )}
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
