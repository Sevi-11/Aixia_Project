"use client";

import { useEffect, useRef, useState } from "react";
import ThinkingBubble from "./ThinkingBubble";
import { CheckIcon, CopyIcon, RegenerateIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

export function sourceLabel(source) {
  const name = source?.original_filename || "source";
  // page comes off the PDF loader 0-based; readers count from 1.
  return Number.isInteger(source?.page) ? `${name} · p.${source.page + 1}` : name;
}

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
    return () => observer.disconnect();
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
            <MessageContent content={message.content} sources={sources} onCiteClick={onOpenSources} />
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
              {copied ? <CheckIcon /> : <CopyIcon />}
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

function MessageContent({ content, sources, onCiteClick }) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      const items = [];
      const ordered = Boolean(numbered);
      while (index < lines.length) {
        const match = lines[index].match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(<li key={index}>{formatInline(match[1], sources, onCiteClick)}</li>);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`}>{items}</List>);
      continue;
    }

    if (line.trim()) blocks.push(<p key={`paragraph-${index}`}>{formatInline(line, sources, onCiteClick)}</p>);
    index += 1;
  }

  return <>{blocks}</>;
}

function formatInline(text, sources = [], onCiteClick) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[\d+\])/g);
  return parts.map((part, index) => {
    if (/^\*\*.*\*\*$/.test(part) || /^__.*__$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*.*\*$/.test(part) || /^_.*_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^`.*`$/.test(part)) return <code key={index}>{part.slice(1, -1)}</code>;
    const citation = part.match(/^\[(\d+)\]$/);
    if (citation) {
      const n = Number(citation[1]);
      if (n < 1 || n > sources.length) return part;
      return (
        <button key={index} type="button" className="cite-ref" onClick={() => onCiteClick?.(n - 1)} title={`Source ${n}: ${sourceLabel(sources[n - 1])}`}>
          {n}
        </button>
      );
    }
    return part;
  });
}
