/** OpenAPI 3.x / Swagger 2.0 detection and a compact HTML rendering. Pure functions. */
import { t, tp } from "../i18n/index.ts";
import { escapeHtml as esc } from "../shared/escape.ts";
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

function operations(spec: Obj): { method: string; path: string; op: Obj; shared: Obj[] }[] {
  const out = [];
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

function schemaType(schema: Obj | undefined): string {
  if (!schema || typeof schema !== "object") return "";
  if (schema.$ref) return String(schema.$ref).split("/").pop() ?? "";
  if (schema.type === "array") return `${schemaType(schema.items) || "any"}[]`;
  return String(schema.type ?? "object");
}

function parameters(params: Obj[]): string {
  if (!params.length) return "";
  const rows = params
    .filter((p) => p && typeof p === "object")
    .map((p) => {
      const type = schemaType(p.schema) || text(p.type);
      return (
        `<tr><td><code>${text(p.name ?? p.$ref)}</code>${p.required ? "<b>*</b>" : ""}</td>` +
        `<td>${text(p.in)}</td><td>${text(type)}</td><td>${text(p.description)}</td></tr>`
      );
    })
    .join("");
  return `<h4>${esc(t("markupParameters"))}</h4><table><tbody>${rows}</tbody></table>`;
}

function requestBody(op: Obj): string {
  const types = op.requestBody?.content ? Object.keys(op.requestBody.content) : Array.isArray(op.consumes) ? op.consumes : [];
  if (!types.length) return "";
  return `<h4>${esc(t("markupRequestBody"))}</h4><p>${types.map((c: string) => `<code>${text(c)}</code>`).join(" ")}</p>`;
}

function responses(op: Obj): string {
  const entries = Object.entries<Obj>(op.responses ?? {});
  if (!entries.length) return "";
  const rows = entries
    .map(([code, r]) => `<tr><td><code>${text(code)}</code></td><td>${text(r?.description)}</td></tr>`)
    .join("");
  return `<h4>${esc(t("markupResponses"))}</h4><table><tbody>${rows}</tbody></table>`;
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
  for (const { method, path, op, shared } of ops) {
    const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])];
    html +=
      `<section class="op${op.deprecated ? " deprecated" : ""}">` +
      `<h3><span class="method m-${method}">${method.toUpperCase()}</span> <code>${text(path)}</code>` +
      `${op.deprecated ? ` <em>${esc(t("markupDeprecated"))}</em>` : ""}</h3>` +
      para(op.summary) +
      (op.description && op.description !== op.summary ? para(op.description, "muted") : "") +
      parameters(params) +
      requestBody(op) +
      responses(op) +
      `</section>`;
  }
  return html;
}

export function describeOpenApi(doc: OpenApiDoc): string {
  return `${doc.spec.openapi ? "OpenAPI" : "Swagger"} ${doc.version} · ${tp("markupOperations", doc.operations)}`;
}
