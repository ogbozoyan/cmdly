import assert from "node:assert/strict";
import { test } from "node:test";
import { fitCount, initialIndex, neighbourDirection, recentFirst, step, thumbnailSize } from "../../src/shared/switcher.ts";

test("orders tabs by last use with the active tab first", () => {
  const tabs = [
    { id: 1, lastAccessed: 100 },
    { id: 2, lastAccessed: 300 },
    { id: 3, lastAccessed: 200, active: true },
    { id: 4 },
  ];
  assert.deepEqual(recentFirst(tabs).map((t) => t.id), [3, 2, 1, 4]);
  assert.deepEqual(recentFirst(tabs, 2).map((t) => t.id), [3, 2]);
});

test("moves the selection with wrap-around", () => {
  assert.equal(step(0, 3, 1), 1);
  assert.equal(step(2, 3, 1), 0);
  assert.equal(step(0, 3, -1), 2);
  assert.equal(step(1, 3, 7), 2);
  assert.equal(step(0, 0, 1), 0);
});

test("starts on the previous tab", () => {
  assert.equal(initialIndex(5), 1);
  assert.equal(initialIndex(1), 0);
});

test("downscales thumbnails keeping the aspect ratio", () => {
  assert.deepEqual(thumbnailSize(1440, 900, 360), { width: 360, height: 225 });
  assert.deepEqual(thumbnailSize(200, 100, 360), { width: 200, height: 100 });
});

test("recognises Chrome's Ctrl+Tab and Ctrl+Shift+Tab moves", () => {
  assert.equal(neighbourDirection(1, 2, 5), 1);
  assert.equal(neighbourDirection(4, 0, 5), 1);
  assert.equal(neighbourDirection(2, 1, 5), -1);
  assert.equal(neighbourDirection(0, 4, 5), -1);
  assert.equal(neighbourDirection(0, 2, 5), 0);
  assert.equal(neighbourDirection(0, 0, 1), 0);
});

test("fits as many cards as the window allows, at most five", () => {
  assert.equal(fitCount(1440), 5);
  assert.equal(fitCount(600), 3);
  assert.equal(fitCount(200), 1);
  assert.equal(fitCount(4000, 3), 3);
});
