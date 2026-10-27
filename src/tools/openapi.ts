/**
 * OpenAPI 3.x / Swagger 2.0 detection and a rendering modelled on Swagger UI / Swagger Editor
 * (https://editor.swagger.io); an AsyncAPI document pasted into the same mode goes to asyncapi.ts.
 * Pure functions; the preview runs no scripts, so the "Example Value | Schema" tabs are radio buttons
 * styled in openapi-style.ts.
 */
import { t, tp } from "../i18n/index.ts";
import { escapeHtml as esc } from "../shared/escape.ts";
import { deref, facts, para, schemas, schemaTabs, sectionHead, text, typeLabel, type Ctx, type Obj } from "./api-schema.ts";
import { asyncOperations, renderAsyncApi } from "./asyncapi.ts";
import { parseData } from "./data-formats.ts";

export interface OpenApiDoc {
  kind: "openapi" | "asyncapi";
  version: string;
  spec: Obj;
  operations: number;
}

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

const isObject = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseOpenApi(text: string): OpenApiDoc | null {
  const data = parseData(text);
  if (!data || Array.isArray(data.value)) return null;
  const spec = data.value as Obj;
  if (spec.asyncapi != null && isObject(spec.channels)) {
    return { kind: "asyncapi", version: String(spec.asyncapi), spec, operations: asyncOperations(spec).length };
  }
  const version = spec.openapi ?? spec.swagger;
  if (version == null || !isObject(spec.paths)) return null;
  return { kind: "openapi", version: String(version), spec, operations: operations(spec).length };
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

function servers(spec: Obj): string[] {
  if (Array.isArray(spec.servers)) return spec.servers.map((s: Obj) => String(s?.url ?? "")).filter(Boolean);
  if (spec.host) {
    const schemes: string[] = Array.isArray(spec.schemes) && spec.schemes.length ? spec.schemes : ["https"];
    return schemes.map((s) => `${s}://${spec.host}${spec.basePath ?? ""}`);
  }
  return [];
}

/** One block per media type: its name and the Example Value | Schema tabs. */
function mediaBlock(ctx: Ctx, mime: string, m: Obj | undefined): string {
  const schema = m?.schema;
  if (!schema && m?.example === undefined) return mime ? `<div class="mime">${text(mime)}</div>` : "";
  const named = m?.examples && typeof m.examples === "object" ? Object.values<Obj>(m.examples)[0]?.value : undefined;
  return `<div class="media">${mime ? `<div class="mime">${text(mime)}</div>` : ""}${schemaTabs(ctx, schema, m?.example ?? named)}</div>`;
}

function media(ctx: Ctx, content: Obj | undefined, schema?: Obj): string {
  if (content && typeof content === "object") return Object.entries<Obj>(content).map(([mime, m]) => mediaBlock(ctx, mime, m)).join("");
  return schema ? mediaBlock(ctx, "", { schema }) : "";
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

export function renderOpenApi(doc: OpenApiDoc): string {
  if (doc.kind === "asyncapi") return renderAsyncApi(doc);
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
  return `${doc.kind === "asyncapi" ? "AsyncAPI" : doc.spec.openapi ? "OpenAPI" : "Swagger"} ${doc.version} · ${tp("markupOperations", doc.operations)}`;
}
