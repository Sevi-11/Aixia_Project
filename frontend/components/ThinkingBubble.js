"use client";

import { useEffect, useRef, useState } from "react";

// The mockup's phrase list, verbatim. The rotation is the only personality the
// wait has, so it keeps the mockup's exact cadence too: a 160ms fade out, swap,
// fade back in, every 950ms.
const THINKING_PHRASES = [
  "Consulting Archives", "Checking Lore", "Digging Deeper", "Looking Closer",
  "Letting It Cook", "Putting Together", "Connecting Things", "Recalling Vince",
  "Scanning Lore", "Accessing Archives", "Tracing Threads", "Connecting Dots",
  "Following Leads", "Finding Context", "Decoding Vince",
];

const ROTATE_MS = 950;
const SWAP_MS = 160;

export default function ThinkingBubble() {
  // Where in the list this particular wait starts, so two answers in a row do
  // not open with the same phrase. Randomizing in a lazy initializer is safe
  // here because this bubble only ever mounts client-side — it appears once a
  // stream is already in flight, and the server always renders an empty thread.
  const [offset] = useState(() => Math.floor(Math.random() * THINKING_PHRASES.length));
  const [step, setStep] = useState(0);
  const [swapping, setSwapping] = useState(false);
  const swapTimer = useRef(null);

  useEffect(() => {
    const rotate = setInterval(() => {
      setSwapping(true);
      swapTimer.current = setTimeout(() => {
        setStep((current) => current + 1);
        setSwapping(false);
      }, SWAP_MS);
    }, ROTATE_MS);

    return () => {
      clearInterval(rotate);
      clearTimeout(swapTimer.current);
    };
  }, []);

  const phrase = THINKING_PHRASES[(offset + step) % THINKING_PHRASES.length];

  return (
    <div className="typing-bubble" role="status" aria-live="polite">
      <span className={`typing-text${swapping ? " swap" : ""}`}>{phrase}</span>
      <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
    </div>
  );
}
