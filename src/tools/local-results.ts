import { t, type MessageKey } from "../i18n/index.ts";
import type { Preview, ResultItem } from "../shared/model.ts";
import type { Features } from "../shared/settings.ts";
import { evaluate, formatNumber, plainNumber } from "./calculator.ts";
import { parseData, toPrettyJson } from "./data-formats.ts";
import { base64Decode, base64Encode, urlDecode } from "./dev-tools.ts";
import { copyRow } from "./rows.ts";

/**
 * Results computed instantly in the UI, without asking the background: calculator and encoders.
 * (The tools with their own view or Tab action — UUID, JWT, JSON/YAML, HTML… — are features, see src/features.)
 * Shown above tabs/history/search.
 */
export function localResults(query: string, features: Features): ResultItem[] {
  const q = query.trim();
  if (!q) return [];
  return [
    ...(features.calculator ? calculatorResult(q) : []),
    ...(features.encode ? encoderResult(q) : []),
  ];
}

function calculatorResult(q: string): ResultItem[] {
  const value = evaluate(q);
  if (value === null) return [];
  return [copyRow("= " + formatNumber(value), q.replace(/=$/, ""), plainNumber(value), "calc", "calc")];
}

/** Prefix commands. Each prefix needs a space and some text after it: "b64 hello". */
const ENCODERS: { prefixes: string[]; label: MessageKey; run: (text: string) => string | null }[] = [
  { prefixes: ["b64", "base64"], label: "base64Encoded", run: base64Encode },
  { prefixes: ["unb64", "b64d", "debase64"], label: "base64Decoded", run: base64Decode },
  { prefixes: ["url", "urlenc", "encode"], label: "urlEncoded", run: encodeURIComponent },
  { prefixes: ["unurl", "urld", "urldec", "decode"], label: "urlDecoded", run: urlDecode },
];

function encoderResult(q: string): ResultItem[] {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(q);
  const encoder = m && ENCODERS.find((e) => e.prefixes.includes(m[1].toLowerCase()));
  if (m && encoder) {
    const result = encoder.run(m[2]);
    // Unchanged output means it wasn't meant as a tool call: "url shortener", "decode meaning".
    if (!result || result === m[2]) return [];
    return [copyRow(result, t(encoder.label), result, "code", "tool", jsonPreview(result))];
  }
  // A bare percent-encoded string: offer the decoded version.
  if (!/\s/.test(q) && /%[0-9a-f]{2}/i.test(q)) {
    const decoded = urlDecode(q);
    if (decoded && decoded !== q) return [copyRow(decoded, t("urlDecoded"), decoded, "code")];
  }
  return [];
}

/** Decoded text that happens to be JSON (e.g. "unb64 eyJ…") gets a viewer too. */
function jsonPreview(text: string): Preview | undefined {
  const data = parseData(text);
  return data?.format === "json" ? { language: "json", content: toPrettyJson(data.value) } : undefined;
}
