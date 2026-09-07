"use client";

import { MoonIcon, SunIcon } from "./icons";

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
export default function AppHeader({ title, status, onToggleTheme, onOpenSidebar }) {
  return (
    <header className="app-header glass">
      <div className="header-left">
        {/* Below 47.5rem there is no rail to hold the logo, so it lives here
            and is the only way to reach conversation history. CSS hides it at
            wider sizes, where the rail owns that job. */}
        <button type="button" className="header-menu" onClick={onOpenSidebar} aria-label="Open sidebar" title="Open sidebar">
          <span className="brand-mark" aria-hidden="true">Æ</span>
        </button>
        <div className="header-title">{title}</div>
      </div>
      <div className="header-right">
        <span className="status-pill" title={STATUS_LABEL[status]}>
          <span className={`status-dot ${status}`} aria-hidden="true" />
          <span className="status-label">AIxia</span>
          <span className="sr-only">{STATUS_LABEL[status]}</span>
        </span>
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
