"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons";
import { sourceLabel } from "./sourceLabel";

export default function SourcesPanel({ open, sources, highlightedIndex, onClose }) {
  const bodyRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || highlightedIndex == null) return;
    bodyRef.current
      ?.querySelector(`[data-source-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open, highlightedIndex, sources]);

  return (
    <>
      <button
        type="button"
        className={`sources-overlay${open ? " open" : ""}`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        aria-label="Close sources"
      />
      <aside
        className={`sources-panel${open ? " open" : ""}`}
        aria-label="Sources"
        aria-hidden={!open}
        // Everything inside is off-screen when closed; without this it stays in
        // the tab order and Tab walks into an invisible panel.
        inert={!open}
      >
        <div className="sources-head">
          <h3>Sources</h3>
          <button type="button" ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close sources">
            <CloseIcon />
          </button>
        </div>
        <div className="sources-body" ref={bodyRef}>
          {sources.length === 0 ? (
            <p className="sources-empty">No sources were retrieved for this answer.</p>
          ) : (
            sources.map((source, index) => (
              <div
                key={index}
                data-source-index={index}
                className={`source-card${index === highlightedIndex ? " is-highlighted" : ""}`}
              >
                <div className="source-card-head">
                  <span className="source-card-title">📄 {sourceLabel(source)}</span>
                  <span className="source-index">[{index + 1}]</span>
                </div>
                <p className="source-card-excerpt">{source.content}</p>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
