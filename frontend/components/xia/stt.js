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
 * IMPORTANT: the presence of the constructor does not mean recognition works.
 * Chromium derivatives -- Brave, Opera, Arc, Electron shells -- expose
 * SpeechRecognition but ship without Google's speech API key, so every attempt
 * fails with `network` and no amount of retrying will help. That is why
 * `network` is treated as FATAL below: it means this browser cannot do this at
 * all, not that one request happened to fail.
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
  // Not a connectivity problem in practice. A Chromium build without Google's
  // speech key fails this way on every attempt, and the reader is plainly
  // online -- they loaded the page. Telling them to check their connection
  // sends them off to debug something that is not broken.
  network: "Speech recognition isn't available in this browser. Chrome supports it — you can keep typing here.",
};

// Errors meaning "this browser will never do this", as opposed to "that
// attempt failed". The caller stops offering the microphone when one appears.
const FATAL = new Set(["network", "service-not-allowed"]);

/**
 * The standards-track availability check, where it exists. Strictly better than
 * testing for the constructor, which is true in browsers that cannot actually
 * recognise anything.
 * @returns {Promise<boolean>} false only when the browser says so explicitly.
 */
export async function probeListener() {
  if (!isListenerAvailable()) return false;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof Recognition.available !== "function") return true; // unknown; assume yes
  try {
    const state = await Recognition.available({ langs: [document.documentElement.lang || "en-US"] });
    // "downloadable" and "downloading" are still usable; only an explicit
    // "unavailable" rules it out.
    return state !== "unavailable";
  } catch {
    return true;
  }
}

/**
 * @param {{
 *   onInterim?: (text: string) => void,
 *   onFinal?: (text: string) => void,
 *   onStart?: () => void,
 *   onEnd?: () => void,
 *   onError?: (message: string, info: {code: string, fatal: boolean}) => void,
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
      onError?.(
        MESSAGES[event.error] || "Speech recognition failed.",
        { code: event.error, fatal: FATAL.has(event.error) },
      );
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
