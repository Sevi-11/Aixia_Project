# Aixia voice lotus

The voice-chat symbol. Same lotus as `branding/AIxia-Logo/icon/icon.svg` — the five
petal paths, the gold seed and the water line are copied verbatim, not redrawn.

What is new is the **pivot**. Every petal rotates about the base anchor `100,148`,
so the bloom opens like a hand instead of spinning like a loader. A rooted flower
that spins stops reading as rooted, and spinning is also what makes every other
voice orb look like a progress indicator.

Canvas (live, all six states animating): the "Aixia Voice Lotus" artifact in
claude.ai → Artifacts.

## Files

| File | What it is |
|---|---|
| `voice-lotus.svg` | The mark, ready to inline. Fills are CSS custom properties so light/dark works without a second file. |
| `voice-lotus.css` | The motion system. Six state classes, reduced-motion fallbacks, the reduced small-size form. |
| `canvas/*.dc.html` | Design source for the canvas artboards. **Not runnable** — Design Component format, needs the artifact host's `support.js`. Reference only; they are the spec drawings, not shippable code. |
| `canvas/canvas.json` | Artboard layout index for the same. |

## Using it

Inline the SVG (don't `<img>` it — the CSS has to reach inside), then swap one class:

```jsx
<svg className={`aixia-lotus is-${state}`} viewBox="0 0 200 200" aria-hidden="true">
```

States: `is-idle` · `is-listening` · `is-thinking` · `is-speaking` · `is-trouble` · `is-muted`

**One class at a time, always.** Overlapping animations are what make voice orbs
read as broken. If the mic reopens mid-playback (barge-in), speaking yields to
listening in a single 420ms transition — it does not layer.

## The geometry contract

- **Anchor `100,148`** — every petal's `transform-origin`. Nothing else.
- **Travel ratio `1 · 0.55 · 0`** (outer / mid / centre), carried per-petal as `--m`.
  The centre petal holding still is what keeps the silhouette legible at full
  amplitude; drop this and the mark dissolves into a blob when it moves.
- **Seed at `100,144`** — the only element on its own origin. It carries voice
  level and turn-taking, and it is the one part that must never be removed at
  small sizes.
- **Water line at `y 172`** — ripples when listening, flattens when muted or in
  trouble, drops out entirely below 24px.

Per-element custom properties in the SVG: `--d` direction (−1/0/+1), `--m` tier
travel, `--s` stagger index, `--r` scattered phase index (so the speaking state
does not pump in unison).

## Wiring the speaking state to real audio

`is-speaking` reads `--amp` (0..1) directly off the element. No per-petal JS, no
re-render — one custom property drives five composited transforms.

```js
const ctx      = new AudioContext();
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;
ctx.createMediaElementSource(audioEl).connect(analyser);
analyser.connect(ctx.destination);

const buf = new Uint8Array(analyser.frequencyBinCount);
let amp = 0;

function frame() {
  analyser.getByteTimeDomainData(buf);
  let s = 0;
  for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
  const target = Math.min(1, Math.sqrt(s / buf.length) * 3.2);   // clamp in JS, not CSS

  // Fast attack, slow release. Symmetric smoothing makes the bloom
  // flicker on consonants — this asymmetry is the whole trick.
  amp += (target - amp) * (target > amp ? 0.45 : 0.12);

  markEl.style.setProperty('--amp', amp.toFixed(3));
  raf = requestAnimationFrame(frame);
}
```

Cancel the rAF when leaving `is-speaking` and reset `--amp` to `0`.

Until the analyser is wired, add `.no-audio` alongside `.is-speaking` for a canned
cycle that looks right in a mockup.

Clamp to 1 in JS, never in CSS — a hot mic would otherwise push the bloom past
its viewBox.

## Timing

| State | What moves | Cycle |
|---|---|---|
| Idle | bloom scale 1 → 1.04, seed opacity .70 → 1 | 4200ms |
| Listening | splay 5° → 10° staggered 140ms; ripples scale .28 → 1.4, 800ms apart | 2800 / 2400ms |
| Thinking | opacity sweep .34 → 1 per petal 280ms apart; bloom sway ±2.6° | 1700 / 3400ms |
| Speaking | `--amp` → splay 0 → 14°, scale 1 → 1.16; seed .90 → 1.24 | rAF |
| Trouble | contract 1 → 0.90, opacity .95 → .55, water flattens | 1700ms |
| Muted | static fold −8° × tier, scale .86, seed hollow | — |
| Any → any | transform / fill cross-fade | 420ms |

Easings reuse `globals.css`: `--ease cubic-bezier(.22, 1, .36, 1)` for state work,
`cubic-bezier(.45, 0, .55, 1)` for the breathing loops.

## Colour

Light mode uses `icon.svg`; dark mode uses `icon-light.svg` (the variant drawn
*for* dark backgrounds). The CSS mirrors the `globals.css` contract exactly —
`prefers-color-scheme` guarded by `:root:not([data-theme="light"])`, plus an
explicit `:root[data-theme="dark"]` branch.

Indigo `#6E76F0` stays the UI accent and never enters the mark. Trouble borrows
`--error #B5544A` and `--warning #C98A4B`.

## Size ramp

Full mark down to 32px. At 24px and below add `.is-reduced`: the water line and
the outer tier drop out, and the seed grows to `r 16`. The seed never goes — it
is the recognition cue.

## Accessibility

- The SVG is `aria-hidden`. State is announced from the text chip beside it with
  `aria-live="polite"` — an animated graphic is not a status message.
- `prefers-reduced-motion` collapses every loop to the static pose at the top of
  its cycle. The state still reads; nothing oscillates.
- Trouble is never shown alone. The mark cannot carry *why* something failed.

## Known caveats

- The flattened water line is a **second path** (`.water-flat`), toggled by
  opacity, rather than a CSS `d: path()` swap — `d:` is unsupported in Safari.
- `r: 16` on `.is-reduced .seed` is a CSS geometry property; supported in current
  Chrome, Firefox and Safari, but if you target older WebKit set the radius in
  markup instead.
- `canvas/*.dc.html` will not render outside the artifact host. Read them, don't
  build them.
