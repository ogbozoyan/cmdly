import assert from "node:assert/strict";
import { test } from "node:test";
import { planKeepOpen, type TabSnapshot, type WindowSnapshot } from "../../src/background/keep-open-plan.ts";

let nextId = 1;
const tab = (opts: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: nextId++,
  guard: false,
  transient: false,
  active: false,
  lastAccessed: 0,
  ...opts,
});
const win = (id: number, ...tabs: TabSnapshot[]): WindowSnapshot => ({ id, tabs });

test("off: never adds a guard and removes leftovers", () => {
  const g = tab({ guard: true });
  assert.deepEqual(planKeepOpen([win(1, tab())], "off"), []);
  assert.deepEqual(planKeepOpen([win(1, g, tab())], "off"), [{ type: "remove-tab", tabId: g.id }]);
});

test("last: one window with one real tab gets a guard", () => {
  assert.deepEqual(planKeepOpen([win(1, tab())], "last"), [{ type: "create-guard", windowId: 1 }]);
});

test("guard is removed once the window has two real tabs", () => {
  const g = tab({ guard: true });
  assert.deepEqual(planKeepOpen([win(1, g, tab(), tab())], "last"), [{ type: "remove-tab", tabId: g.id }]);
});

test("stable state: guard + one real tab → nothing to do", () => {
  assert.deepEqual(planKeepOpen([win(1, tab({ guard: true }), tab({ active: true }))], "last"), []);
});

test("last tab closed: only the guard is left → open the command bar", () => {
  assert.deepEqual(planKeepOpen([win(1, tab({ guard: true, active: true }))], "last"), [{ type: "open-bar", windowId: 1 }]);
});

test("Cmd+T's transient new tab doesn't make the guard flicker", () => {
  // guard + page + new tab being turned into the overlay: still counts as one real tab.
  const plan = planKeepOpen([win(1, tab({ guard: true }), tab(), tab({ transient: true, active: true }))], "last");
  assert.deepEqual(plan, []);
  // Only guard + transient: the transient tab becomes the bar itself, don't open another one.
  assert.deepEqual(planKeepOpen([win(1, tab({ guard: true }), tab({ transient: true }))], "last"), []);
});

test("last: with two windows nobody is protected", () => {
  const g = tab({ guard: true });
  const plan = planKeepOpen([win(1, g, tab()), win(2, tab())], "last");
  assert.deepEqual(plan, [{ type: "remove-tab", tabId: g.id }]);
});

test("every: each window with a single tab gets its own guard", () => {
  const plan = planKeepOpen([win(1, tab()), win(2, tab()), win(3, tab(), tab())], "every");
  assert.deepEqual(plan, [
    { type: "create-guard", windowId: 1 },
    { type: "create-guard", windowId: 2 },
  ]);
});

test("an active guard hands focus to the most recently used real tab", () => {
  const recent = tab({ lastAccessed: 200 });
  const old = tab({ lastAccessed: 100 });
  // Two real tabs → the guard goes away, nothing to activate.
  assert.deepEqual(planKeepOpen([win(1, tab({ guard: true, active: true }), old, recent)], "last").map((a) => a.type), ["remove-tab"]);
  // One real tab → keep the guard but leave it.
  assert.deepEqual(planKeepOpen([win(1, tab({ guard: true, active: true }), recent)], "last"), [{ type: "activate-tab", tabId: recent.id }]);
});

test("duplicate guards are cleaned up", () => {
  const g1 = tab({ guard: true });
  const g2 = tab({ guard: true });
  assert.deepEqual(planKeepOpen([win(1, g1, g2, tab())], "last"), [{ type: "remove-tab", tabId: g2.id }]);
});
