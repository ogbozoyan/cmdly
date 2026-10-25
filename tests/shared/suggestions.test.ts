import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResultItem } from "../../src/shared/model.ts";
import { maySuggest, parseSuggestions, suggestionRows, suggestUrl, withSuggestions } from "../../src/shared/suggestions.ts";

test("engine URLs encode the query", () => {
  assert.equal(suggestUrl("google", "c++ & go"), "https://suggestqueries.google.com/complete/search?client=chrome&q=c%2B%2B%20%26%20go");
  assert.match(suggestUrl("duckduckgo", "x"), /^https:\/\/duckduckgo\.com\/ac\/\?q=x/);
  assert.match(suggestUrl("bing", "x"), /api\.bing\.com/);
  assert.match(suggestUrl("yandex", "x"), /suggest\.yandex\.com/);
});

test("only typed text is sent — never pasted data or secrets", () => {
  assert.ok(maySuggest("how to center a div"));
  assert.ok(maySuggest("github"));
  for (const q of [
    "a",
    '{"a": 1}',
    "line1\nline2",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
    "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789",
    "uuid 5",
    "b64 secret",
    "12 * (3 + 4)",
    "x".repeat(81),
  ]) assert.equal(maySuggest(q), false, q);
});

test("parses OpenSearch answers and survives garbage", () => {
  assert.deepEqual(parseSuggestions(["git", ["github", "", 3, "gitlab"]]), ["github", "gitlab"]);
  assert.deepEqual(parseSuggestions({ error: 1 }), []);
  assert.deepEqual(parseSuggestions(null), []);
});

test("rows skip the query, duplicates, and turn addresses into Open rows", () => {
  const rows = suggestionRows("Git", ["git", "github", "GitHub", "https://github.com/", "github.com", "gitlab"], 3);
  assert.deepEqual(rows.map((r) => [r.kind, r.title]), [["search", "github"], ["url", "github.com"], ["search", "gitlab"]]);
  assert.equal(rows[1].url, "https://github.com/");
  assert.ok(rows.every((r) => r.suggestion));
});

test("suggestions go after the web search row and its commands", () => {
  const merged = withSuggestions(
    [
      { kind: "search", title: "close oth" },
      { kind: "command", title: "Close Other Tabs" },
      { kind: "tab", title: "Docs", url: "https://docs.example" },
    ],
    [{ kind: "search", title: "close other tabs chrome", suggestion: true }],
  );
  assert.deepEqual(merged.map((i) => i.title), ["close oth", "Close Other Tabs", "close other tabs chrome", "Docs"]);
});

test("suggestions go right under the web search row, without repeats", () => {
  const items: ResultItem[] = [
    { kind: "search", title: "git", action: "Search" },
    { kind: "tab", title: "GitHub", url: "https://github.com/" },
  ];
  const merged = withSuggestions(items, [
    { kind: "search", title: "git", suggestion: true },
    { kind: "search", title: "github desktop", suggestion: true },
    { kind: "url", title: "github.com", url: "https://github.com/", suggestion: true },
  ]);
  assert.deepEqual(merged.map((i) => i.title), ["git", "github desktop", "GitHub"]);
});
