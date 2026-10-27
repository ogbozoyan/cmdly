/**
 * Pasted HTML / Markdown / OpenAPI → a rendered preview.
 * The preview is a complete document for a sandboxed iframe (see ui/command-bar.ts):
 * no scripts ever run, and the CSP blocks network access unless the user turned on remote resources.
 */
import { t } from "../i18n/index.ts";
import type { Preview, ResultItem } from "../shared/model.ts";
import { formatSize } from "./data-formats.ts";
import { renderMarkdown } from "./markdown.ts";
import { describeOpenApi, parseOpenApi, renderOpenApi } from "./openapi.ts";
import { OPENAPI_CSS } from "./openapi-style.ts";

export type MarkupKind = "html" | "markdown" | "openapi";

/** Above this the iframe would be slow and the paste is probably not meant as a document. */
export const MAX_MARKUP_BYTES = 512 * 1024;

const HTML_TAG =
  /<(?:!doctype|html|head|body|div|span|p|a|h[1-6]|ul|ol|li|table|tr|td|th|img|br|hr|pre|code|form|input|button|section|article|nav|header|footer|main|style|script|svg|b|i|em|strong|label|select|textarea)\b[^>]*>/i;

/** How sure we are that the text is HTML, 0..1: a document or several tags is certain, a lone tag ("<p>") is not a document. */
export function htmlScore(text: string): number {
  const s = text.trim();
  if (!s.startsWith("<") || !HTML_TAG.test(s) || /^<https?:\/\/[^>\s]*>$/i.test(s)) return 0;
  if (/^<(?:!doctype|html)\b/i.test(s)) return 1;
  const tags = s.match(new RegExp(HTML_TAG.source, "gi"))?.length ?? 0;
  return tags >= 2 ? 0.9 : 0.4;
}

const BASE_CSS = `
  :root { color-scheme: light; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; color: #1f2328; background: #fff; margin: 12px 16px; word-wrap: break-word; }
  pre { background: #f4f5f7; padding: 10px; border-radius: 6px; overflow: auto; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; background: #f4f5f7; padding: 1px 4px; border-radius: 4px; }
  pre code { padding: 0; background: none; }
  blockquote { margin: 0; padding: 0 12px; border-left: 3px solid #d0d7de; color: #57606a; }
  table { border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; vertical-align: top; }
  img { max-width: 100%; }
  hr { border: 0; border-top: 1px solid #d0d7de; }
  h1 small { font-size: 13px; color: #57606a; font-weight: 400; }
  .muted { color: #57606a; }
`;

function csp(remote: boolean): string {
  const net = remote ? " https: http:" : "";
  return (
    `default-src 'none'; style-src 'unsafe-inline'${net}; img-src data: blob:${net}; ` +
    `font-src data:${net}; media-src data:${net}; form-action 'none'; base-uri 'none'`
  );
}

/** <base> and meta refresh could redirect the frame, scripts never run anyway. */
function neutralize(html: string): string {
  return html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
}

/**
 * Wraps a fragment, or a full document. Our own doctype and the CSP come first, before any pasted text,
 * so nothing (a comment, <textarea>…) can hide the policy; the pasted doctype is dropped to stay in standards mode.
 */
export function htmlDocument(source: string, remote: boolean): string {
  const meta = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp(remote)}">`;
  const html = neutralize(source).replace(/^\s*<!doctype[^>]*>/i, "");
  if (/<html\b/i.test(html)) return `<!doctype html>${meta}${html}`;
  return `<!doctype html>${meta}<style>${BASE_CSS}</style>${html}`;
}

function bodyDocument(body: string, css = ""): string {
  return htmlDocument(`<!doctype html><html><head><style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`, false);
}

export interface MarkupOptions {
  /** Settings.features.markupRemote */
  remote?: boolean;
}

const LABELS = { html: "markupLabelHtml", markdown: "markupLabelMarkdown", openapi: "markupLabelOpenApi" } as const;
const TITLES = { html: "markupHtml", markdown: "markupMarkdown", openapi: "markupOpenApi" } as const;

export function markupLabel(kind: MarkupKind): string {
  return t(LABELS[kind]);
}

/** Builds the preview, or null when the text doesn't fit the kind (e.g. "swagger" mode with a plain JSON). */
export function markupPreview(kind: MarkupKind, text: string, options: MarkupOptions = {}): Preview | null {
  const remote = !!options.remote;
  if (kind === "openapi") {
    const doc = parseOpenApi(text);
    return doc && { language: "html", label: doc.kind === "asyncapi" ? "AsyncAPI" : markupLabel(kind), content: bodyDocument(renderOpenApi(doc), OPENAPI_CSS) };
  }
  const content =
    kind === "html"
      ? htmlDocument(text, remote)
      : htmlDocument(`<!doctype html><html><head><style>${BASE_CSS}</style></head><body>${renderMarkdown(text, { remote })}</body></html>`, remote);
  return { language: "html", label: markupLabel(kind), content };
}

export function markupResult(kind: MarkupKind, text: string, options: MarkupOptions = {}): ResultItem[] {
  const bytes = new TextEncoder().encode(text).length;
  const doc = kind === "openapi" ? parseOpenApi(text) : null;
  const meta = doc ? describeOpenApi(doc) : markupLabel(kind);
  const title = doc?.kind === "asyncapi" ? t("markupAsyncApi") : t(TITLES[kind]);
  const row = (preview?: Preview, extra = ""): ResultItem => ({
    kind: "tool",
    title,
    meta: `${meta} · ${formatSize(text)}${extra}`,
    copy: text,
    glyph: kind === "openapi" ? "braces" : "code",
    action: t("actionCopy"),
    preview,
  });
  if (bytes > MAX_MARKUP_BYTES) return [row(undefined, ` · ${t("markupTooLarge")}`)];
  const preview = markupPreview(kind, text, options);
  return preview ? [row(preview)] : [];
}
