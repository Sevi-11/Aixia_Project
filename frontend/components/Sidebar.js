"use client";

import { useState } from "react";
import { ChevronLeftIcon, LotusIcon, LotusIconDark, PencilIcon, PlusIcon, TrashIcon } from "./icons";

export default function Sidebar({
  chats,
  activeChatId,
  collapsed,
  onToggleCollapse,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
}) {
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");

  function startRenaming(chat) {
    setRenamingChatId(chat.id);
    setRenameDraft(chat.title);
  }

  function commitRename() {
    const chatId = renamingChatId;
    setRenamingChatId(null);
    if (chatId == null) return;
    const trimmed = renameDraft.trim();
    if (trimmed) onRenameChat(chatId, trimmed);
  }

  return (
    <aside className="sidebar glass" aria-label="Conversations">
      {/* The drawer is only ever visible expanded — collapsed, it is off-screen
          entirely (see .sidebar in globals.css) — so there is no "collapsed
          logo doubles as the expand button" state to design for any more.
          Opening it is the header lotus's job now (mirrors mobile, extended
          to every width); this brand is a plain label, and only the chevron
          beside it closes the drawer. */}
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span className="icon-swap theme-icon">
              <LotusIcon />
              <LotusIconDark />
            </span>
          </span>
          <span className="brand-word hide-on-collapse">AIxia</span>
        </div>
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggleCollapse}
          tabIndex={collapsed ? -1 : 0}
          aria-hidden={collapsed}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <ChevronLeftIcon />
        </button>
      </div>

      <button type="button" className="new-chat-btn" onClick={onNewChat} title="New conversation">
        <PlusIcon />
        <span className="hide-on-collapse">New conversation</span>
      </button>

      <div className="nav-group hide-on-collapse">
        <div className="eyebrow">History</div>
        <div className="history-list">
          {chats.map((chat) => (
            <div key={chat.id} className={`history-row${chat.id === activeChatId ? " active" : ""}`}>
              {chat.id === renamingChatId ? (
                <input
                  autoFocus
                  className="history-rename"
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); commitRename(); }
                    else if (event.key === "Escape") { event.preventDefault(); setRenamingChatId(null); }
                  }}
                  aria-label={`Rename ${chat.title}`}
                />
              ) : (
                <>
                  <button type="button" className="history-item" onClick={() => onSelectChat(chat.id)} title={chat.title}>
                    <span className="history-dot" aria-hidden="true" />
                    <span className="history-label">{chat.title}</span>
                  </button>
                  <button type="button" className="history-action" onClick={() => startRenaming(chat)} aria-label={`Rename ${chat.title}`} title="Rename">
                    <PencilIcon />
                  </button>
                  <button type="button" className="history-action danger" onClick={() => onDeleteChat(chat.id)} aria-label={`Delete ${chat.title}`} title="Delete">
                    <TrashIcon />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="sidebar-note">History persists locally. Nothing leaves this device.</p>
      </div>

      <div className="sidebar-footer">
        <div className="avatar" aria-hidden="true">SV</div>
        <div className="hide-on-collapse" style={{ overflow: "hidden" }}>
          <div style={{ font: "600 0.78rem/1.2 var(--friendly)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Vince</div>
          <div style={{ font: "500 0.65rem/1.2 var(--friendly)", color: "var(--text-muted)" }}>Owner</div>
        </div>
      </div>
    </aside>
  );
}
