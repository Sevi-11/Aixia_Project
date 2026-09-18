"use client";

import { createTypingPacer } from "../typingPacer";

/*
 * One turn of conversation: POST the question, read the NDJSON stream, pace the
 * reveal, and report what happened through callbacks.
 *
 * Lifted out of ChatWindow so a second view can drive the same turn without a
 * duplicated fetch and a second copy of the settle/speak invariant below. It is
 * a plain async function rather than a hook on purpose: it holds no React state
 * and runs no effects, so hook-shaped packaging would buy ceremony and cost
 * testability -- this can be exercised with a stubbed fetch and no renderer.
 *
 * It knows nothing about chats, sidebars, titles-the-reader-typed, or Xia. Every
 * callback is supplied per call, so the caller's own bookkeeping (which chat,
 * which message) rides along in the closure exactly as it did before.
 */

// Relative: next.config.mjs rewrites proxy these server-side, so the browser
// never needs the backend's host or port.
export const STREAM_URL = "/api/chat/stream/";

// Silence in a voice interface reads as broken, so a refusal has to be as
// speakable as an answer. This is the one the free tier will actually produce.
export const CAPACITY_MESSAGE =
  "I'm at capacity for general chat right now — it's rate limited so this stays free to run. "
  + "Try again shortly, or switch to About Vince, which has its own budget.";

/**
 * @param {object} requestBody          Posted as-is: question, session, mode.
 * @param {object} handlers
 * @param {(status: "online"|"offline") => void} [handlers.onStatus]
 * @param {(sources: object[]) => void} [handlers.onSources]
 * @param {(chunk: string) => void} [handlers.onReveal]   Paced, not raw tokens.
 * @param {(suggestions: string[]) => void} [handlers.onSuggestions]
 * @param {(title: string) => void} [handlers.onTitle]
 * @param {(session: {sessionId: number, sessionToken: string}) => void} [handlers.onSession]
 * @param {(fullText: string) => void|Promise<void>} [handlers.onSettled]
 *        The reveal has finished, with the complete answer. May return a
 *        promise -- reading the answer aloud, say -- and the turn is not over
 *        until it resolves.
 * @param {(failure: {text: string, revealed: string, friendly: boolean, midStream: boolean}) => void|Promise<void>} [handlers.onError]
 *        `text` is what to show when nothing was revealed; `revealed` is
 *        whatever had already arrived. `friendly` marks a refusal the service
 *        meant to give (a rate limit) rather than the backend being
 *        unreachable -- the two deserve different wording and a different
 *        connection status. `midStream` distinguishes an error event carried
 *        BY the stream from a failure of the request itself; the caller treats
 *        a half-written answer differently in each case.
 * @param {AbortSignal} [handlers.signal]
 *
 * Exactly one of onSettled and onError runs, always, for every call.
 */
export async function streamChat(requestBody, handlers = {}) {
  const {
    onStatus, onSources, onReveal, onSuggestions, onTitle, onSession,
    onSettled, onError, signal,
  } = handlers;

  // Accumulated here rather than read back out of the caller's state: a React
  // updater is not guaranteed to have run by the time the pacer settles, and
  // whatever happens next needs the finished answer at exactly that moment.
  let revealed = "";

  // Tokens are revealed through the pacer rather than painted on arrival, so
  // the answer types itself evenly instead of lurching a phrase at a time.
  const pacer = createTypingPacer({
    onReveal: (chunk) => {
      revealed += chunk;
      onReveal?.(chunk);
    },
  });

  try {
    const response = await fetch(STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (response.status === 429) {
      const capacity = new Error(CAPACITY_MESSAGE);
      capacity.friendly = true;
      throw capacity;
    }
    if (!response.ok || !response.body) throw new Error(`Server responded with ${response.status}`);
    onStatus?.("online");

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
          onSources?.(event.sources);
        } else if (event.type === "token") {
          pacer.push(event.content);
        } else if (event.type === "suggestions") {
          onSuggestions?.(event.suggestions);
        } else if (event.type === "title") {
          onTitle?.(event.title);
        } else if (event.type === "done") {
          onSession?.({ sessionId: event.session_id, sessionToken: event.session_token });
          // Deliberately not "finished": the pacer may still have text queued,
          // and it settles itself once the buffer has drained.
          pacer.close();
        } else if (event.type === "error") {
          pacer.flush();
          await pacer.whenSettled();
          await onError?.({
            text: event.message,
            revealed,
            friendly: false,
            midStream: true,
          });
          return;
        }
      }
    }

    // The server can close without a "done" -- a connection dropped mid-answer.
    // Settle whatever is buffered rather than leaving a caret blinking forever.
    pacer.close();
    await pacer.whenSettled();
    await onSettled?.(revealed);
  } catch (error) {
    pacer.flush();
    await pacer.whenSettled();

    // A rate limit is the service working as designed, not the backend being
    // unreachable. Reporting "offline" would send the reader off to check their
    // connection over something that fixes itself in an hour.
    if (!error.friendly) onStatus?.("offline");

    await onError?.({
      text: error.friendly ? error.message : `I couldn't connect to AIxia. ${error.message}`,
      revealed,
      friendly: !!error.friendly,
      midStream: false,
    });
  }
}
