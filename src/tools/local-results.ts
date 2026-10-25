import type { Preview, ResultItem } from "../shared/model.ts";
import type { Features } from "../shared/settings.ts";
import { evaluate, formatNumber, plainNumber } from "./calculator.ts";
import { describeData, formatSize, parseData, toMinifiedJson, toPrettyJson, toYaml } from "./data-formats.ts";
import { base64Decode, base64Encode, decodeJwt, describeJwt, jwtTimeNotes, urlDecode, uuid } from "./dev-tools.ts";

/**
 * Results computed instantly in the UI, without asking the background:
 * calculator, UUID, encoders, JWT, JSON/YAML. Shown above tabs/history/search.
 * `query` is the raw text — for pasted JSON/YAML it keeps its line breaks.
 */
export function localResults(query: string, features: Features): ResultItem[] {
  const q = query.trim();
  if (!q) return [];
  return [
    ...(features.calculator ? calculatorResult(q) : []),
    ...(features.uuid ? uuidResult(q) : []),
    ...(features.encode ? encoderResult(q) : []),
    ...(features.jwt ? jwtResult(q) : []),
    ...(features.formats ? dataResult(q) : []),
  ];
}

function copyRow(
  title: string,
  meta: string,
  copy: string,
  glyph: ResultItem["glyph"],
  kind: ResultItem["kind"] = "tool",
  preview?: Preview
): ResultItem {
  return { kind, title, meta, copy, glyph, action: "Copy", preview };
}

function calculatorResult(q: string): ResultItem[] {
  const value = evaluate(q);
  if (value === null) return [];
  return [copyRow("= " + formatNumber(value), q.replace(/=$/, ""), plainNumber(value), "calc", "calc")];
}

/** "uuid", "guid", "uuid v4", "uuid 5" (up to 50). */
function uuidResult(q: string): ResultItem[] {
  const m = /^(uuid|guid)(?:\s*v?4)?(?:\s+(\d{1,2}))?$/i.exec(q);
  if (!m) return [];
  const count = Math.min(Math.max(parseInt(m[2] || "1", 10), 1), 50);
  const ids = Array.from({ length: count }, uuid);
  return count === 1
    ? [copyRow(ids[0], "UUID v4", ids[0], "key")]
    : [copyRow(`${count} UUIDs`, ids[0] + "…", ids.join("\n"), "key")];
}

/** Prefix commands. Each prefix needs a space and some text after it: "b64 hello". */
const ENCODERS: { prefixes: string[]; label: string; run: (text: string) => string | null }[] = [
  { prefixes: ["b64", "base64"], label: "Base64 encoded", run: base64Encode },
  { prefixes: ["unb64", "b64d", "debase64"], label: "Base64 decoded", run: base64Decode },
  { prefixes: ["url", "urlenc", "encode"], label: "URL encoded", run: encodeURIComponent },
  { prefixes: ["unurl", "urld", "urldec", "decode"], label: "URL decoded", run: urlDecode },
];

function encoderResult(q: string): ResultItem[] {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(q);
  const encoder = m && ENCODERS.find((e) => e.prefixes.includes(m[1].toLowerCase()));
  if (m && encoder) {
    const result = encoder.run(m[2]);
    // Unchanged output means it wasn't meant as a tool call: "url shortener", "decode meaning".
    if (!result || result === m[2]) return [];
    return [copyRow(result, encoder.label, result, "code", "tool", jsonPreview(result))];
  }
  // A bare percent-encoded string: offer the decoded version.
  if (!/\s/.test(q) && /%[0-9a-f]{2}/i.test(q)) {
    const decoded = urlDecode(q);
    if (decoded && decoded !== q) return [copyRow(decoded, "URL decoded", decoded, "code")];
  }
  return [];
}

function jwtResult(q: string): ResultItem[] {
  const jwt = decodeJwt(q);
  if (!jwt) return [];
  const payload = toPrettyJson(jwt.payload);
  const header = toPrettyJson(jwt.header);
  return [
    copyRow(toMinifiedJson(jwt.payload), describeJwt(jwt.payload), payload, "key", "tool", {
      language: "json",
      content: payload,
      notes: jwtTimeNotes(jwt.payload),
    }),
    copyRow(toMinifiedJson(jwt.header), "JWT header", header, "key", "tool", { language: "json", content: header }),
  ];
}

/**
 * Pasted JSON → Format / Minify / Convert to YAML.
 * Pasted YAML → Format / Convert to JSON.
 * Every row can be expanded (Tab) to view the result.
 */
function dataResult(q: string): ResultItem[] {
  const data = parseData(q);
  if (!data) return [];
  const meta = `${describeData(data.value)} · ${formatSize(q)}`;
  const pretty = toPrettyJson(data.value);
  const yaml = toYaml(data.value);
  const json: Preview = { language: "json", content: pretty };

  if (data.format === "json") {
    const minified = toMinifiedJson(data.value);
    return [
      copyRow("Format JSON", meta, pretty, "braces", "tool", json),
      copyRow("Minify JSON", formatSize(minified), minified, "braces", "tool", { language: "json", content: minified }),
      copyRow("Convert to YAML", meta, yaml, "code", "tool", { language: "yaml", content: yaml }),
    ];
  }
  return [
    copyRow("Format YAML", meta, yaml, "code", "tool", { language: "yaml", content: yaml }),
    copyRow("Convert to JSON", meta, pretty, "braces", "tool", json),
  ];
}

/** Decoded text that happens to be JSON (e.g. "unb64 eyJ…") gets a viewer too. */
function jsonPreview(text: string): Preview | undefined {
  const data = parseData(text);
  return data?.format === "json" ? { language: "json", content: toPrettyJson(data.value) } : undefined;
}
