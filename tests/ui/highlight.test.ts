import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, highlightJson, highlightYaml } from "../../src/ui/highlight.ts";

test("JSON tokens get classes", () => {
  const html = highlightJson('{"a": "x", "n": 1.5, "ok": true, "z": null}');
  assert.match(html, /<span class="tok-key">&quot;a&quot;<\/span>:/);
  assert.match(html, /<span class="tok-string">&quot;x&quot;<\/span>/);
  assert.match(html, /<span class="tok-number">1.5<\/span>/);
  assert.match(html, /<span class="tok-bool">true<\/span>/);
  assert.match(html, /<span class="tok-null">null<\/span>/);
});

test("YAML keys, values and comments get classes", () => {
  const html = highlightYaml("# config\nname: cmdly\nport: 8080\nlist:\n  - true");
  assert.match(html, /<span class="tok-comment"># config<\/span>/);
  assert.match(html, /<span class="tok-key">name<\/span>: <span class="tok-string">cmdly<\/span>/);
  assert.match(html, /<span class="tok-number">8080<\/span>/);
  assert.match(html, /- <span class="tok-bool">true<\/span>/);
});

test("pasted HTML can never become markup", () => {
  const evil = '<img src=x onerror=alert(1)>';
  for (const html of [highlightJson(`{"k": "${evil}"}`), highlightYaml(`k: ${evil}`), highlightYaml(`${evil}: v`)]) {
    assert.equal(html.includes("<img"), false, html);
  }
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
});

test("text outside tokens is preserved", () => {
  const code = '{\n  "a": [1, 2]\n}';
  assert.equal(highlightJson(code).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"'), code);
});
