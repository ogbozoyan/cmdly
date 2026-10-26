/**
 * Small Markdown renderer for the preview panel. Pure, no dependencies.
 * Raw HTML in the source is never passed through: every piece of text is escaped first,
 * then Markdown syntax is turned into a fixed set of tags.
 */
import { escapeHtml } from "../shared/escape.ts";

export interface MarkdownOptions {
  /** Render ![images] as <img>; otherwise only their alt text is shown. */
  remote?: boolean;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/** Markers that make multi-line text look like Markdown rather than prose. */
const MARKERS: RegExp[] = [
  /^#{1,6}\s+\S/m,
  /^\s*(?:[-*+]|\d+[.)])\s+\S/m,
  /^\s*```/m,
  /^\s*>\s?\S/m,
  /^\s*\|.+\|\s*$/m,
  /\[[^\]\n]+\]\([^)\s]+\)/,
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m,
];

export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t.includes("\n")) return false;
  if (/^\s*```/m.test(t) || /^#{1,6}\s+\S/m.test(t)) return true;
  return MARKERS.filter((m) => m.test(t)).length >= 2;
}

export function renderMarkdown(source: string, options: MarkdownOptions = {}): string {
  return blocks(source.replace(/\r\n?/g, "\n").split("\n"), options);
}

const FENCE = /^\s*(```+|~~~+)\s*([\w+-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function blocks(lines: string[], o: MarkdownOptions): string {
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      const lang = fence[2] ? ` class="lang-${escapeHtml(fence[2])}"` : "";
      html += `<pre><code${lang}>${escapeHtml(body.join("\n"))}</code></pre>`;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      html += `<h${heading[1].length}>${inline(heading[2], o)}</h${heading[1].length}>`;
      i++;
      continue;
    }

    if (RULE.test(line)) {
      html += "<hr>";
      i++;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ""));
      html += `<blockquote>${blocks(quote, o)}</blockquote>`;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const rows: string[][] = [cells(line)];
      const aligns = cells(lines[i + 1]).map(align);
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      html += table(rows, aligns, o);
      continue;
    }

    const item = ITEM.exec(line);
    if (item) {
      const [rendered, next] = list(lines, i, o);
      html += rendered;
      i = next;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim()); // a line that startsBlock() but wasn't handled above
    html += `<p>${inline(para.join("\n"), o).replace(/\n/g, " ")}</p>`;
  }
  return html;
}

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || /^\s{0,3}>/.test(line) || ITEM.test(line);
}

function list(lines: string[], start: number, o: MarkdownOptions): [string, number] {
  const first = ITEM.exec(lines[start])!;
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: string[][] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = ITEM.exec(line);
    if (m && m[1].length === base) {
      items.push([m[3]]);
    } else if (!line.trim()) {
      // A blank line continues the list only if an indented line or another item follows.
      const next = lines.slice(i + 1).find((l) => l.trim());
      if (!next || !(indentOf(next) > base || (ITEM.test(next) && indentOf(next) === base))) break;
      items[items.length - 1].push("");
    } else if (indentOf(line) > base) {
      items[items.length - 1].push(line);
    } else {
      break;
    }
    i++;
  }
  const tag = ordered ? "ol" : "ul";
  const body = items
    .map((item) => {
      const [head, ...rest] = item;
      const indent = Math.min(...rest.filter((l) => l.trim()).map(indentOf), Infinity);
      const nested = rest.map((l) => (Number.isFinite(indent) ? l.slice(indent) : l));
      return `<li>${inline(head, o)}${blocks(nested, o)}</li>`;
    })
    .join("");
  return [`<${tag}>${body}</${tag}>`, i];
}

const indentOf = (line: string) => /^\s*/.exec(line)![0].length;

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function align(sep: string): string {
  const left = sep.startsWith(":");
  const right = sep.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : "";
}

function table(rows: string[][], aligns: string[], o: MarkdownOptions): string {
  const cell = (tag: string, text: string, col: number) =>
    `<${tag}${aligns[col] ? ` style="text-align:${aligns[col]}"` : ""}>${inline(text, o)}</${tag}>`;
  const [head, ...body] = rows;
  return (
    `<table><thead><tr>${head.map((c, n) => cell("th", c, n)).join("")}</tr></thead>` +
    `<tbody>${body.map((r) => `<tr>${r.map((c, n) => cell("td", c, n)).join("")}</tr>`).join("")}</tbody></table>`
  );
}

/** Inline syntax. Code spans are cut out first so their content isn't formatted. */
function inline(text: string, o: MarkdownOptions): string {
  const codes: string[] = [];
  let out = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code: string) => {
    codes.push(`<code>${escapeHtml(code.trim())}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, alt: string, url: string) =>
    o.remote && /^https?:\/\//i.test(url) ? `<img src="${url}" alt="${alt}">` : alt || url
  );
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_, label: string, url: string) =>
    SAFE_URL.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : `${label} (${url})`
  );
  out = out
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/g, (_, a: string, b: string) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  return out.replace(/\u0000(\d+)\u0000/g, (_, n: string) => codes[Number(n)]);
}
