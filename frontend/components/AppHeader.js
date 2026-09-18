"use client";

import { LotusIcon, LotusIconDark, MoonIcon, SpeakerOffIcon, SpeakerOnIcon, SunIcon } from "./icons";
import Xia from "./xia/Xia";

const STATUS_LABEL = {
  connecting: "Connecting to AIxia",
  online: "AIxia is online",
  offline: "AIxia is unreachable",
};

// Deliberately takes no `theme`. The active palette is only known on the
// client — the bootstrap in layout.js resolves it from storage before paint —
// so rendering anything from it here makes the server's HTML and the client's
// first render disagree, and React declines to patch attribute mismatches.
// The icon is driven from html[data-theme] in CSS instead, and the label is
// worded so it reads correctly in either state.
export default function AppHeader({ title, status, xiaState, mode, onSetMode, onToggleVoice, onToggleTheme, onOpenSidebar }) {
  return (
    <header className="app-header glass">
      <div className="header-left">
        {/* The sidebar has no visible collapsed state at any width — it is
            always an off-screen drawer until this is clicked — so this is the
            only way to reach conversation history, everywhere. */}
        <button type="button" className="header-menu" onClick={onOpenSidebar} aria-label="Open sidebar" title="Open sidebar">
          <span className="brand-mark" aria-hidden="true">
            <span className="icon-swap theme-icon">
              <LotusIcon />
              <LotusIconDark />
            </span>
          </span>
        </button>
        <Xia state={xiaState} />
        <div className="header-title">{title}</div>
      </div>
      <div className="header-right">
        <div className="mode-switch" role="group" aria-label="Answer mode">
          <button
            type="button"
            className={`mode-option${mode === "general" ? "" : " is-active"}`}
            aria-pressed={mode !== "general"}
            onClick={() => onSetMode("grounded")}
            title="Answers about Vince, grounded in his documents, with sources"
          >
            <span className="mode-long">About Vince</span>
            <span className="mode-short">Vince</span>
          </button>
          <button
            type="button"
            className={`mode-option${mode === "general" ? " is-active" : ""}`}
            aria-pressed={mode === "general"}
            onClick={() => onSetMode("general")}
            title="General questions. Not grounded in documents, and no sources."
          >
            <span className="mode-long">General</span>
            <span className="mode-short">Gen</span>
          </button>
        </div>
        <span className="status-pill" title={STATUS_LABEL[status]}>
          <span className={`status-dot ${status}`} aria-hidden="true" />
          <span className="status-label">AIxia</span>
          <span className="sr-only">{STATUS_LABEL[status]}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleVoice}
          title="Turn Xia's voice on or off"
          aria-label="Turn Xia's voice on or off"
        >
          <span className="icon-swap voice-icon" aria-hidden="true">
            <SpeakerOffIcon />
            <SpeakerOnIcon />
          </span>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title="Switch between light and dark"
          aria-label="Switch between light and dark theme"
        >
          <span className="icon-swap theme-icon" aria-hidden="true">
            <MoonIcon />
            <SunIcon />
          </span>
        </button>
      </div>
    </header>
  );
}
