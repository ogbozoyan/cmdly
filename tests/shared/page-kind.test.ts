import assert from "node:assert/strict";
import { test } from "node:test";
import { pageKind } from "../../src/shared/page-kind.ts";

test("pages where Chrome forbids extension scripts are told apart from ordinary sites", () => {
  assert.equal(pageKind("https://example.com/a"), "web");
  assert.equal(pageKind("https://chromewebstore.google.com/detail/x"), "webstore");
  assert.equal(pageKind("https://chrome.google.com/webstore/detail/x"), "webstore");
  assert.equal(pageKind("https://chrome.google.com/other"), "web");
  assert.equal(pageKind("file:///tmp/a.html"), "file");
  assert.equal(pageKind("chrome://extensions"), "browser");
  assert.equal(pageKind(""), "other");
});
