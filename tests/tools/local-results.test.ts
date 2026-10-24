import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/shared/settings.ts";
import { base64Decode, describeJwt } from "../../src/tools/dev-tools.ts";
import { localResults } from "../../src/tools/local-results.ts";

const all = DEFAULT_SETTINGS.features;
const run = (q: string, features = all) => localResults(q, features);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// {"alg":"HS256","typ":"JWT"} . {"sub":"42","name":"Ann","exp":1700000000}
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiI0MiIsIm5hbWUiOiJBbm4iLCJleHAiOjE3MDAwMDAwMDB9." +
  "c2lnbmF0dXJl";

test("calculator row", () => {
  const [row] = run("2+2");
  assert.equal(row.kind, "calc");
  assert.equal(row.title, "= 4");
  assert.equal(row.copy, "4");
});

test("uuid", () => {
  const [one] = run("uuid");
  assert.match(one.copy!, UUID);
  assert.equal(one.meta, "UUID v4");

  const ids = run("uuid 5")[0].copy!.split("\n");
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  ids.forEach((id) => assert.match(id, UUID));

  assert.equal(run("guid")[0].meta, "UUID v4");
  assert.equal(run("uuid 99")[0].copy!.split("\n").length, 50);
  assert.deepEqual(run("uuid generator online"), []);
});

test("base64 round trip with unicode", () => {
  assert.equal(run("b64 hello")[0].copy, "aGVsbG8=");
  assert.equal(run("unb64 aGVsbG8=")[0].copy, "hello");
  const encoded = run("b64 привет")[0].copy!;
  assert.equal(run(`unb64 ${encoded}`)[0].copy, "привет");
  assert.equal(base64Decode("aGVsbG8"), "hello"); // no padding
  assert.equal(base64Decode("not base64!"), null);
});

test("url encode / decode", () => {
  assert.equal(run("url a b&c")[0].copy, "a%20b%26c");
  assert.equal(run("unurl a%20b%26c")[0].copy, "a b&c");
  assert.equal(run("q%3Dhello%20world")[0].copy, "q=hello world");
});

test("tool prefixes don't hijack normal searches", () => {
  assert.deepEqual(run("url shortener"), []);
  assert.deepEqual(run("decode meaning"), []);
  assert.deepEqual(run("how to change oil"), []);
});

test("jwt", () => {
  const rows = run(JWT);
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(rows[0].copy!), { sub: "42", name: "Ann", exp: 1700000000 });
  assert.match(rows[0].meta!, /^JWT payload · sub 42 · expired /);
  assert.deepEqual(JSON.parse(rows[1].copy!), { alg: "HS256", typ: "JWT" });
  assert.equal(run("Bearer " + JWT).length, 2);
  assert.match(describeJwt({ exp: 1700000000 }, 0), /expires/);
});

test("features can be switched off", () => {
  assert.deepEqual(run("2+2", { ...all, calculator: false }), []);
  assert.deepEqual(run("uuid", { ...all, uuid: false }), []);
  assert.deepEqual(run("b64 hello", { ...all, encode: false }), []);
  assert.deepEqual(run(JWT, { ...all, jwt: false }), []);
});
