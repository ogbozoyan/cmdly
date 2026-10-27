/** OpenAPI 3.x / Swagger 2.0 detection and a Swagger-UI-like HTML rendering. Pure functions, no scripts needed. */
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

function schemaType(schema: Obj | undefined): string {
  if (!schema || typeof schema !== "object") return "";
  if (schema.$ref) return String(schema.$ref).split("/").pop() ?? "";
  if (schema.type === "array") return `${schemaType(schema.items) || "any"}[]`;
  const type = schema.type ?? (schema.oneOf ? "oneOf" : schema.anyOf ? "anyOf" : "object");
  return schema.format ? `${type} <${schema.format}>` : String(type);
}

const MAX_DEPTH = 5;

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

/** Nested list of the fields of a schema; a `$ref` already being expanded is shown by name only. */
function schemaTree(spec: Obj, schema: unknown, depth = 0, seen: string[] = []): string {
  const ref = typeof (schema as Obj)?.$ref === "string" ? (schema as Obj).$ref : "";
  if (ref && seen.includes(ref)) return "";
  const s = deref(spec, schema);
  if (!s || depth >= MAX_DEPTH) return "";
  const nextSeen = ref ? [...seen, ref] : seen;
  if (s.type === "array") return schemaTree(spec, s.items, depth, nextSeen);
  const { props, required } = properties(spec, s);
  const names = Object.keys(props);
  if (!names.length) return "";
  const items = names.map((name) => {
    const p = props[name];
    const d = deref(spec, p) ?? {};
    const values = Array.isArray(d.enum) ? ` <span class="enum">${d.enum.map((v: unknown) => `<code>${text(v)}</code>`).join(" ")}</span>` : "";
    return (
      `<li><code>${text(name)}</code>${required.includes(name) ? "<b>*</b>" : ""} ` +
      `<span class="type">${text(schemaType(p))}</span>` +
      (d.description ? ` <span class="muted">${text(d.description)}</span>` : "") +
      values +
      schemaTree(spec, p, depth + 1, nextSeen) +
      `</li>`
    );
  });
  return `<ul class="props">${items.join("")}</ul>`;
}

function example(spec: Obj, media: Obj): string {
  const first = media.examples && typeof media.examples === "object" ? Object.values<Obj>(media.examples)[0]?.value : undefined;
  const value = media.example ?? first ?? deref(spec, media.schema)?.example;
  if (value === undefined) return "";
  try {
    const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return `<pre>${text(json.length > 2000 ? `${json.slice(0, 2000)}…` : json)}</pre>`;
  } catch (e) {
    log.debug("openapi", "example is not serializable", e);
    return "";
  }
}

/** One block per media type: its name, the schema type, the fields and an example. */
function media(spec: Obj, content: Obj | undefined, schema?: Obj): string {
  const entries: [string, Obj][] = content && typeof content === "object" ? Object.entries<Obj>(content) : schema ? [["", { schema }]] : [];
  return entries
    .map(([mime, m]) => {
      const head = [mime && `<code>${text(mime)}</code>`, m?.schema && `<span class="type">${text(schemaType(m.schema))}</span>`].filter(Boolean).join(" ");
      return `<div class="media">${head && `<div class="media-head">${head}</div>`}${schemaTree(spec, m?.schema)}${example(spec, m ?? {})}</div>`;
    })
    .join("");
}

function section(title: string, body: string): string {
  return body ? `<h4>${esc(title)}</h4>${body}` : "";
}

function parameters(params: Obj[]): string {
  const rows = params
    .filter((p) => p && typeof p === "object")
    .map((p) => {
      const type = schemaType(p.schema) || p.type;
      return (
        `<tr><td><code>${text(p.name ?? p.$ref)}</code>${p.required ? "<b>*</b>" : ""}</td>` +
        `<td>${text(p.in)}</td><td class="type">${text(type)}</td><td>${text(p.description)}</td></tr>`
      );
    })
    .join("");
  return rows ? `<table><tbody>${rows}</tbody></table>` : "";
}

function requestBody(spec: Obj, op: Obj, params: Obj[]): string {
  if (op.requestBody) return media(spec, deref(spec, op.requestBody)?.content);
  // Swagger 2.0: the body is a parameter with `in: body`.
  const body = params.map((p) => deref(spec, p)).find((p) => p?.in === "body");
  const types: string[] = Array.isArray(op.consumes) ? op.consumes : Array.isArray(spec.consumes) ? spec.consumes : [];
  if (body?.schema) return media(spec, Object.fromEntries((types.length ? types : [""]).map((c) => [c, { schema: body.schema }])));
  return types.map((c) => `<code>${text(c)}</code>`).join(" ");
}

function responses(spec: Obj, op: Obj): string {
  const rows = Object.entries<Obj>(op.responses ?? {})
    .map(([code, raw]) => {
      const r = deref(spec, raw) ?? {};
      const body = r.content ? media(spec, r.content) : r.schema ? media(spec, undefined, r.schema) : "";
      return `<tr><td><code class="code-${text(code)[0] ?? ""}">${text(code)}</code></td><td>${text(r.description)}${body}</td></tr>`;
    })
    .join("");
  return rows ? `<table><tbody>${rows}</tbody></table>` : "";
}

function operation({ method, path, op, shared }: Operation, spec: Obj): string {
  const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])];
  const plain = params.filter((p) => deref(spec, p)?.in !== "body");
  return (
    `<details class="op m-${method}${op.deprecated ? " deprecated" : ""}">` +
    `<summary><span class="method">${method.toUpperCase()}</span><code class="path">${text(path)}</code>` +
    `${op.deprecated ? ` <em>${esc(t("markupDeprecated"))}</em>` : ""}` +
    `<span class="summary">${text(op.summary)}</span></summary>` +
    `<div class="op-body">` +
    (op.description && op.description !== op.summary ? para(op.description, "muted") : "") +
    section(t("markupParameters"), parameters(plain)) +
    section(t("markupRequestBody"), requestBody(spec, op, params)) +
    section(t("markupResponses"), responses(spec, op)) +
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

export function renderOpenApi(doc: OpenApiDoc): string {
  const { spec } = doc;
  const info: Obj = spec.info ?? {};
  const urls = servers(spec);
  let html = `<h1>${text(info.title ?? "API")} <small>${text(info.version)}</small></h1>`;
  html += para(info.description);
  if (urls.length) {
    html += `<p><b>${esc(t("markupServers"))}</b> ${urls.map((u) => `<code>${text(u)}</code>`).join(" ")}</p>`;
  }

  const ops = operations(spec);
  if (!ops.length) return html + para(t("markupNoOperations"), "muted");
  const described = new Map<string, unknown>((Array.isArray(spec.tags) ? spec.tags : []).map((x: Obj) => [String(x?.name), x?.description]));
  for (const [tag, list] of groups(spec, ops)) {
    html += `<h2>${text(tag || t("markupDefaultGroup"))}</h2>${para(described.get(tag), "muted")}`;
    html += list.map((o) => operation(o, spec)).join("");
  }
  return html;
}

export function describeOpenApi(doc: OpenApiDoc): string {
  return `${doc.spec.openapi ? "OpenAPI" : "Swagger"} ${doc.version} · ${tp("markupOperations", doc.operations)}`;
}
