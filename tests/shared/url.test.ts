import assert from "node:assert/strict";
import { test } from "node:test";
import { score } from "../../src/background/scoring.ts";
import { looksLikeUrl, shortUrl, toUrl } from "../../src/shared/url.ts";

test("detects URLs", () => {
  for (const q of ["github.com", "https://x.io/a", "localhost:3000", "192.168.0.1/admin", "docs.google.com/d/1"]) {
    assert.equal(looksLikeUrl(q), true, q);
  }
  for (const q of ["how to change oil", "hello", "2+2", "v1.2"]) {
    assert.equal(looksLikeUrl(q), false, q);
  }
});

test("normalizes URLs", () => {
  assert.equal(toUrl("github.com"), "https://github.com");
  assert.equal(toUrl("http://x.io"), "http://x.io");
  assert.equal(shortUrl("https://www.github.com/"), "github.com");
});

test("scoring: every word must match, title prefix ranks highest", () => {
  assert.equal(score("git", "GitHub", "https://github.com"), 5);
  assert.equal(score("hub", "GitHub", "https://github.com"), 3);
  assert.equal(score("git lab", "GitHub", "https://github.com"), 0);
  assert.ok(score("jira", "Jira board", "") > score("jira", "Open in jira", ""));
});
