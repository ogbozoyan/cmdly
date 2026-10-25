import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResultItem } from "../../src/shared/model.ts";
import { withWebSearch } from "../../src/ui/results.ts";

const tool = (title: string): ResultItem => ({ kind: "tool", title, copy: title });
const tab = (title: string): ResultItem => ({ kind: "tab", title, url: `https://${title}` });

test("adds web search after tool rows when the background returned nothing", () => {
  const items = withWebSearch([tool("Format JSON"), tool("Minify JSON")], '{"a":1}');
  assert.deepEqual(items.map((i) => i.kind), ["tool", "tool", "search"]);
  assert.equal(items[2].title, '{"a":1}');
});

test("adds web search between tool rows and tabs", () => {
  const items = withWebSearch([{ kind: "calc", title: "= 4", copy: "4" }, tab("github.com")], "2+2");
  assert.deepEqual(items.map((i) => i.kind), ["calc", "search", "tab"]);
});

test("adds web search even to an empty list", () => {
  assert.deepEqual(withWebSearch([], "hello").map((i) => i.kind), ["search"]);
});

test("keeps the background's own search row and order", () => {
  const items: ResultItem[] = [{ kind: "url", title: "x.io", url: "https://x.io" }, { kind: "search", title: "x.io" }];
  assert.equal(withWebSearch(items, "x.io"), items);
});

test("empty query → no search row", () => {
  assert.deepEqual(withWebSearch([tab("a")], ""), [tab("a")]);
});
