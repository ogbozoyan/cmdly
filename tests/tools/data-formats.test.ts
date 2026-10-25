import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.ts";
import { describeData, formatSize, parseData, toYaml } from "../../src/tools/data-formats.ts";
import { jwtTimeNotes } from "../../src/tools/dev-tools.ts";
import { localResults } from "../../src/tools/local-results.ts";

const features = DEFAULT_SETTINGS.features;
const titles = (q: string) => localResults(q, features).map((r) => r.title);

test("detects JSON objects and arrays", () => {
  assert.equal(parseData('{"a":1}')?.format, "json");
  assert.equal(parseData("  [1, 2, 3]  ")?.format, "json");
  assert.deepEqual(parseData('{"a":{"b":[1,2]}}')?.value, { a: { b: [1, 2] } });
});

test("detects multi-line YAML only", () => {
  assert.equal(parseData("name: cmdly\nversion: 1")?.format, "yaml");
  assert.deepEqual(parseData("- a\n- b")?.value, ["a", "b"]);
  // One-line "key: value" is a normal search, not YAML.
  assert.equal(parseData("error: timeout"), null);
});

test("plain text, scalars and broken input are not data", () => {
  for (const q of ["hello", "42", "how to\nchange oil", '"just a string"', "{broken", "[1, 2", "key: [unclosed\nother: 1"]) {
    assert.equal(parseData(q), null, q);
  }
});

test("JSON rows: format, minify, convert to YAML — all expandable", () => {
  const rows = localResults('{"name":"cmdly","tags":["a","b"]}', features);
  assert.deepEqual(rows.map((r) => r.title), ["Format JSON", "Minify JSON", "Convert to YAML"]);
  assert.equal(rows[0].copy, '{\n  "name": "cmdly",\n  "tags": [\n    "a",\n    "b"\n  ]\n}');
  assert.equal(rows[1].copy, '{"name":"cmdly","tags":["a","b"]}');
  assert.equal(rows[2].copy, "name: cmdly\ntags:\n  - a\n  - b");
  assert.ok(rows.every((r) => r.preview));
  assert.equal(rows[2].preview!.language, "yaml");
  assert.match(rows[0].meta!, /^object · 2 keys · \d+ B$/);
});

test("YAML rows: format and convert to JSON", () => {
  const rows = localResults("name: cmdly\nport: 8080\nenabled: true", features);
  assert.deepEqual(rows.map((r) => r.title), ["Format YAML", "Convert to JSON"]);
  assert.deepEqual(JSON.parse(rows[1].copy!), { name: "cmdly", port: 8080, enabled: true });
});

test("viewer can be switched off", () => {
  assert.deepEqual(localResults('{"a":1}', { ...features, formats: false }), []);
});

test("normal queries are unaffected", () => {
  assert.deepEqual(titles("github"), []);
});

test("JWT rows are expandable with human-readable dates", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiI0MiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ." +
    "c2ln";
  const [payload] = localResults(jwt, features);
  assert.equal(payload.preview!.language, "json");
  assert.equal(payload.preview!.notes!.length, 2);
  assert.match(payload.preview!.notes![0], /^Issued \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.match(payload.preview!.notes![1], /^Expires .* \(expired\)$/);
  assert.deepEqual(jwtTimeNotes({ exp: 1700000000 }, 0).map((n) => n.endsWith("(expired)")), [false]);
});

test("decoded Base64 that is JSON gets a viewer", () => {
  const [row] = localResults("unb64 eyJhIjoxfQ==", features);
  assert.equal(row.copy, '{"a":1}');
  assert.equal(row.preview!.content, '{\n  "a": 1\n}');
});

test("helpers", () => {
  assert.equal(describeData([1]), "array · 1 item");
  assert.equal(describeData({ a: 1, b: 2 }), "object · 2 keys");
  assert.equal(formatSize("x".repeat(2048)), "2.0 KB");
  assert.equal(toYaml({ a: "long ".repeat(40).trim() }).includes("\n"), false); // no line folding
});
