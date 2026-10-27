/**
 * OpenAPI 3.x / Swagger 2.0 detection and a rendering modelled on Swagger UI / Swagger Editor
 * (https://editor.swagger.io). Pure functions; the preview runs no scripts, so the
 * "Example Value | Schema" tabs are radio buttons styled in openapi-style.ts.
 */
import { t, tp } from "../i18n/index.ts";
import { escapeHtml as esc } from "../shared/escape.ts";
import { log } from "../shared/log.ts";
import { parseData } from "./data-formats.ts";

type Obj = Record<string, any>;

export interface OpenApiDoc {
  version: string;
  spec: Obj;
  operations: number;
}

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

export function parseOpenApi(text: string): OpenApiDoc | null {
  const data = parseData(text);
  if (!data || Array.isArray(data.value)) return null;
  const spec = data.value as Obj;
  const version = spec.openapi ?? spec.swagger;
  if (version == null || typeof spec.paths !== "object" || spec.paths === null) return null;
  return { version: String(version), spec, operations: operations(spec).length };
}

interface Operation {
  method: string;
  path: string;
  op: Obj;
  shared: Obj[];
}

function operations(spec: Obj): Operation[] {
  const out: Operation[] = [];
  for (const [path, item] of Object.entries<Obj>(spec.paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      if (item[method] && typeof item[method] === "object") {
        out.push({ method, path, op: item[method] as Obj, shared: Array.isArray(item.parameters) ? item.parameters : [] });
      }
    }
  }
  return out;
}

const text = (v: unknown) => (v == null ? "" : esc(String(v)));
const para = (v: unknown, cls = "") => (v ? `<p${cls ? ` class="${cls}"` : ""}>${text(v)}</p>` : "");

function servers(spec: Obj): string[] {
  if (Array.isArray(spec.servers)) return spec.servers.map((s: Obj) => String(s?.url ?? "")).filter(Boolean);
  if (spec.host) {
    const schemes: string[] = Array.isArray(spec.schemes) && spec.schemes.length ? spec.schemes : ["https"];
    return schemes.map((s) => `${s}://${spec.host}${spec.basePath ?? ""}`);
  }
  return [];
}

interface Ctx {
  spec: Obj;
  /** Numbers the tab groups: radio buttons of one group share a name. */
  tabs: number;
}

