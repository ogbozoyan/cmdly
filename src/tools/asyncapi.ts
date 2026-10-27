/**
 * AsyncAPI 2.x / 3.x rendering, in the same visual language as the OpenAPI one (see openapi.ts).
 * Channels play the role of tags and paths; an operation is "who may publish or subscribe, and which message".
 * Pure functions, nothing is fetched: only local `$ref`s are followed.
 */
import { t } from "../i18n/index.ts";
import { escapeHtml as esc } from "../shared/escape.ts";
import { deref, facts, para, schemas, schemaTabs, sectionHead, text, typeLabel, type Ctx, type Obj } from "./api-schema.ts";

export interface AsyncOperation {
  /** PUB/SUB in 2.x, RECEIVE/SEND in 3.x: the badge. */
  label: string;
  /** The application receives the message (2.x `publish`, 3.x `receive`). */
  incoming: boolean;
  address: string;
  channel: Obj;
  op: Obj;
  messages: unknown[];
}

const isV3 = (spec: Obj) => String(spec.asyncapi).startsWith("3");

export function asyncOperations(spec: Obj): AsyncOperation[] {
  const out: AsyncOperation[] = [];
  if (isV3(spec)) {
    for (const [id, raw] of Object.entries<Obj>(spec.operations ?? {})) {
      const op = deref(spec, raw);
      if (!op) continue;
      const channel = deref(spec, op.channel) ?? {};
      const address = String(channel.address ?? String(op.channel?.$ref ?? "").split("/").pop() ?? id);
      const messages = Array.isArray(op.messages) ? op.messages : Object.values(channel.messages ?? {});
      out.push({ label: op.action === "send" ? "SEND" : "RECEIVE", incoming: op.action !== "send", address, channel, op: { operationId: id, ...op }, messages });
    }
    return out;
  }
  for (const [address, raw] of Object.entries<Obj>(spec.channels ?? {})) {
    const channel = deref(spec, raw);
    if (!channel) continue;
    for (const kind of ["publish", "subscribe"]) {
      const op = channel[kind];
      if (!op || typeof op !== "object") continue;
      const messages = Array.isArray(op.message?.oneOf) ? op.message.oneOf : op.message ? [op.message] : [];
      out.push({ label: kind === "publish" ? "PUB" : "SUB", incoming: kind === "publish", address, channel, op, messages });
    }
  }
  return out;
}

/** A message with its traits folded in (the message's own fields win). */
function resolveMessage(spec: Obj, raw: unknown): Obj {
  const m = deref(spec, raw) ?? {};
  const traits = (Array.isArray(m.traits) ? m.traits : []).map((x: unknown) => deref(spec, x)).filter(Boolean);
  return Object.assign({}, ...traits, m);
}

function messageBlock(ctx: Ctx, raw: unknown): string {
  const m = resolveMessage(ctx.spec, raw);
  const first = Array.isArray(m.examples) ? m.examples[0] : undefined;
  const contentType = m.contentType ?? ctx.spec.defaultContentType;
  const title = m.title ?? m.name;
  return (
    `<div class="msg-head">${title ? `<b>${text(title)}</b>` : ""}${contentType ? `<span class="mime">${text(contentType)}</span>` : ""}</div>` +
    para(m.summary, "opdesc") +
    (m.description && m.description !== m.summary ? para(m.description, "opdesc") : "") +
    (m.payload ? sectionHead(t("markupPayload")) + `<div class="sec-body">${schemaTabs(ctx, m.payload, first?.payload)}</div>` : "") +
    (m.headers ? sectionHead(t("markupHeaders")) + `<div class="sec-body">${schemaTabs(ctx, m.headers, first?.headers)}</div>` : "")
  );
}

function operation(ctx: Ctx, { label, incoming, address, op, messages }: AsyncOperation): string {
  return (
    `<details class="op ${incoming ? "m-pub" : "m-sub"}">` +
    // The channel's address is already the heading above; the operation is named by its id, as in AsyncAPI Studio.
    `<summary><span class="method">${label}</span><span class="path">${text(op.operationId ?? address)}</span>` +
    `<span class="sum">${text(op.summary ?? op.title)}</span></summary>` +
    `<div class="op-body">` +
    (op.description && op.description !== op.summary ? para(op.description, "opdesc") : "") +
    messages.map((m) => `<div class="msg">${messageBlock(ctx, m)}</div>`).join("") +
    `</div></details>`
  );
}

/** Channel parameters ("{streetlightId}" in the address) as a small Name | Description table. */
function channelParameters(ctx: Ctx, channel: Obj): string {
  const rows = Object.entries<Obj>(channel.parameters ?? {})
    .map(([name, raw]) => {
      const d = deref(ctx.spec, raw) ?? {};
      return (
        `<tr><td class="pn"><div class="pname">${text(name)}</div><div class="ptype">${text(typeLabel(d.schema) || "string")}</div></td>` +
        `<td>${d.description ? `<p>${text(d.description)}</p>` : ""}${facts(d.schema ?? d)}</td></tr>`
      );
    })
    .join("");
  if (!rows) return "";
  return `<table class="grid"><thead><tr><th>${esc(t("markupName"))}</th><th>${esc(t("markupDescription"))}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function servers(spec: Obj): string {
  const items = Object.entries<Obj>(spec.servers && typeof spec.servers === "object" ? spec.servers : {}).map(([name, raw]) => {
    const s = deref(spec, raw) ?? {};
    const url = String(s.url ?? (s.host ? `${s.host}${s.pathname ?? ""}` : ""));
    const full = url.includes("://") || !s.protocol ? url : `${s.protocol}://${url}`;
    return `<div class="srv"><b>${text(name)}</b> ${text(full)}${s.description ? `<small>${text(s.description)}</small>` : ""}</div>`;
  });
  return items.length ? `<div class="servers"><span class="lbl">${esc(t("markupServers"))}</span>${items.join("")}</div>` : "";
}

export function renderAsyncApi(doc: { version: string; spec: Obj }): string {
  const { spec } = doc;
  const ctx: Ctx = { spec, tabs: 0 };
  const info: Obj = spec.info ?? {};
  let html =
    `<h1>${text(info.title ?? "API")}` +
    (info.version ? ` <span class="pill">${text(info.version)}</span>` : "") +
    ` <span class="pill oas">AsyncAPI ${text(doc.version.split(".").slice(0, 2).join("."))}</span></h1>` +
    para(info.description, "desc") +
    servers(spec);

  const ops = asyncOperations(spec);
  if (!ops.length) return `<div class="oas">${html}${para(t("markupNoOperations"), "muted")}</div>`;
  const byChannel = new Map<string, AsyncOperation[]>();
  for (const o of ops) byChannel.set(o.address, [...(byChannel.get(o.address) ?? []), o]);
  for (const [address, list] of byChannel) {
    const { channel } = list[0];
    // <wbr> lets a long topic name wrap after a dot instead of in the middle of a word.
    html += `<h2 class="tag"><span class="chan">${text(address).replace(/\./g, ".<wbr>")}</span>${channel.description ? `<small>${text(channel.description)}</small>` : ""}</h2>`;
    html += channelParameters(ctx, channel);
    html += list.map((o) => operation(ctx, o)).join("");
  }
  return `<div class="oas">${html}${schemas(ctx)}</div>`;
}
