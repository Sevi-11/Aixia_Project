// Conversations live in this browser only; see "Session isolation" in the README.
const HISTORY_KEY = "aixia-chat-history";

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

export function makeChat() {
  return { id: createChatId(), title: "New conversation", titleSetByUser: false, messages: [], sessionId: null, mode: "grounded", updatedAt: Date.now() };
}

export function loadChats() {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(stored) && stored.length ? stored : [makeChat()];
  } catch {
    return [makeChat()];
  }
}

export function saveChats(chats) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
  } catch {
    // Storage can be disabled or full; the active UI remains usable in memory.
  }
}

export function dayLabel(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const diff = Math.round((startOf(today) - startOf(date)) / dayMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}