/** Follows local `$ref`s ("#/components/schemas/X"); remote refs are not fetched. */
function deref(spec: Obj, schema: unknown): Obj | undefined {
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
function typeLabel(schema: Obj | undefined): string {
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
function sample(spec: Obj, schema: unknown, depth = 0, seen: string[] = []): unknown {
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
function facts(d: Obj): string {
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

function model(ctx: Ctx, schema: unknown): string {
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

/** One block per media type: its name and the Example Value | Schema tabs. */
function mediaBlock(ctx: Ctx, mime: string, m: Obj | undefined): string {
  const schema = m?.schema;
  if (!schema && m?.example === undefined) return mime ? `<div class="mime">${text(mime)}</div>` : "";
  const named = m?.examples && typeof m.examples === "object" ? Object.values<Obj>(m.examples)[0]?.value : undefined;
  const value = m?.example ?? named ?? sample(ctx.spec, schema);
  return `<div class="media">${mime ? `<div class="mime">${text(mime)}</div>` : ""}${tabs(ctx, examplePre(value), schema ? model(ctx, schema) : "")}</div>`;
}

function media(ctx: Ctx, content: Obj | undefined, schema?: Obj): string {
  if (content && typeof content === "object") return Object.entries<Obj>(content).map(([mime, m]) => mediaBlock(ctx, mime, m)).join("");
  return schema ? mediaBlock(ctx, "", { schema }) : "";
}

function sectionHead(title: string, extra = ""): string {
  return `<div class="sec-head"><h4>${esc(title)}</h4>${extra}</div>`;
}

function parameters(ctx: Ctx, params: Obj[]): string {
  const rows = params
    .map((raw) => deref(ctx.spec, raw))
    .filter((p): p is Obj => !!p && p.in !== "body")
    .map((p) => {
      const schema = p.schema ?? p;
      return (
        `<tr><td class="pn"><div class="pname">${text(p.name)}${p.required ? '<b class="req">*</b>' : ""}</div>` +
        (p.required ? `<div class="reqtext">${esc(t("markupRequired"))}</div>` : "") +
        `<div class="ptype">${text(typeLabel(schema))}</div><div class="pin">(${text(p.in)})</div></td>` +
        `<td>${p.description ? `<p>${text(p.description)}</p>` : ""}${facts(deref(ctx.spec, schema) ?? {})}</td></tr>`
      );
    })
    .join("");
  if (!rows) return "";
  return (
    sectionHead(t("markupParameters")) +
    `<table class="grid"><thead><tr><th>${esc(t("markupName"))}</th><th>${esc(t("markupDescription"))}</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function requestBody(ctx: Ctx, op: Obj, params: Obj[]): string {
  const { spec } = ctx;
  const declared = op.requestBody ? deref(spec, op.requestBody) : undefined;
  let body = declared ? media(ctx, declared.content) : "";
  if (!op.requestBody) {
    // Swagger 2.0: the body is a parameter with `in: body`.
    const param = params.map((p) => deref(spec, p)).find((p) => p?.in === "body");
    const types: string[] = Array.isArray(op.consumes) ? op.consumes : Array.isArray(spec.consumes) ? spec.consumes : [];
    if (param?.schema) body = (types.length ? types : [""]).map((c) => mediaBlock(ctx, c, { schema: param.schema })).join("");
  }
  const required = declared?.required ? `<span class="reqtext">* ${esc(t("markupRequired"))}</span>` : "";
  return body ? sectionHead(t("markupRequestBody"), required) + `<div class="sec-body">${body}</div>` : "";
}

function responses(ctx: Ctx, op: Obj): string {
  const rows = Object.entries<Obj>(op.responses ?? {})
    .map(([code, raw]) => {
      const r = deref(ctx.spec, raw) ?? {};
      const body = r.content ? media(ctx, r.content) : r.schema ? media(ctx, undefined, r.schema) : "";
      return `<tr><td class="rc">${text(code)}</td><td>${r.description ? `<p>${text(r.description)}</p>` : ""}${body}</td></tr>`;
    })
    .join("");
  if (!rows) return "";
  return (
    sectionHead(t("markupResponses")) +
    `<table class="grid"><thead><tr><th>${esc(t("markupCode"))}</th><th>${esc(t("markupDescription"))}</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

function operation(ctx: Ctx, { method, path, op, shared }: Operation): string {
  const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])];
  return (
    `<details class="op m-${method}${op.deprecated ? " deprecated" : ""}">` +
    `<summary><span class="method">${method.toUpperCase()}</span><span class="path">${text(path)}</span>` +
    `${op.deprecated ? `<em>${esc(t("markupDeprecated"))}</em>` : ""}<span class="sum">${text(op.summary)}</span></summary>` +
    `<div class="op-body">` +
    (op.description && op.description !== op.summary ? para(op.description, "opdesc") : "") +
    parameters(ctx, params) +
    requestBody(ctx, op, params) +
    responses(ctx, op) +
    `</div></details>`
  );
}

/** Operations grouped by their first tag, in the order the spec declares the tags. */
function groups(spec: Obj, ops: Operation[]): [string, Operation[]][] {
  const map = new Map<string, Operation[]>();
  for (const tag of Array.isArray(spec.tags) ? spec.tags : []) {
    if (tag?.name) map.set(String(tag.name), []);
  }
  for (const o of ops) {
    const tag = typeof o.op.tags?.[0] === "string" ? o.op.tags[0] : "";
    map.set(tag, [...(map.get(tag) ?? []), o]);
  }
  return [...map].filter(([, list]) => list.length);
}

/** The "Schemas" block at the end, like Swagger Editor's: every component, collapsed. */
function schemas(ctx: Ctx): string {
  const all = ctx.spec.components?.schemas ?? ctx.spec.definitions;
  if (!all || typeof all !== "object") return "";
  const items = Object.entries<Obj>(all).map(
    ([name, schema]) => `<details class="sch"><summary>${text(name)}</summary><div class="sch-body">${model(ctx, schema)}</div></details>`,
  );
  return items.length ? `<h2 class="tag"><span>${esc(t("markupSchemas"))}</span></h2>${items.join("")}` : "";
}

export function renderOpenApi(doc: OpenApiDoc): string {
  const { spec } = doc;
  const ctx: Ctx = { spec, tabs: 0 };
  const info: Obj = spec.info ?? {};
  const urls = servers(spec);
  const oas = `${spec.openapi ? "OAS" : "Swagger"} ${doc.version.split(".").slice(0, 2).join(".")}`;
  let html =
    `<h1>${text(info.title ?? "API")}` +
    (info.version ? ` <span class="pill">${text(info.version)}</span>` : "") +
    ` <span class="pill oas">${text(oas)}</span></h1>` +
    para(info.description, "desc");
  if (urls.length) {
    html += `<div class="servers"><span class="lbl">${esc(t("markupServers"))}</span>${urls.map((u) => `<div class="srv">${text(u)}</div>`).join("")}</div>`;
  }

  const ops = operations(spec);
  if (!ops.length) return `<div class="oas">${html}${para(t("markupNoOperations"), "muted")}</div>`;
  const described = new Map<string, unknown>((Array.isArray(spec.tags) ? spec.tags : []).map((x: Obj) => [String(x?.name), x?.description]));
  for (const [tag, list] of groups(spec, ops)) {
    const description = described.get(tag);
    html += `<h2 class="tag"><span>${text(tag || t("markupDefaultGroup"))}</span>${description ? `<small>${text(description)}</small>` : ""}</h2>`;
    html += list.map((o) => operation(ctx, o)).join("");
  }
  return `<div class="oas">${html}${schemas(ctx)}</div>`;
}

export function describeOpenApi(doc: OpenApiDoc): string {
  return `${doc.spec.openapi ? "OpenAPI" : "Swagger"} ${doc.version} · ${tp("markupOperations", doc.operations)}`;
}
