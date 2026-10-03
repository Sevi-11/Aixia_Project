export function conversationMarkdown(chat) {
  const lines = [`# ${chat.title}`, "", `_Exported ${new Date().toLocaleString()}_`, ""];
  for (const message of chat.messages) {
    if (message.role === "user") lines.push(`## You`, "", message.content, "");
    else lines.push(`## AIxia`, "", message.content, "");
    if (message.sources?.length) {
      lines.push("**Sources**", "");
      message.sources.forEach((source, index) => {
        lines.push(`${index + 1}. ${source.original_filename}${Number.isInteger(source.page) ? ` · p.${source.page + 1}` : ""}`);
      });
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function downloadConversation(chat) {
  if (!chat?.messages.length) return;
  const blob = new Blob([conversationMarkdown(chat)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${chat.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "aixia-conversation"}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
