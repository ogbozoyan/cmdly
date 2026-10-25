import assert from "node:assert/strict";
import { test } from "node:test";
import { generateUuids, isUuidVersion, nextUuidVersion } from "../../src/tools/uuid.ts";

const shape = (version: number) => new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);

test("each version has the right version and variant bits", () => {
  for (const [version, digit] of [["v4", 4], ["v7", 7], ["v1", 1]] as const) {
    const ids = generateUuids(version, 20);
    ids.forEach((id) => assert.match(id, shape(digit), `${version}: ${id}`));
    assert.equal(new Set(ids).size, 20, `${version} duplicates`);
  }
});

test("v7 starts with the Unix ms timestamp", () => {
  const now = 1729850000123;
  const [id] = generateUuids("v7", 1, { now: () => now, random: (n) => new Uint8Array(n) });
  assert.equal(parseInt(id.replace(/-/g, "").slice(0, 12), 16), now);
});

test("v1 encodes the Gregorian timestamp", () => {
  const now = 1729850000123;
  const [id] = generateUuids("v1", 1, { now: () => now, random: (n) => new Uint8Array(n) });
  const [low, mid, high] = id.split("-");
  const ticks = (BigInt(parseInt(high, 16) & 0x0fff) << 48n) | (BigInt(parseInt(mid, 16)) << 32n) | BigInt(parseInt(low, 16));
  assert.equal(ticks, BigInt(now) * 10000n + 0x01b21dd213814000n);
  // Random node ids must have the multicast bit set.
  assert.equal(parseInt(id.split("-")[4].slice(0, 2), 16) & 1, 1);
});

test("a v7 or v1 batch sorts in creation order even within one millisecond", () => {
  for (const version of ["v7", "v1"] as const) {
    const ids = generateUuids(version, 50, { now: () => 1729850000000, random: (n) => crypto.getRandomValues(new Uint8Array(n)) });
    const key = (id: string) => (version === "v1" ? id.split("-")[0] : id);
    assert.deepEqual([...ids].sort((a, b) => (key(a) < key(b) ? -1 : 1)), ids, version);
  }
});

test("Tab cycles v4 → v7 → v1 → v4", () => {
  assert.equal(nextUuidVersion("v4"), "v7");
  assert.equal(nextUuidVersion("v7"), "v1");
  assert.equal(nextUuidVersion("v1"), "v4");
  assert.equal(isUuidVersion("v7"), true);
  assert.equal(isUuidVersion("v9"), false);
});
