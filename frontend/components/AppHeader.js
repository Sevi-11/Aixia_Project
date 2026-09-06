"use client";

import { IconSwap, MoonIcon, SunIcon } from "./icons";

const STATUS_LABEL = {
  connecting: "Connecting to AIxia",
  online: "AIxia is online",
  offline: "AIxia is unreachable",
};

export default function AppHeader({ title, status, theme, onToggleTheme }) {
  return (
    <header className="app-header glass">
      <div className="header-left">
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
