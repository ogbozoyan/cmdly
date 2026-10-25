import assert from "node:assert/strict";
import { test } from "node:test";
import { bugReportUrl, describeEnvironment, featureRequestUrl } from "../../src/shared/feedback.ts";

const mac = {
  version: "1.0.0",
  platform: "MacIntel",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.47 Safari/537.36",
};

test("environment line is short and has no full user agent", () => {
  assert.equal(describeEnvironment(mac), "Cmdly 1.0.0 · Chrome 156.0.8078.47 · macOS");
  assert.equal(describeEnvironment({ ...mac, platform: "Win32" }).endsWith("Windows"), true);
  assert.equal(describeEnvironment({ ...mac, platform: "Linux x86_64" }).endsWith("Linux"), true);
});

test("bug report opens a prefilled issue in the repo", () => {
  const url = new URL(bugReportUrl(mac));
  assert.equal(url.origin + url.pathname, "https://github.com/ogbozoyan/cmdly/issues/new");
  assert.equal(url.searchParams.get("labels"), "bug");
  assert.match(url.searchParams.get("body")!, /Steps to reproduce[\s\S]*Cmdly 1\.0\.0 · Chrome 156/);
});

test("feature request uses the enhancement label", () => {
  assert.equal(new URL(featureRequestUrl(mac)).searchParams.get("labels"), "enhancement");
});
