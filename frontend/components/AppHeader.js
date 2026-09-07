"use client";

import { IconSwap, MoonIcon, SunIcon } from "./icons";

const STATUS_LABEL = {
  connecting: "Connecting to AIxia",
  online: "AIxia is online",
  offline: "AIxia is unreachable",
};

export default function AppHeader({ title, status, theme, onToggleTheme, onOpenSidebar }) {
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
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <IconSwap alt={theme === "dark"}>
            <MoonIcon />
            <SunIcon />
          </IconSwap>
        </button>
      </div>
    </header>
  );
}
