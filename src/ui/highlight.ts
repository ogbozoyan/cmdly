/**
 * Minimal syntax highlighting for the preview panel. Returns HTML.
 * Every piece of user text goes through escapeHtml — the result is inserted with innerHTML
 * into someone else's page, so pasted "<img onerror=…>" must stay inert text.
 */

import { escapeHtml } from "../shared/escape.ts";

export { escapeHtml };

const span = (cls: string, text: string) => `<span class="tok-${cls}">${escapeHtml(text)}</span>`;

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export function highlightJson(code: string): string {
  let html = "";
  let last = 0;
  for (const m of code.matchAll(JSON_TOKEN)) {
    html += escapeHtml(code.slice(last, m.index));
    if (m[1]) html += m[2] ? span("key", m[1]) + escapeHtml(m[2]) : span("string", m[1]);
    else if (m[3]) html += span(m[3] === "null" ? "null" : "bool", m[0]);
    else html += span("number", m[0]);
    last = m.index! + m[0].length;
  }
  return html + escapeHtml(code.slice(last));
}

// indent + optional "- " + key + ":" + rest
const YAML_LINE = /^(\s*(?:-\s+)?)([^\s#:][^:#]*?|"[^"]*"|'[^']*')(:)(\s.*|$)/;

export function highlightYaml(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      if (/^\s*#/.test(line)) return span("comment", line);
      const m = YAML_LINE.exec(line);
      if (m) return escapeHtml(m[1]) + span("key", m[2]) + escapeHtml(m[3]) + yamlValue(m[4]);
      const item = /^(\s*-\s+)(.*)$/.exec(line);
      if (item) return escapeHtml(item[1]) + yamlValue(item[2]);
      return escapeHtml(line);
    })
    .join("\n");
}

function yamlValue(raw: string): string {
  const value = raw.trim();
  if (!value) return escapeHtml(raw);
  const lead = raw.slice(0, raw.indexOf(value));
  let cls = "string";
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) cls = "number";
  else if (/^(true|false)$/.test(value)) cls = "bool";
  else if (/^(null|~)$/.test(value)) cls = "null";
  else if (/^[|>][-+]?$/.test(value)) return escapeHtml(raw); // block scalar marker
  return escapeHtml(lead) + span(cls, value);
}

export function highlight(code: string, language: "json" | "yaml"): string {
  return language === "json" ? highlightJson(code) : highlightYaml(code);
}
