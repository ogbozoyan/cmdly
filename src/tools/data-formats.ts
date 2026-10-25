/** JSON / YAML detection, formatting and conversion. Pure functions, unit-tested. */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type DataFormat = "json" | "yaml";

export interface ParsedData {
  format: DataFormat;
  /** Always an object or an array — plain scalars are not treated as data. */
  value: object;
}

/**
 * Recognizes pasted JSON or YAML.
 *  - JSON: starts with { or [ and parses.
 *  - YAML: must be multi-line (a one-line "error: timeout" is a search, not YAML)
 *    and parse into an object or array.
 */
export function parseData(text: string): ParsedData | null {
  const t = text.trim();
  if (!t) return null;

  if (/^[[{]/.test(t)) {
    const json = tryParse(() => JSON.parse(t));
    if (json) return { format: "json", value: json };
  }

  if (t.includes("\n")) {
    const yaml = tryParse(() => parseYaml(t));
    if (yaml) return { format: "yaml", value: yaml };
  }
  return null;
}

function tryParse(parse: () => unknown): object | null {
  try {
    const value = parse();
    return value !== null && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function toMinifiedJson(value: unknown): string {
  return JSON.stringify(value);
}

export function toYaml(value: unknown): string {
  return stringifyYaml(value, { lineWidth: 0 }).trimEnd();
}

/** "object · 4 keys", "array · 12 items" */
export function describeData(value: object): string {
  if (Array.isArray(value)) return `array · ${value.length} item${value.length === 1 ? "" : "s"}`;
  const keys = Object.keys(value).length;
  return `object · ${keys} key${keys === 1 ? "" : "s"}`;
}

/** "312 B", "4.2 KB" */
export function formatSize(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
