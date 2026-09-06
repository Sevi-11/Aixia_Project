"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, PaperclipIcon, PlusIcon, SendIcon } from "./icons";

const UPLOAD_URL = "/api/documents/upload/";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // Mirrors the backend's own ceiling.

export default function Composer({ value, onChange, onSend, onExport, disabled, canExport }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [attach, setAttach] = useState(null); // { state: 'busy'|'done'|'error', message }
  const textareaRef = useRef(null);
  const fileRef = useRef(null);

  // Close the quick-action menu on an outside click, the way the mockup does —
  // and on Escape, which the mockup leaves out but every menu owes a keyboard.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      textareaRef.current?.focus();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // The textarea is disabled while a stream runs, which blurs it (a disabled
  // control cannot hold focus). Restore focus the moment it re-enables, so the
  // next keystroke or Enter is not silently lost.
  const wasDisabled = useRef(false);
  useEffect(() => {
    if (wasDisabled.current && !disabled) textareaRef.current?.focus();
    wasDisabled.current = disabled;
  }, [disabled]);

  function handleInput(event) {
    onChange(event.target.value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 128)}px`;
  }

  function submit() {
    if (!value.trim() || disabled) return;
    onSend(value);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  async function uploadDocument(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setAttach({ state: "error", message: "Only PDF files can be added to the knowledge base." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setAttach({ state: "error", message: "That file is over the 20 MB limit." });
      return;
    }

    setAttach({ state: "busy", message: `Uploading ${file.name}…` });
    try {
      const body = new FormData();
      body.append("file", file);
      // Both endpoints are IsAdminUser: this succeeds only for a signed-in
      // owner. Anyone else gets a 403, which is the point -- a public visitor
      // must not be able to write into the shared vector index.
      const uploaded = await fetch(UPLOAD_URL, { method: "POST", body, credentials: "include" });
      if (uploaded.status === 401 || uploaded.status === 403) {
        setAttach({ state: "error", message: "Only the owner can add documents. Sign in to the Django admin first." });
        return;
      }
      if (!uploaded.ok) throw new Error(await readError(uploaded));

      const document = await uploaded.json();
      setAttach({ state: "busy", message: `Indexing ${file.name}…` });

      const ingested = await fetch(`/api/documents/${document.id}/ingest/`, { method: "POST", credentials: "include" });
      if (!ingested.ok) throw new Error(await readError(ingested));

      const result = await ingested.json();
      const chunks = result.chunks_created;
      setAttach({
        state: "done",
        message: chunks ? `${file.name} indexed — ${chunks} chunks searchable.` : `${file.name} was already indexed.`,
      });
    } catch (error) {
      setAttach({ state: "error", message: `Couldn't add that document. ${error.message}` });
    }
  }

  return (
    <div className="composer-dock">
      <div className="composer">
        <div className="composer-row">
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={`composer-icon${menuOpen ? " is-open" : ""}`}
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }}
            >
              <PlusIcon size={17} />
            </button>
            <div className={`quick-actions${menuOpen ? " open" : ""}`} onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}>
                <PaperclipIcon /> Attach a document
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); onExport(); }} disabled={!canExport}>
                <DownloadIcon /> Export this conversation
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                uploadDocument(file);
              }}
            />
          </div>

          <label htmlFor="composer-input" className="sr-only">Message Aixia</label>
          <textarea
            ref={textareaRef}
            id="composer-input"
            className="composer-input"
            rows="1"
            placeholder="Message Aixia…"
            value={value}
            disabled={disabled}
            onChange={handleInput}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
            }}
          />

          <button type="button" className="send-btn" onClick={submit} disabled={disabled || !value.trim()} aria-label="Send message">
            <SendIcon />
          </button>
        </div>

        {attach ? (
          <p className={`attach-status${attach.state === "error" ? " is-error" : ""}${attach.state === "done" ? " is-done" : ""}`} role="status">
            {attach.message}
          </p>
        ) : (
          <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
        )}
      </div>
    </div>
  );
}

async function readError(response) {
  try {
    const data = await response.json();
    return data.error || data.detail || `Server responded with ${response.status}`;
  } catch {
    return `Server responded with ${response.status}`;
  }
}
