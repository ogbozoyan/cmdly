import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlDocument } from "../../src/tools/markup.ts";

test("pasted HTML gets a CSP first; base, refresh and scripts are removed", () => {
  const doc = htmlDocument('<!doctype html><html><head><base href="//evil"><meta http-equiv="refresh" content="0;url=//e"><title>t</title></head><body><script>1</script>hi</body></html>', false);
  assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("<title>"));
  assert.doesNotMatch(doc, /<base|refresh|<script/i);
  assert.doesNotMatch(htmlDocument("<p>x</p>", false).match(/content="([^"]+)"/)![1], /https:/);
});

test("the CSP cannot be hidden by pasted text and the page stays in standards mode", () => {
  const doc = htmlDocument("<!doctype html><!-- <head> --><img src=https://evil.example/x.png>", false);
  assert.ok(doc.startsWith("<!doctype html><meta"));
  assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf("<!--"));
  assert.equal(doc.match(/<!doctype/gi)!.length, 1);
});
