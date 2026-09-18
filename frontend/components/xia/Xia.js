"use client";

/**
 * Xia — AIxia's presence, as an abstract form rather than a character.
 *
 * Deliberately not a face. A mascot would undercut the grounded, sober tone
 * the rest of the UI works for, and a face demands lip-sync, which browser
 * `speechSynthesis` cannot supply (its audio is not routable into Web Audio,
 * and its `boundary` event is unreliable outside Chrome). An abstract figure
 * needs only to register the four states, which CSS can do alone.
 *
 * Takes no `theme`, for the same reason AppHeader does not: the palette is
 * resolved on the client before paint, so markup derived from it disagrees
 * with the server's HTML. Every colour here comes from --accent, which the
 * palettes redefine.
 */
export default function Xia({ state }) {
  return (
    <span className="xia" data-state={state} aria-hidden="true">
      <svg className="xia-figure" viewBox="0 0 64 64">
        {/* Only visible while listening: two staggered rings travelling
            outward, the visual shorthand for a live microphone. */}
        <circle className="xia-ripple xia-ripple-a" cx="32" cy="32" r="22" />
        <circle className="xia-ripple xia-ripple-b" cx="32" cy="32" r="22" />

        {/* The steady body of the figure. Breathes when idle. */}
        <circle className="xia-ring" cx="32" cy="32" r="22" />

        {/* Two opposed arc segments, cut from one circle by the dash pattern
            in globals.css. They orbit while thinking and are still otherwise. */}
        <circle className="xia-arc" cx="32" cy="32" r="28" />

        {/* The core carries the speaking pulse. */}
        <circle className="xia-core" cx="32" cy="32" r="8" />
      </svg>
    </span>
  );
}
