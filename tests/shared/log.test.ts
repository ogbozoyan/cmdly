import assert from "node:assert/strict";
import { test } from "node:test";
import { LogRing, describeError, entrySize, formatReport, kv, logFileName, shouldRecord, type LogEntry } from "../../src/shared/log.ts";

const entry = (n: number): LogEntry => ({ at: n, level: "error", scope: "x", message: `m${n}` });

test("the ring keeps only the newest entries that fit the byte budget", () => {
  const budget = 16 * 1024;
  const ring = new LogRing(budget);
  let dropped = 0;
  for (let i = 0; i < 5000; i++) dropped += ring.push(entry(i));
  const entries = ring.toArray();
  const total = entries.reduce((n, e) => n + entrySize(e), 0);
  assert.equal(total, ring.size);
  assert.ok(total <= budget && total > budget - 100, `total ${total}`);
  assert.equal(entries.at(-1)!.message, "m4999");
  assert.equal(dropped + entries.length, 5000);
});

test("shrinking the ring drops the oldest; one huge entry is still kept", () => {
  const ring = new LogRing(1024, [entry(1), entry(2), entry(3)]);
  assert.equal(ring.resize(entrySize(entry(3))), 2);
  assert.deepEqual(ring.toArray().map((e) => e.message), ["m3"]);
  ring.push({ ...entry(4), detail: "x".repeat(5000) });
  assert.deepEqual(ring.toArray().map((e) => e.message), ["m4"]);
});

test("fields: key=value, strings quoted only when they contain spaces, undefined skipped", () => {
  assert.equal(kv({ tab: 12, state: "fullscreen", ok: true, why: "no tab", skip: undefined }), 'tab=12 state=fullscreen ok=true why="no tab"');
});

test("debug entries are kept only in verbose mode", () => {
  assert.equal(shouldRecord("debug", false), false);
  assert.equal(shouldRecord("info", false), true);
  assert.equal(shouldRecord("debug", true), true);
});

test("export file name has a sortable timestamp", () => {
  assert.equal(logFileName(Date.UTC(2026, 9, 27, 18, 3, 5)), "cmdly-log-2026-10-27-180305.txt");
});

test("report: environment, scope, message and indented stack", () => {
  const text = formatReport("Cmdly 1 · Chrome 2 · macOS", [{ ...entry(0), detail: "Error: boom\n  at a" }]);
  assert.match(text, /^Cmdly 1 · Chrome 2 · macOS\n1 log entries/);
  assert.match(text, /ERROR \[x\] m0\n {4}Error: boom\n {4} {2}at a/);
  assert.equal(describeError(undefined), undefined);
});
