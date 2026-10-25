import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error — plain JS build script without type declarations
import { compare, nextVersion } from "../../scripts/version.mjs";

test("patch is the default bump", () => {
  assert.equal(nextVersion("1.2.3"), "1.2.4");
  assert.equal(nextVersion("1.2.9", "patch"), "1.2.10");
});

test("minor and major reset lower parts", () => {
  assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
});

test("explicit version must go up", () => {
  assert.equal(nextVersion("1.2.3", "1.10.0"), "1.10.0");
  assert.throws(() => nextVersion("1.2.3", "1.2.3"), /must be greater/);
  assert.throws(() => nextVersion("1.2.3", "1.1.9"), /must be greater/);
});

test("rejects garbage", () => {
  assert.throws(() => nextVersion("1.2", "patch"), /not major.minor.patch/);
  assert.throws(() => nextVersion("1.2.3", "huge"), /Unknown bump/);
});

test("numeric comparison, not string", () => {
  assert.ok(compare("1.10.0", "1.9.0") > 0);
  assert.equal(compare("2.0.0", "2.0.0"), 0);
});
