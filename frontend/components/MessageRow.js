"use client";

import { useEffect, useRef, useState } from "react";
import ThinkingBubble from "./ThinkingBubble";
import Markdown from "./Markdown";
import { sourceLabel } from "./sourceLabel";
import { CheckIcon, CopyIcon, IconSwap, RegenerateIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";


export default function MessageRow({
  message,
  isLast,
  onOpenSources,
  onRegenerate,
  onFeedback,
  onSuggestionClick,
}) {
  const isUser = message.role === "user";
  const isError = message.role === "error";
  const isStreaming = Boolean(message.streaming);
  const sources = message.sources || [];
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const rowRef = useRef(null);

  // The mockup reveals each row as it enters the thread; an IntersectionObserver
  // covers both cases in one path — a row appended at the bottom is already in
  // view and fires immediately, an older row fades in when scrolled to.
  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.15 },
    );
    observer.observe(node);
    // The reveal starts at opacity 0, so anything that stops the observer from
    // reporting leaves the message permanently invisible — a backgrounded tab,
    // a prerender, a browser that never schedules the callback. Falling open
    // after a beat costs a scroll-reveal on rows nobody is looking at and
    // guarantees the answer is never lost behind a stalled animation.
    const fallback = setTimeout(() => setVisible(true), 600);
    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the copy button simply has no effect.
    }
  }

  const showThinking = isStreaming && !message.content;

  return (
    <div ref={rowRef} className={`msg-row ${isUser ? "user" : "ai"} reveal${visible ? " is-visible" : ""}`}>
      {!isUser && <div className="msg-avatar" aria-hidden="true">Æ</div>}
      <div className="bubble-stack">
        {showThinking ? (
          <ThinkingBubble />
        ) : (
          <div className={`bubble${isError ? " is-error" : ""}`}>
            <Markdown content={message.content} sources={sources} onCiteClick={onOpenSources} />
            {isStreaming && <span className="stream-caret" aria-hidden="true" />}
          </div>
        )}

        {!isUser && !showThinking && sources.length > 0 && (
          <div className="citation-row">
            {sources.map((source, index) => (
              <button
                key={index}
                type="button"
                className="citation-pill"
                onClick={() => onOpenSources(index)}
                title={`Open source ${index + 1}: ${sourceLabel(source)}`}
              >
                <span aria-hidden="true">📄</span>
                <span>{sourceLabel(source)}</span>
              </button>
            ))}
          </div>
        )}

        {!isUser && !isStreaming && !showThinking && (
          <div className="msg-actions">
            <button type="button" className="msg-action" onClick={handleCopy} aria-label="Copy response" title={copied ? "Copied" : "Copy"}>
              <IconSwap alt={copied}>
                <CopyIcon />
                <CheckIcon />
              </IconSwap>
            </button>
            {isLast && !isError && (
              <button type="button" className="msg-action" onClick={onRegenerate} aria-label="Regenerate response" title="Regenerate">
                <RegenerateIcon />
              </button>
            )}
            {!isError && (
              <>
                <button
                  type="button"
                  className={`msg-action${message.feedback === "up" ? " is-on" : ""}`}
                  onClick={() => onFeedback("up")}
                  aria-pressed={message.feedback === "up"}
                  aria-label="Good response"
                  title="Good response"
                >
                  <ThumbUpIcon />
                </button>
                <button
                  type="button"
                  className={`msg-action danger${message.feedback === "down" ? " is-on" : ""}`}
                  onClick={() => onFeedback("down")}
                  aria-pressed={message.feedback === "down"}
                  aria-label="Bad response"
                  title="Bad response"
                >
                  <ThumbDownIcon />
                </button>
              </>
            )}
          </div>
        )}

        {!isUser && isLast && !isStreaming && message.suggestions?.length > 0 && (
          <div className="suggestion-row">
            {message.suggestions.map((suggestion, index) => (
              <button key={index} type="button" className="suggestion-chip" onClick={() => onSuggestionClick(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
