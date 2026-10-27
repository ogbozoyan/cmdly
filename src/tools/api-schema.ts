/**
 * What OpenAPI and AsyncAPI renderings share: JSON-Schema `$ref`s, the model tree, generated examples and the
 * script-free "Example Value | Schema" tabs. Pure functions; everything that reaches the HTML goes through `esc`.
 */
import { t } from "../i18n/index.ts";
import { escapeHtml as esc } from "../shared/escape.ts";
import { log } from "../shared/log.ts";

export type Obj = Record<string, any>;

export const text = (v: unknown) => (v == null ? "" : esc(String(v)));
export const para = (v: unknown, cls = "") => (v ? `<p${cls ? ` class="${cls}"` : ""}>${text(v)}</p>` : "");

export interface Ctx {
  spec: Obj;
  /** Numbers the tab groups: radio buttons of one group share a name. */
  tabs: number;
}

/** Follows local `$ref`s ("#/components/schemas/X"); remote refs are not fetched. */
export function deref(spec: Obj, schema: unknown): Obj | undefined {
  let s = schema as Obj | undefined;
  for (let i = 0; i < 8 && s && typeof s.$ref === "string"; i++) {
    if (!s.$ref.startsWith("#/")) return undefined;
    s = s.$ref
      .slice(2)
      .split("/")
      .reduce((node: any, key: string) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
  }
  return s && typeof s === "object" ? s : undefined;
}

/** "string($date-time)", "array[Pet]", "Pet": how Swagger UI names a type. */
export function typeLabel(schema: Obj | undefined): string {
  if (!schema || typeof schema !== "object") return "";
  if (schema.$ref) return String(schema.$ref).split("/").pop() ?? "";
  if (schema.type === "array") return `array[${typeLabel(schema.items) || "any"}]`;
  const type = schema.type ?? (schema.oneOf ? "oneOf" : schema.anyOf ? "anyOf" : "object");
  return schema.format ? `${type}($${schema.format})` : String(type);
}

const MAX_DEPTH = 6;
const CONSTRAINTS = ["minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "default"];

/** Properties of an object schema with `allOf` flattened; bounded, since specs can be recursive. */
function properties(spec: Obj, schema: unknown, depth = 0): { props: Record<string, Obj>; required: string[] } {
  const out = { props: {} as Record<string, Obj>, required: [] as string[] };
  const s = deref(spec, schema);
  if (!s || depth > MAX_DEPTH) return out;
  for (const part of Array.isArray(s.allOf) ? s.allOf : []) {
    const inner = properties(spec, part, depth + 1);
    Object.assign(out.props, inner.props);
    out.required.push(...inner.required);
  }
  if (s.properties && typeof s.properties === "object") Object.assign(out.props, s.properties);
  if (Array.isArray(s.required)) out.required.push(...s.required);
  return out;
}

/** What Swagger UI shows as "Example Value" when the spec has none: placeholders by type. */
export function sample(spec: Obj, schema: unknown, depth = 0, seen: string[] = []): unknown {
  const ref = typeof (schema as Obj)?.$ref === "string" ? (schema as Obj).$ref : "";
  const s = deref(spec, schema);
  if (!s || depth > MAX_DEPTH || (ref && seen.includes(ref))) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  const nextSeen = ref ? [...seen, ref] : seen;
  const first = s.oneOf?.[0] ?? s.anyOf?.[0];
  if (first) return sample(spec, first, depth + 1, nextSeen);
  const { props } = properties(spec, s);
  if (s.type === "array") return [sample(spec, s.items, depth + 1, nextSeen)];
  if (s.type === "object" || Object.keys(props).length) {
    return Object.fromEntries(Object.entries(props).map(([k, p]) => [k, sample(spec, p, depth + 1, nextSeen)]));
  }
  switch (s.type) {
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    default:
      return { "date-time": "2024-01-01T00:00:00Z", date: "2024-01-01", uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6", email: "user@example.com" }[s.format as string] ?? "string";
  }
}

/** Limits and allowed values under a field, in the spec's own words (they are the spec's keywords, not UI text). */
export function facts(d: Obj): string {
  const lines = CONSTRAINTS.filter((k) => d[k] !== undefined && typeof d[k] !== "object").map((k) => `${k}: <code>${text(d[k])}</code>`);
  if (Array.isArray(d.enum)) lines.push(`enum: ${d.enum.map((v: unknown) => `<code>${text(JSON.stringify(v))}</code>`).join(" ")}`);
  if (d.example !== undefined && typeof d.example !== "object") lines.push(`example: <code>${text(d.example)}</code>`);
  return lines.map((l) => `<div class="facts">${l}</div>`).join("");
}

/** The rows of an object schema, nested objects and arrays of objects expanded; a `$ref` being expanded is shown by name only. */
function modelRows(ctx: Ctx, schema: unknown, depth = 0, seen: string[] = []): string {
  const ref = typeof (schema as Obj)?.$ref === "string" ? (schema as Obj).$ref : "";
  if (ref && seen.includes(ref)) return "";
  const s = deref(ctx.spec, schema);
  if (!s || depth >= MAX_DEPTH) return "";
  const nextSeen = ref ? [...seen, ref] : seen;
  if (s.type === "array") return modelRows(ctx, s.items, depth, nextSeen);
  const { props, required } = properties(ctx.spec, s);
  const rows = Object.entries(props).map(([name, p]) => {
    const d = deref(ctx.spec, p) ?? {};
    const inner = modelRows(ctx, p, depth + 1, nextSeen);
    const array = d.type === "array";
    return (
      `<tr><td class="mp">${text(name)}${required.includes(name) ? '<b class="req">*</b>' : ""}</td><td>` +
      `<span class="mtype">${text(typeLabel(p))}</span>` +
      (p.description ?? d.description ? ` <span class="mdesc">${text(p.description ?? d.description)}</span>` : "") +
      facts(d) +
      (inner ? `<div class="model nested"><span class="br">${array ? "[" : "{"}</span>${inner}<span class="br">${array ? "]" : "}"}</span></div>` : "") +
      `</td></tr>`
    );
  });
  return rows.length ? `<table class="mt"><tbody>${rows.join("")}</tbody></table>` : "";
}

export function model(ctx: Ctx, schema: unknown): string {
  const s = deref(ctx.spec, schema);
  const rows = modelRows(ctx, schema);
  const label = text(typeLabel(schema as Obj));
  if (!rows) return `<div class="model"><span class="mtype">${label}</span>${s ? facts(s) : ""}</div>`;
  const array = s?.type === "array";
  return `<div class="model"><span class="mname">${label}</span> <span class="br">${array ? "[" : "{"}</span>${rows}<span class="br">${array ? "]" : "}"}</span></div>`;
}

/** Two tabs without scripts: radio buttons, panes shown by `:checked` (see openapi-style.ts). */
function tabs(ctx: Ctx, example: string, schema: string): string {
  const n = ++ctx.tabs;
  const input = (i: number, label: string) =>
    `<input type="radio" name="tab${n}" id="tab${n}-${i}"${i === 1 ? " checked" : ""}><label for="tab${n}-${i}">${esc(label)}</label>`;
  return `<div class="tabs">${input(1, t("markupExample"))}${input(2, t("markupSchema"))}<div class="pane">${example}</div><div class="pane">${schema}</div></div>`;
}

function examplePre(value: unknown): string {
  try {
    const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return `<pre class="example">${text(json.length > 4000 ? `${json.slice(0, 4000)}…` : json)}</pre>`;
  } catch (e) {
    log.debug("openapi", "example is not serializable", e);
    return "";
  }
}

/** "Example Value | Schema" for a schema; the example is the spec's own when given, else built from the schema. */
export function schemaTabs(ctx: Ctx, schema: unknown, given?: unknown): string {
  return tabs(ctx, examplePre(given ?? sample(ctx.spec, schema)), schema ? model(ctx, schema) : "");
}

export function sectionHead(title: string, extra = ""): string {
  return `<div class="sec-head"><h4>${esc(title)}</h4>${extra}</div>`;
}

/** The "Schemas" block at the end, like Swagger Editor's: every component, collapsed. */
export function schemas(ctx: Ctx): string {
  const all = ctx.spec.components?.schemas ?? ctx.spec.definitions;
  if (!all || typeof all !== "object") return "";
  const items = Object.entries<Obj>(all).map(
    ([name, schema]) => `<details class="sch"><summary>${text(name)}</summary><div class="sch-body">${model(ctx, schema)}</div></details>`,
  );
  return items.length ? `<h2 class="tag"><span>${esc(t("markupSchemas"))}</span></h2>${items.join("")}` : "";
}
