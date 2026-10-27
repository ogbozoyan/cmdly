import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ENTRIES, appendEntry, describeError, formatReport, type LogEntry } from "../../src/shared/log.ts";

const entry = (n: number): LogEntry => ({ at: n, level: "error", scope: "x", message: `m${n}` });

test("the buffer keeps only the newest entries", () => {
  let entries: LogEntry[] = [];
  for (let i = 0; i < MAX_ENTRIES + 5; i++) entries = appendEntry(entries, entry(i));
  assert.equal(entries.length, MAX_ENTRIES);
  assert.equal(entries[0].message, "m5");
});

test("report: environment, scope, message and indented stack", () => {
  const text = formatReport("Cmdly 1 · Chrome 2 · macOS", [{ ...entry(0), detail: "Error: boom\n  at a" }]);
  assert.match(text, /^Cmdly 1 · Chrome 2 · macOS\n1 log entries/);
  assert.match(text, /ERROR \[x\] m0\n {4}Error: boom\n {4} {2}at a/);
  assert.equal(describeError(undefined), undefined);
});
