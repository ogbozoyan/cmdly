import assert from "node:assert/strict";
import { test } from "node:test";
import { boost, MAX_QUERIES, record, type Learned } from "../../src/shared/learned.ts";
import { rank, TOP_HIT } from "../../src/shared/ranking.ts";

const now = Date.UTC(2026, 9, 27);
const WEEK = 7 * 86_400_000;

test("a repeated choice gets the full boost, which fades with time", () => {
  let data: Learned = {};
  data = record(data, "Pass", "cmd:page-passwords", now);
  data = record(data, "pass", "cmd:page-passwords", now);
  assert.equal(data.pass["cmd:page-passwords"].hits, 2);
  assert.equal(boost(data, "pass", "cmd:page-passwords", now), 25);
  assert.ok(boost(data, "pass", "cmd:page-passwords", now + 8 * WEEK) < 5);
  assert.equal(boost(data, "pass", "cmd:other", now), 0);
});

test("a shorter typed prefix borrows from longer stored queries", () => {
  const data = record({}, "pass", "x", now);
  assert.ok(Math.abs(boost(data, "pa", "x", now) - 25 * Math.sqrt(2 / 4)) < 0.01);
  assert.equal(boost(data, "pz", "x", now), 0);
  assert.equal(boost(data, "", "x", now), 0);
});

test("the oldest query is evicted past the limit", () => {
  let data: Learned = {};
  for (let i = 0; i <= MAX_QUERIES; i++) data = record(data, `q${i}`, "x", now + i);
  assert.equal(Object.keys(data).length, MAX_QUERIES);
  assert.ok(!("q0" in data));
});

test("a learned item that is not a candidate never becomes a row", () => {
  const data = record({}, "pin", "cmd:gone", now);
  assert.ok(boost(data, "pin", "cmd:gone", now) > 0);
  assert.deepEqual(rank("pin", []), []);
});

test("a learned command becomes the top hit", () => {
  const data = record(record({}, "co", "cmd:copy-url", now), "co", "cmd:copy-url", now);
  const learned = boost(data, "co", "cmd:copy-url", now);
  const ranked = rank("co", [
    { item: "copy", source: "command", fields: [{ text: "Copy URL", weight: 1 }], frecency: 0, learned, title: "Copy URL", recency: 0, id: "cmd:copy-url" },
  ]);
  assert.ok(ranked[0].final >= TOP_HIT);
});
