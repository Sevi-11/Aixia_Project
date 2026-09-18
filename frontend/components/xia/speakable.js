"use client";

import {
  FENCE, HEADING, RULE, QUOTE, BULLET, ORDERED, TASK,
  TABLE_ROW, TABLE_DIVIDER, INLINE,
} from "../Markdown";

/*
 * Markdown -> something worth listening to.
 *
 * The answer prompt asks the model for rich Markdown (headings, lists, tables,
 * fences, citations), all of which is unbearable read aloud verbatim: a
 * synthesiser will happily pronounce "asterisk asterisk", "pipe", and the
 * number after every sentence that is really a footnote marker.
 *
 * This shares Markdown.js's own regexes rather than restating the grammar,
 * because the renderer builds JSX in a single pass and exposes no AST. If the
 * prompt starts emitting something new, both files learn about it together.
 */

// Sentence-ending punctuation makes a synthesiser pause. Block elements get one
// appended so a heading does not run headlong into the paragraph beneath it.
function asSentence(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?:;,]$/.test(trimmed) ? trimmed : trimmed + ".";
}

/** Strip inline markers, keep the words. */
export function speakableInline(text) {
  return String(text ?? "")
    .split(INLINE)
    .map((part) => {
      if (!part) return "";

      // A citation marker is a footnote, not a word. Reading "one" after every
      // other sentence is the single most irritating thing this can do.
      if (/^\[\d+\]$/.test(part)) return "";

      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return part.slice(1, -1);
      if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
        return speakableInline(part.slice(2, -2));
      }
      if (part.startsWith("~~") && part.endsWith("~~")) return speakableInline(part.slice(2, -2));
      if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
        return speakableInline(part.slice(1, -1));
      }

      // Speak a link's text, never its URL.
      const link = part.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (link) return link[1] || "";

      return part;
    })
    .join("")
    // Collapse the gaps left where citations were removed, and keep the space
    // before punctuation from surviving as " .".
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

/**
 * @param {string} markdown  A settled answer.
 * @returns {string} Plain prose for a speech synthesiser.
 */
export function speakableText(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Fenced code is skipped outright. There is no reading of a shell command
    // that is pleasant, and the text is on screen regardless.
    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      i += 1;
      while (i < lines.length && !(lines[i].match(FENCE) && lines[i].trim()[0] === marker)) i += 1;
      if (i < lines.length) i += 1;
      continue;
    }

    // A horizontal rule is punctuation for the eye only.
    if (RULE.test(line)) { i += 1; continue; }

    // Divider rows carry no content; body rows are read cell by cell. Tables
    // are the weakest thing here, but dropping them loses real answer content.
    if (TABLE_ROW.test(line)) {
      if (!TABLE_DIVIDER.test(line)) {
        const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|")
          .map((c) => speakableInline(c)).filter(Boolean);
        if (cells.length) out.push(asSentence(cells.join(", ")));
      }
      i += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) { out.push(asSentence(speakableInline(heading[2]))); i += 1; continue; }

    const quote = line.match(QUOTE);
    if (quote) { out.push(asSentence(speakableInline(quote[1]))); i += 1; continue; }

    const ordered = line.match(ORDERED);
    if (ordered) { out.push(asSentence(speakableInline(ordered[3]))); i += 1; continue; }

    const bullet = line.match(BULLET);
    if (bullet) {
      // A task list is a bullet whose content opens with [ ] or [x]; the box
      // is state, not something to pronounce.
      const task = bullet[2].match(TASK);
      out.push(asSentence(speakableInline(task ? task[2] : bullet[2])));
      i += 1;
      continue;
    }

    out.push(asSentence(speakableInline(line)));
    i += 1;
  }

  return out.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
