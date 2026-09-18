"use client";

import { useCallback, useReducer } from "react";

// Xia's four states. The names are what the UI shows, not what the network is
// doing: "speaking" means text is being revealed to the reader, whether or not
// audio is actually playing. Phase 2 hangs TTS off the same edge.
export const IDLE = "idle";
export const LISTENING = "listening";
export const THINKING = "thinking";
export const SPEAKING = "speaking";

// A transition table rather than a switch, so an event that makes no sense in
// the current state is a no-op instead of a bug. That matters most for
// `reveal`, which the pacer fires on every chunk: the first one moves
// thinking -> speaking and the next two hundred do nothing.
const TRANSITIONS = {
  [IDLE]: { listen: LISTENING, ask: THINKING },
  // `endListen` exists so the recogniser shutting down cannot cancel a request
  // it just started: dictation ends by submitting, and the `end` event lands
  // AFTER the question is already in flight. A blanket `cancel` there would
  // drop her out of `thinking` the instant she entered it.
  [LISTENING]: { ask: THINKING, cancel: IDLE, endListen: IDLE },
  [THINKING]: { reveal: SPEAKING, settle: IDLE, cancel: IDLE },
  [SPEAKING]: { settle: IDLE, cancel: IDLE, ask: THINKING },
};

function reducer(state, event) {
  return TRANSITIONS[state]?.[event] ?? state;
}

/**
 * @returns {{ state: string, send: (event: string) => void }}
 *   `send` takes one of: listen | ask | reveal | settle | cancel | endListen.
 */
export function useXiaState(initial = IDLE) {
  const [state, dispatch] = useReducer(reducer, initial);
  // Stable identity: ChatWindow passes this into the pacer's callbacks, which
  // are built once per stream.
  const send = useCallback((event) => dispatch(event), []);
  return { state, send };
}
