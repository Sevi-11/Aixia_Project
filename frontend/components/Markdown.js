"use client";

import { sourceLabel } from "./sourceLabel";

/*
 * A small Markdown renderer covering exactly what the answer prompt asks the
 * model to produce (see backend/apps/rag/e_prompts.py): headings, nested
 * ordered/unordered lists, task lists, tables, fenced code, blockquotes, rules,
 * and inline emphasis/code/links — plus this app's own [n] citation markers.
 *
 * Rolled by hand rather than pulled from npm because the citation markers need
 * to become interactive buttons wired to the sources panel, and because this
 * renders MID-STREAM: every parser here has to cope with a half-written
 * document, so an unterminated fence or a table with no body row degrades to
 * something readable instead of throwing.
 */

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

export default function Markdown({ content, sources = [], onCiteClick }) {
  const lines = String(content ?? "").split(/\r?\n/);
  return <>{parseBlocks(lines, 0, lines.length, 0, { sources, onCiteClick })}</>;
}

function parseBlocks(lines, start, end, depth, ctx) {
  const out = [];
  let i = start;
  let key = 0;

  while (i < end) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      const body = [];
      i += 1;
      // An unclosed fence runs to the end — which is the normal state of
      // affairs while the answer is still streaming in.
      while (i < end && !(lines[i].match(FENCE) && lines[i].trim()[0] === marker)) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < end) i += 1;
      out.push(
        <pre key={key++} className="md-code">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const rule = line.match(RULE);
    if (rule) { out.push(<hr key={key++} className="md-rule" />); i += 1; continue; }

    const heading = line.match(HEADING);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      // Headings inside a chat bubble start at h3 — the page already owns h1
      // and h2, and a bubble is not a document outline.
      const Tag = `h${Math.min(level + 2, 6)}`;
      out.push(
        <Tag key={key++} className={`md-h md-h${level}`}>{inline(heading[2], ctx)}</Tag>,
      );
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body = [];
      while (i < end && QUOTE.test(lines[i])) {
        body.push(lines[i].match(QUOTE)[1]);
        i += 1;
      }
      out.push(
        <blockquote key={key++} className="md-quote">
          {parseBlocks(body, 0, body.length, depth + 1, ctx)}
        </blockquote>,
      );
      continue;
    }

    // A table needs a header row AND a divider; without the divider this is
    // just a paragraph that happens to contain pipes.
    if (TABLE_ROW.test(line) && i + 1 < end && TABLE_DIVIDER.test(lines[i + 1])) {
      const [table, next] = parseTable(lines, i, end, key++, ctx);
      out.push(table);
      i = next;
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const [list, next] = parseList(lines, i, end, indentOf(lines[i]), key++, ctx);
      out.push(list);
      i = next;
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const para = [];
    while (i < end && lines[i].trim() && !startsBlock(lines, i, end)) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) {
      out.push(<p key={key++}>{inline(para.join(" "), ctx)}</p>);
    } else {
      i += 1;   // defensive: never spin on a line nothing claimed
    }
  }

  return out;
}

function startsBlock(lines, i, end) {
  const line = lines[i];
  return Boolean(
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    (TABLE_ROW.test(line) && i + 1 < end && TABLE_DIVIDER.test(lines[i + 1])),
  );
}

function indentOf(line) {
  const m = line.match(BULLET) || line.match(ORDERED);
  return m ? m[1].length : 0;
}

