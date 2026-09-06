"use client";

import { useState } from "react";
import { ChevronLeftIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

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
      <div className="sidebar-head">
        {/* Collapsed, the logo IS the expand control — a rail this narrow has
            no room for a second button, and the mark is the obvious thing to
            reach for. Expanded, it is just the wordmark and the chevron next
            to it does the collapsing. */}
        {collapsed ? (
          <button
            type="button"
            className="brand is-expander"
            onClick={onToggleCollapse}
            aria-expanded={false}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <span className="brand-mark" aria-hidden="true">Æ</span>
          </button>
        ) : (
          <>
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">Æ</span>
              <span className="hide-on-collapse">AIxia</span>
            </div>
            <button
              type="button"
              className="rail-toggle"
              onClick={onToggleCollapse}
              aria-expanded
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeftIcon />
            </button>
          </>
        )}
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
