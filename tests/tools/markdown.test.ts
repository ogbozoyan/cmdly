import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "../../src/tools/markdown.ts";

test("raw HTML and unsafe links stay inert", () => {
  const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) ![i](https://x.y/a.png)');
  assert.doesNotMatch(html, /<script|<img|href="javascript/);
});
