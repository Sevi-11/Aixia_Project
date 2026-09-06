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
      {/* Both controls stay mounted in both states. Swapping the brand between
          a button and a div — and mounting/unmounting the chevron — destroyed
          the very nodes the CSS was trying to transition, so the head popped no
          matter how the rail animated. Now only attributes and classes change,
          and the styles tween them.

          Collapsed, the logo IS the expand control; a rail this narrow has no
          room for a second button. Expanded, it is inert (disabled, so it also
          leaves the tab order) and the chevron beside it does the collapsing. */}
      <div className="sidebar-head">
        <button
          type="button"
          className={`brand${collapsed ? " is-expander" : ""}`}
          onClick={onToggleCollapse}
          disabled={!collapsed}
          aria-expanded={!collapsed}
          aria-label="Expand sidebar"
          title={collapsed ? "Expand sidebar" : undefined}
        >
          <span className="brand-mark" aria-hidden="true">Æ</span>
          <span className="brand-word hide-on-collapse">AIxia</span>
        </button>
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
