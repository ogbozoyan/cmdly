import { t, type MessageKey } from "../i18n/index.ts";
import type { Preview, ResultItem } from "../shared/model.ts";
import type { Features } from "../shared/settings.ts";
import { evaluate, formatNumber, plainNumber } from "./calculator.ts";
import { describeData, formatSize, parseData, toMinifiedJson, toPrettyJson, toYaml } from "./data-formats.ts";
import { base64Decode, base64Encode, decodeJwt, describeJwt, jwtTimeNotes, urlDecode } from "./dev-tools.ts";
import { detectMarkupKind, markupResult, splitMarkupPrefix, type MarkupKind } from "./markup.ts";
import { generateUuids, isUuidVersion, nextUuidVersion, UUID_DESCRIPTIONS, type UuidVersion } from "./uuid.ts";

export interface LocalOptions {
  /** Saved UUID version (Settings.tools.uuidVersion). */
  uuidVersion?: string;
  /** Scoped mode ("md" + Tab): the whole input is that format and other tools stay quiet. */
  markupMode?: MarkupKind | null;
}

/**
 * Results computed instantly in the UI, without asking the background:
 * calculator, UUID, encoders, JWT, JSON/YAML. Shown above tabs/history/search.
 * `query` is the raw text — for pasted JSON/YAML it keeps its line breaks.
 */
export function localResults(query: string, features: Features, options: LocalOptions = {}): ResultItem[] {
  const q = query.trim();
  if (!q) return [];
  const savedUuid = isUuidVersion(options.uuidVersion) ? options.uuidVersion : "v4";
  const markup = features.markup ? markupRows(query, features, options.markupMode ?? null) : [];
  if (options.markupMode && features.markup) return markup;
  return [
    ...markup,
    ...(features.calculator ? calculatorResult(q) : []),
    ...(features.uuid ? uuidResult(q, savedUuid) : []),
    ...(features.encode ? encoderResult(q) : []),
    ...(features.jwt ? jwtResult(q) : []),
    ...(features.formats ? dataResult(q) : []),
  ];
}

/** Forced by mode or by a prefix ("md # Title"), otherwise detected from the pasted text. */
function markupRows(query: string, features: Features, mode: MarkupKind | null): ResultItem[] {
  const opts = { remote: features.markupRemote };
  if (mode) return markupResult(mode, query.trim(), opts);
  const prefixed = splitMarkupPrefix(query);
  if (prefixed) return markupResult(prefixed.kind, prefixed.text, opts);
  const kind = detectMarkupKind(query);
  return kind ? markupResult(kind, query.trim(), opts) : [];
}

function copyRow(
  title: string,
  meta: string,
  copy: string,
  glyph: ResultItem["glyph"],
  kind: ResultItem["kind"] = "tool",
  preview?: Preview
): ResultItem {
  return { kind, title, meta, copy, glyph, action: t("actionCopy"), preview };
}

function calculatorResult(q: string): ResultItem[] {
  const value = evaluate(q);
  if (value === null) return [];
  return [copyRow("= " + formatNumber(value), q.replace(/=$/, ""), plainNumber(value), "calc", "calc")];
}

/**
 * "uuid", "guid", "uuid 5" (up to 50) use the saved version, and Tab on the row switches it.
 * "uuid v7", "uuid v1 5" pick a version for this query only.
 */
function uuidResult(q: string, saved: UuidVersion): ResultItem[] {
  const m = /^(uuid|guid)(?:\s*v([147]))?(?:\s+(\d{1,2}))?$/i.exec(q);
  if (!m) return [];
  const explicit = m[2] ? (`v${m[2]}` as UuidVersion) : null;
  const version = explicit ?? saved;
  const count = Math.min(Math.max(parseInt(m[3] || "1", 10), 1), 50);
  const ids = generateUuids(version, count);
  const label = `UUID ${version} · ${t(UUID_DESCRIPTIONS[version])}`;
  const row =
    count === 1
      ? copyRow(ids[0], label, ids[0], "key")
      : copyRow(t("uuidCount", count), `${label} · ${ids[0]}…`, ids.join("\n"), "key");
  // Explicit "uuid v7" is a one-off; only the plain query cycles and saves the version.
  if (!explicit) row.variant = { setting: "uuidVersion", value: version, next: nextUuidVersion(version) };
  return [row];
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
    copyRow(toMinifiedJson(jwt.header), t("jwtHeader"), header, "key", "tool", { language: "json", content: header }),
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
      copyRow(t("formatJson"), meta, pretty, "braces", "tool", json),
      copyRow(t("minifyJson"), formatSize(minified), minified, "braces", "tool", { language: "json", content: minified }),
      copyRow(t("convertToYaml"), meta, yaml, "code", "tool", { language: "yaml", content: yaml }),
    ];
  }
  return [
    copyRow(t("formatYaml"), meta, yaml, "code", "tool", { language: "yaml", content: yaml }),
    copyRow(t("convertToJson"), meta, pretty, "braces", "tool", json),
  ];
}

/** Decoded text that happens to be JSON (e.g. "unb64 eyJ…") gets a viewer too. */
function jsonPreview(text: string): Preview | undefined {
  const data = parseData(text);
  return data?.format === "json" ? { language: "json", content: toPrettyJson(data.value) } : undefined;
}
