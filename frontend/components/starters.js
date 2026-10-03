// Drawn from, not shown whole — each conversation opens with its own three, so
// the empty hero is not the same wall of text every time you hit New.
const STARTER_POOL = [
  "What is Vince's machine learning experience?",
  "Tell me about his embedded systems background.",
  "What projects has Vince worked on?",
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

// General mode has its own openers: the grounded pool is entirely about Vince,
// which is the one subject this mode declines.
const GENERAL_STARTER_POOL = [
  "Explain vector embeddings in plain English.",
  "Help me draft a short follow-up email after an interview.",
  "What's the difference between SQL and NoSQL?",
  "Walk me through how HTTPS actually works.",
  "Give me three ideas for a weekend project in Python.",
  "Summarise the tradeoffs between REST and GraphQL.",
  "How should I structure a technical README?",
  "What makes a good unit test?",
  "Explain Big-O notation with a real example.",
  "What questions should I ask at the end of an interview?",
  "Explain Docker to someone who has never used it.",
  "How do I choose between a monolith and microservices?",
];

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

export function startersFor(chatId, mode) {
  const remaining = (mode === "general" ? GENERAL_STARTER_POOL : STARTER_POOL).slice();
  const picked = [];
  let seed = hashString(chatId || "aixia");
  while (picked.length < STARTER_COUNT && remaining.length) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    picked.push(remaining.splice(seed % remaining.length, 1)[0]);
  }
  return picked;
}