function parseList(lines, start, end, indent, key, ctx) {
  const ordered = ORDERED.test(lines[start]) && !BULLET.test(lines[start]);
  const items = [];
  let i = start;

  while (i < end) {
    const line = lines[i];
    if (!line.trim()) {
      // A blank line only ends the list if what follows is not another item.
      const next = i + 1;
      if (next < end && (BULLET.test(lines[next]) || ORDERED.test(lines[next])) && indentOf(lines[next]) >= indent) {
        i = next;
        continue;
      }
      break;
    }

    const bullet = line.match(BULLET);
    const numbered = line.match(ORDERED);
    if (!bullet && !numbered) break;

    const itemIndent = indentOf(line);
    if (itemIndent < indent) break;

    if (itemIndent > indent) {
      const [nested, next] = parseList(lines, i, end, itemIndent, `n${i}`, ctx);
      if (items.length) items[items.length - 1].children.push(nested);
      else items.push({ text: "", children: [nested], task: null });
      i = next;
      continue;
    }

    const isOrdered = Boolean(numbered);
    if (isOrdered !== ordered) break;   // a different list starts here

    const text = isOrdered ? numbered[3] : bullet[2];
    const task = text.match(TASK);
    items.push({
      text: task ? task[2] : text,
      task: task ? task[1].toLowerCase() === "x" : null,
      children: [],
    });
    i += 1;
  }

  const Tag = ordered ? "ol" : "ul";
  const isTaskList = items.some((item) => item.task !== null);
  const start1 = ordered ? Number(lines[start].match(ORDERED)[2]) : undefined;

  return [
    <Tag key={key} className={isTaskList ? "md-list md-tasks" : "md-list"} start={start1 !== 1 ? start1 : undefined}>
      {items.map((item, index) => (
        <li key={index} className={item.task !== null ? "md-task" : undefined}>
          {item.task !== null && (
            <input type="checkbox" checked={item.task} readOnly tabIndex={-1} aria-hidden="true" />
          )}
          {item.text ? <span>{inline(item.text, ctx)}</span> : null}
          {item.children}
        </li>
      ))}
    </Tag>,
    i,
  ];
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseTable(lines, start, end, key, ctx) {
  const head = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });

  const rows = [];
  let i = start + 2;
  while (i < end && TABLE_ROW.test(lines[i]) && lines[i].trim()) {
    rows.push(splitRow(lines[i]));
    i += 1;
  }

  return [
    // Wide tables scroll inside the bubble rather than stretching it.
    <div key={key} className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>{head.map((cell, c) => (
            <th key={c} style={{ textAlign: aligns[c] || "left" }}>{inline(cell, ctx)}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {head.map((_, c) => (
                <td key={c} style={{ textAlign: aligns[c] || "left" }}>{inline(row[c] ?? "", ctx)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    i,
  ];
}

// Ordering matters: code spans are taken first so their contents are never
// re-parsed as emphasis, and links before [n] so "[text](url)" is not read as
// a citation followed by stray parentheses.
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~|\[[^\]]*\]\([^)\s]+\)|\[\d+\])/g;

function inline(text, ctx) {
  const parts = String(text).split(INLINE);
  return parts.map((part, index) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={index}>{inline(part.slice(2, -2), ctx)}</strong>;
    }
    if (part.startsWith("~~") && part.endsWith("~~")) {
      return <del key={index}>{inline(part.slice(2, -2), ctx)}</del>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={index}>{inline(part.slice(1, -1), ctx)}</em>;
    }

    const link = part.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = link[2];
      // Only http(s) and mailto survive; a javascript: URL from model output
      // must never become a live link.
      const safe = /^(https?:|mailto:)/i.test(href);
      if (!safe) return link[1];
      return (
        <a key={index} className="md-link" href={href} target="_blank" rel="noopener noreferrer nofollow">
          {link[1] || href}
        </a>
      );
    }

    const citation = part.match(/^\[(\d+)\]$/);
    if (citation) {
      const n = Number(citation[1]);
      const sources = ctx.sources || [];
      if (n < 1 || n > sources.length) return part;
      return (
        <button
          key={index}
          type="button"
          className="cite-ref"
          onClick={() => ctx.onCiteClick?.(n - 1)}
          title={`Source ${n}: ${sourceLabel(sources[n - 1])}`}
        >
          {n}
        </button>
      );
    }

    return part;
  });
}
