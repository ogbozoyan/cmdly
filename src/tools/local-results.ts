import type { ResultItem } from "../shared/model.ts";
import type { Features } from "../shared/settings.ts";
import { evaluate, formatNumber, plainNumber } from "./calculator.ts";
import { base64Decode, base64Encode, decodeJwt, describeJwt, urlDecode, uuid } from "./dev-tools.ts";

/**
 * Results computed instantly in the UI, without asking the background:
 * calculator, UUID, encoders, JWT. Shown above tabs/history/search.
 */
export function localResults(query: string, features: Features): ResultItem[] {
  const q = query.trim();
  if (!q) return [];
  return [
    ...(features.calculator ? calculatorResult(q) : []),
    ...(features.uuid ? uuidResult(q) : []),
    ...(features.encode ? encoderResult(q) : []),
    ...(features.jwt ? jwtResult(q) : []),
  ];
}

function copyRow(title: string, meta: string, copy: string, glyph: ResultItem["glyph"], kind: ResultItem["kind"] = "tool"): ResultItem {
  return { kind, title, meta, copy, glyph, action: "Copy" };
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
    return [copyRow(result, encoder.label, result, "code")];
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
  return [
    copyRow(JSON.stringify(jwt.payload), describeJwt(jwt.payload), JSON.stringify(jwt.payload, null, 2), "key"),
    copyRow(JSON.stringify(jwt.header), "JWT header", JSON.stringify(jwt.header, null, 2), "key"),
  ];
}
