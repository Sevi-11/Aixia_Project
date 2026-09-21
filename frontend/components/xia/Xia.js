"use client";

/**
 * Xia — AIxia's presence, as an abstract form rather than a character.
 *
 * The voice lotus (branding/voice-lotus): the same five-petal bloom as the app
 * icon, pivoting on the base anchor 100,148 so it opens like a hand instead of
 * spinning like a loader. Motion lives entirely in globals.css; this component
 * only swaps a single `is-<state>` class.
 *
 * Six states: idle · listening · thinking · speaking · trouble · muted. One
 * class at a time — overlapping animations are what make voice orbs read as
 * broken. `speaking` gets `.no-audio` because browser speechSynthesis audio is
 * not routable into Web Audio, so the live --amp analyser can never be wired
 * here and the canned cycle is the honest fallback.
 *
 * Takes no `theme`: the palette is resolved on the client before paint, so
 * markup derived from it disagrees with the server's HTML. The --lotus-* tokens
 * flip on the same prefers-color-scheme / [data-theme] contract as globals.css.
 */
export default function Xia({ state, size }) {
  const cls = `aixia-lotus is-${state}${state === "speaking" ? " no-audio" : ""}`;
  return (
    <span className={`xia${size ? ` xia-${size}` : ""}`} aria-hidden="true">
      <svg className={cls} viewBox="0 0 200 200" focusable="false">
        <g className="bloom">
          {/* listening ripples; opacity 0 until .is-listening */}
          <path className="rip" d="M 42,172 Q 100,188 158,172" fill="none" stroke="var(--lotus-seed, #E8A93C)" strokeWidth="4" strokeLinecap="round" style={{ "--s": 0 }} />
          <path className="rip" d="M 42,172 Q 100,188 158,172" fill="none" stroke="var(--lotus-seed, #E8A93C)" strokeWidth="4" strokeLinecap="round" style={{ "--s": 1 }} />
          <path className="rip" d="M 42,172 Q 100,188 158,172" fill="none" stroke="var(--lotus-seed, #E8A93C)" strokeWidth="4" strokeLinecap="round" style={{ "--s": 2 }} />

          {/* outer tier */}
          <path className="pt t1" d="M 100.00,148.00 C 65.79,160.06 33.60,137.22 25.83,118.03 C 44.75,109.63 83.77,115.56 100.00,148.00 Z" fill="var(--lotus-o, #F0B49A)" style={{ "--d": -1, "--m": 1, "--s": 0, "--r": 0 }} />
          <path className="pt t1" d="M 100.00,148.00 C 116.23,115.56 155.25,109.63 174.17,118.03 C 166.40,137.22 134.21,160.06 100.00,148.00 Z" fill="var(--lotus-o, #F0B49A)" style={{ "--d": 1, "--m": 1, "--s": 1, "--r": 3 }} />

          {/* mid tier */}
          <path className="pt t2" d="M 100.00,148.00 C 54.84,138.27 38.62,92.47 45.20,66.75 C 71.51,70.28 107.90,102.48 100.00,148.00 Z" fill="var(--lotus-m, #E68A63)" style={{ "--d": -1, "--m": 0.55, "--s": 2, "--r": 5 }} />
          <path className="pt t2" d="M 100.00,148.00 C 92.10,102.48 128.49,70.28 154.80,66.75 C 161.38,92.47 145.16,138.27 100.00,148.00 Z" fill="var(--lotus-m, #E68A63)" style={{ "--d": 1, "--m": 0.55, "--s": 3, "--r": 1 }} />

          {/* centre petal: holds still, scales only — keeps the silhouette legible at full amplitude */}
          <path className="pt t3" d="M 100.00,148.00 C 62.00,109.92 76.44,56.16 100.00,36.00 C 123.56,56.16 138.00,109.92 100.00,148.00 Z" fill="var(--lotus-c, #D9663F)" style={{ "--d": 0, "--m": 0, "--s": 4, "--r": 4 }} />

          <circle className="seed" cx="100" cy="144" r="12" fill="var(--lotus-seed, #E8A93C)" />
          <path className="water" d="M 42,172 Q 100,188 158,172" fill="none" stroke="var(--lotus-water, #3B4657)" strokeWidth="5" strokeLinecap="round" />
          {/* flattened water for .is-trouble / .is-muted (CSS d: is unsupported in Safari) */}
          <path className="water-flat" d="M 42,174 L 158,174" fill="none" stroke="var(--lotus-water, #3B4657)" strokeWidth="5" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}
