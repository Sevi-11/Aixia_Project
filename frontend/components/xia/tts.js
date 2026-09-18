"use client";

/*
 * Xia's voice.
 *
 * Everything outside this file talks to `createSpeaker()` and nothing else, so
 * swapping browser synthesis for Kokoro-82M (in-browser, WebGPU) or a hosted
 * API later is a change to this file alone.
 *
 * Why the browser's own synthesiser first: it is free, needs no backend, no
 * network round trip and no cold start -- which matters on a Render free
 * instance that sleeps. The cost is that it sounds robotic and the voice
 * differs per platform.
 *
 * Note for whoever adds lip-sync: you cannot. `speechSynthesis` renders
 * straight to the audio device and its output is not routable into Web Audio,
 * so there is no amplitude envelope to read, and the `boundary` event is
 * unreliable outside Chrome and absent for remote voices. This is exactly why
 * Xia is an abstract form: she needs onstart/onend, not visemes. A future
 * engine that hands back an AudioBuffer would make an AnalyserNode possible.
 */

// How long to let the engine pick an utterance up before the watchdog is
// allowed to conclude that nothing is playing.
const GRACE_MS = 1200;

function isAvailable() {
  return typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance === "function";
}

// Chrome drops the tail of any utterance running longer than roughly fifteen
// seconds. Queuing several short utterances instead of one long one is the
// standard way around it, and it costs nothing on engines without the bug.
//
// SOFT is where a break is preferred; HARD is the point past which one is
// forced. The gap between them exists so that keeping a sentence intact can
// win over hitting the target length exactly. Fifteen seconds is roughly 225
// characters at a default rate, so HARD stays comfortably inside it.
const SOFT_LIMIT = 180;
const HARD_LIMIT = 260;

/**
 * Split into sentences, then repair the splits that were not sentence ends.
 *
 * Breaking on /[.!?]/ cuts "Highly Succeed Inc., where he..." in half, because
 * the period belongs to an abbreviation. Rather than keep a list of them --
 * Inc., Ltd., Dr., Ph.D., St., U.S. and every one nobody thought of -- a
 * fragment that OPENS with punctuation or a lowercase word is treated as a
 * continuation of the fragment before it. A real sentence does not start that
 * way, and an abbreviation's tail always does.
 */
function sentences(text) {
  const raw = String(text ?? "").match(/[^.!?]+[.!?]*\s*/g) || [];
  const out = [];
  for (const fragment of raw) {
    const isContinuation = /^\s*[,;:)\]]/.test(fragment) || /^\s*[a-z]/.test(fragment);
    if (out.length && isContinuation && (out[out.length - 1] + fragment).length <= HARD_LIMIT) {
      out[out.length - 1] += fragment;
    } else {
      out.push(fragment);
    }
  }
  return out;
}

/** Pack sentences into utterance-sized chunks. */
export function chunkForSpeech(text) {
  const chunks = [];
  let buffer = "";
  const flush = () => { if (buffer.trim()) chunks.push(buffer.trim()); buffer = ""; };

  for (const sentence of sentences(text)) {
    if (sentence.length > HARD_LIMIT) {
      flush();
      // One sentence past the hard limit (a long list rendered as a single
      // line) is split on word boundaries rather than mid-word.
      let rest = sentence.trim();
      while (rest.length > HARD_LIMIT) {
        let cut = rest.lastIndexOf(" ", SOFT_LIMIT);
        if (cut <= 0) cut = SOFT_LIMIT;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      buffer = rest;
      continue;
    }
    if (buffer && (buffer + sentence).length > SOFT_LIMIT) flush();
    buffer += sentence;
  }
  flush();
  return chunks;
}

/**
 * Resolve the voice list. getVoices() is empty on first call in Chrome and
 * fills in asynchronously; selecting a voice before then silently yields the
 * platform default for the first utterance only, which reads as Xia changing
 * her voice one sentence in.
 */
function whenVoicesReady(synth) {
  const voices = synth.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    // Some engines never fire the event at all.
    setTimeout(done, 1200);
  });
}

function pickVoice(voices) {
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = english.length ? english : voices;
  // Prefer a local voice: a remote one needs the network, adds latency, and is
  // the case where `boundary` events go missing entirely.
  return pool.find((v) => v.localService) || pool[0] || null;
}

/**
 * @param {{ onStart?: () => void, onEnd?: () => void }} handlers
 */
export function createSpeaker({ onStart, onEnd } = {}) {
  const synth = isAvailable() ? window.speechSynthesis : null;
  let voice = null;
  // Rises on every speak()/cancel(); a queue from a superseded call checks it
  // and bails, so a stale utterance can never fire onEnd for the current one.
  let generation = 0;
  let speaking = false;

  return {
    isAvailable,

    /** Speak `text`, replacing anything currently queued. Resolves on finish. */
    async speak(text) {
      if (!synth) return false;
      const spoken = String(text ?? "").trim();
      if (!spoken) return false;

      const mine = ++generation;
      synth.cancel();

      if (!voice) voice = pickVoice(await whenVoicesReady(synth));
      if (mine !== generation) return false;

      const chunks = chunkForSpeech(spoken);
      if (!chunks.length) return false;

      speaking = true;
      onStart?.();

      try {
        for (const chunk of chunks) {
          if (mine !== generation) return false;
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearInterval(watchdog);
              resolve();
            };

            const utterance = new window.SpeechSynthesisUtterance(chunk);
            if (voice) utterance.voice = voice;
            utterance.rate = 1;
            utterance.pitch = 1;
            // `error` fires on cancel() too, so both paths just finish and let
            // the generation check above decide whether to keep going.
            utterance.onend = finish;
            utterance.onerror = finish;
            synth.speak(utterance);

            // Some engines never fire `end` at all -- no audio device, output
            // muted at the OS level, or the synthesiser simply dropping the
            // utterance. Waiting on an event that is not coming leaves the
            // caller believing she is still speaking for the rest of the
            // session, so the queue also watches the engine itself: once it
            // reports nothing speaking and nothing pending, this chunk is over.
            // The grace period is there because `speaking` is briefly false in
            // the moment between speak() and the engine picking the utterance up.
            const startedAt = Date.now();
            const watchdog = setInterval(() => {
              if (Date.now() - startedAt < GRACE_MS) return;
              if (!synth.speaking && !synth.pending) finish();
            }, 250);
          });
        }
      } finally {
        if (mine === generation) {
          speaking = false;
          onEnd?.();
        }
      }
      return true;
    },

    /** Stop immediately. Fires onEnd if something was in flight. */
    cancel() {
      if (!synth) return;
      const wasSpeaking = speaking;
      generation += 1;
      speaking = false;
      synth.cancel();
      if (wasSpeaking) onEnd?.();
    },

    get speaking() {
      return speaking;
    },
  };
}
