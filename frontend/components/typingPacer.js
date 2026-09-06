// Groq returns tokens in lumps — a few words land at once, then nothing for a
// beat, then a burst. Painting each lump the moment it arrives is what makes
// the reply feel snappy and jerky: the text jumps rather than types.
//
// The pacer decouples "text arrived" from "text is shown". Tokens go into a
// buffer; a timer drains it at a steady character rate, so however lumpy the
// network is, the reader sees an even stream.

const TICK_MS = 30;

// Comfortable reading-ish pace for the common case, where the model is barely
// ahead of the reveal.
const BASE_CPS = 70;

// ...but never fall further behind the model than this. A long answer arrives
// far faster than 70 c/s, so the rate scales up to empty the buffer within
// this window, measured from the most recent arrival.
//
// The rate is derived from a DEADLINE, not from the current backlog. Sizing it
// as `pending / WINDOW` looks equivalent but is exponential decay: as the
// buffer shrinks the rate shrinks with it, so it only ever approaches the base
// rate asymptotically and a 3000-character answer took 7.6s to drain instead
// of 2. Dividing by the time actually remaining lands it on zero on schedule,
// and behaves as smooth proportional control while tokens are still arriving.
const MAX_LAG_SECONDS = 2;

// The thinking bubble should register as a beat, not a flicker. If the first
// token comes back almost instantly, hold the dots briefly anyway.
const MIN_THINKING_MS = 450;

export function createTypingPacer({ onReveal, onSettled, now = () => performance.now() }) {
  let pending = "";
  let closed = false;
  let settled = false;
  let timer = null;
  let lastTick = 0;
  // Slides forward with every arrival; after the last one it is a firm
  // deadline for emptying whatever is left.
  let drainBy = 0;
  const startedAt = now();
  let resolveSettled;
  const settledPromise = new Promise((resolve) => { resolveSettled = resolve; });

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function settle() {
    if (settled) return;
    settled = true;
    stopTimer();
    onSettled?.();
    resolveSettled();
  }

  function tick() {
    const at = now();

    if (at - startedAt < MIN_THINKING_MS) return;

    // Elapsed-time based rather than a fixed chunk per tick: background tabs
    // throttle timers to once a second, and this way that just means one
    // larger chunk instead of a reply that never finishes.
    const dt = Math.min((at - lastTick) / 1000, 0.25);
    lastTick = at;

    if (pending.length) {
      const secondsLeft = Math.max(0.05, (drainBy - at) / 1000);
      const cps = Math.max(BASE_CPS, pending.length / secondsLeft);
      const take = Math.max(1, Math.round(cps * dt));
      const chunk = pending.slice(0, take);
      pending = pending.slice(take);
      onReveal(chunk);
    }

    if (!pending.length && closed) settle();
  }

  function ensureRunning() {
    if (timer === null && !settled) {
      lastTick = now();
      timer = setInterval(tick, TICK_MS);
    }
  }

  return {
    /** Queue newly arrived text for reveal. */
    push(text) {
      if (!text || settled) return;
      pending += text;
      drainBy = Math.max(drainBy, now() + MAX_LAG_SECONDS * 1000);
      ensureRunning();
    },

    /** No more text is coming; settle once the buffer has drained. */
    close() {
      closed = true;
      if (!pending.length) settle();
      else ensureRunning();
    },

    /** Abandon pacing and show everything at once (errors, teardown). */
    flush() {
      const rest = pending;
      pending = "";
      closed = true;
      if (rest) onReveal(rest);
      settle();
    },

    /** Resolves when the buffer is empty and onSettled has run. */
    whenSettled() {
      return settledPromise;
    },
  };
}
