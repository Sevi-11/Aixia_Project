"use client";

/*
 * Xia's ear.
 *
 * The Web Speech API, entirely in the browser: no backend, no audio upload
 * from this app, no cold start, and no per-request cost -- which is what makes
 * a voice loop viable at all on a free-tier backend with an output-token
 * ceiling. The recogniser is push-to-talk rather than always-on: a page that
 * holds the microphone open is a page nobody should leave in a tab.
 *
 * Support is Chrome/Edge, Safari 14.1+ on macOS, Safari 14.5+ on iOS and
 * Samsung Internet. Firefox keeps it behind a flag, so callers must treat the
 * absence of the API as normal and leave typing working. Note that on most
 * engines this ships audio to a vendor service for transcription; it is not
 * on-device everywhere.
 *
 * Requires a secure context: HTTPS, or localhost in development.
 */

export function isListenerAvailable() {
  if (typeof window === "undefined") return false;
  return typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === "function";
}

// Spoken by a person who cannot see the message they are dictating, so they say
// what went wrong rather than naming the error code.
const MESSAGES = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser's site settings.",
  "service-not-allowed": "Microphone access was blocked. Allow it in your browser's site settings.",
  "no-speech": "I didn't catch anything — try again.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition needs a network connection.",
};

/**
 * @param {{
 *   onInterim?: (text: string) => void,
 *   onFinal?: (text: string) => void,
 *   onStart?: () => void,
 *   onEnd?: () => void,
 *   onError?: (message: string) => void,
 * }} handlers
 */
export function createListener({ onInterim, onFinal, onStart, onEnd, onError } = {}) {
  let recognition = null;
  let listening = false;

  function build() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const instance = new Recognition();
    // Not continuous: one utterance per press. Continuous recognition keeps
    // the mic hot indefinitely and, on mobile, drains the battery for it.
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    instance.lang = document.documentElement.lang || "en-US";

    instance.onstart = () => { listening = true; onStart?.(); };

    instance.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) onInterim?.(interim.trim());
      if (final.trim()) onFinal?.(final.trim());
    };

    instance.onerror = (event) => {
      // `aborted` is what a deliberate stop() looks like from here.
      if (event.error === "aborted") return;
      onError?.(MESSAGES[event.error] || "Speech recognition failed.");
    };

    instance.onend = () => {
      listening = false;
      recognition = null;
      onEnd?.();
    };

    return instance;
  }

  return {
    isAvailable: isListenerAvailable,

    get listening() {
      return listening;
    },

    start() {
      if (!isListenerAvailable() || listening) return false;
      try {
        recognition = build();
        recognition.start();
        return true;
      } catch {
        // start() throws if called while a previous session is still winding
        // down. Treat it as a no-op rather than surfacing it to the reader.
        recognition = null;
        listening = false;
        return false;
      }
    },

    /** Stop and keep whatever has been transcribed so far. */
    stop() {
      if (!recognition) return;
      try { recognition.stop(); } catch { /* already stopping */ }
    },

    /** Stop and discard. Used on teardown. */
    abort() {
      if (!recognition) return;
      try { recognition.abort(); } catch { /* already stopped */ }
    },
  };
}
