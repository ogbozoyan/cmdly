import assert from "node:assert/strict";
import { test } from "node:test";
import { historyFrecency, matchScore, normalize, parseScope, rank, tabFrecency, TOP_HIT, urlTokens, type Candidate, type Field } from "../../src/shared/ranking.ts";

const title = (text: string): Field[] => [{ text, weight: 1 }];

test("only word starts match short terms", () => {
  assert.equal(matchScore("mar", title("Bookmark Page")), 0);
  assert.ok(matchScore("mar", title("Copy URL as Markdown")) >= 80);
  assert.equal(matchScore("mark", title("Bookmark Page")), 40);
});

test("tiers: exact, prefix, acronym", () => {
  assert.equal(matchScore("bookmark", title("Bookmark Page")), 100);
  assert.ok(matchScore("bookm", title("Bookmark Page")) > matchScore("bookm", title("Open Bookmarks")));
  assert.equal(matchScore("cu", title("Copy URL")), 70);
});

test("normalization and wrong keyboard layout", () => {
  assert.equal(normalize("Ёлка Café"), "елка cafe");
  assert.equal(normalize("Йод"), "йод");
  assert.ok(matchScore("ёлка", title("елка")) > 0);
  assert.ok(matchScore("ьфк", title("Copy URL as Markdown")) > 0);
});

test("the Settings: prefix alone never passes the threshold", () => {
  assert.ok(matchScore("settings", title("Settings: Fonts")) <= 45);
  assert.ok(matchScore("настройки", title("Настройки: Шрифты")) <= 45);
  assert.ok(matchScore("fonts", title("Settings: Fonts")) >= 80);
});

test("multi-word queries: AND in any order, mixed scripts", () => {
  assert.ok(matchScore("tab close", title("Close Tab")) > 0);
  assert.equal(matchScore("tab zzz", title("Close Tab")), 0);
  assert.doesNotThrow(() => matchScore("gh репо", title("GitHub репозиторий")));
});

test("URL host beats a path match", () => {
  const host: Field[] = [{ text: "https://github.com/x", weight: 0.9, url: "host" }];
  const path: Field[] = [{ text: "https://example.com/git-guide", weight: 0.6, url: "path" }];
  assert.ok(matchScore("git", host) > matchScore("git", path));
  assert.deepEqual(urlTokens("https://www.github.com/a/b-c?q=1"), { host: ["github", "com"], path: ["a", "b", "c"] });
});

// ---------- blending ----------

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 27);
const cand = (id: string, source: Candidate<string>["source"], text: string, extra: Partial<Candidate<string>> = {}): Candidate<string> => ({
  item: id, id, source, title: text, fields: title(text), frecency: 0, learned: 0, recency: 0, ...extra,
});

test("per-source caps", () => {
  const tabs = Array.from({ length: 10 }, (_, i) => cand(`t${i}`, "tab", `Github tab ${i}`));
  const ranked = rank("github", [...tabs, cand("h", "history", "Github home"), cand("b", "bookmark", "Github stars")]);
  assert.equal(ranked.filter((r) => r.item.startsWith("t")).length, 3);
  assert.equal(ranked.filter((r) => r.item === "h" || r.item === "b").length, 2);
});

test("settings pages need 4 characters and show at most one", () => {
  const pages = [cand("p1", "page", "Settings: Passwords"), cand("p2", "page", "Settings: Autofill and Passwords")];
  assert.equal(rank("pas", pages).length, 0);
  assert.deepEqual(rank("pass", pages).map((r) => r.item), ["p1"]);
  assert.equal(rank("p", [cand("c", "command", "Pin Tab")]).length, 0);
});

test("top hit and tie-breaks", () => {
  const ranked = rank("gith", [
    cand("long", "history", "Github repository list"),
    cand("short", "history", "Github repos"),
    cand("tab", "tab", "Github", { frecency: 6, learned: 25 }),
  ]);
  assert.equal(ranked[0].item, "tab");
  assert.ok(ranked[0].final >= TOP_HIT);
  assert.deepEqual(ranked.slice(1).map((r) => r.item), ["short", "long"]);
});

test("history frecency follows Chrome's recency weights", () => {
  assert.equal(historyFrecency(20, now, now), 12);
  assert.ok(Math.abs(historyFrecency(20, now - 365 * DAY, now) - 1.2) < 0.01);
  assert.equal(tabFrecency(now - 10 * 60_000, now), 6);
  assert.equal(tabFrecency(now - 2 * 3_600_000, now), 0);
});

test("the namespace word finds the plain command, not every page", () => {
  const ranked = rank("settings", [
    cand("open", "command", "Open Settings"),
    cand("p1", "page", "Settings: Fonts"),
    cand("p2", "page", "Settings: Languages"),
  ]);
  assert.deepEqual(ranked.map((r) => r.item), ["open"]);
  assert.deepEqual(rank("", [cand("open", "command", "Open Settings")]), []);
});

test("scopes: > for commands, the settings word for Chrome settings", () => {
  assert.deepEqual(parseScope("> pin"), { scope: "commands", rest: "pin" });
  assert.deepEqual(parseScope(">"), { scope: "commands", rest: "" });
  assert.deepEqual(parseScope("Настройки шрифт"), { scope: "settings", rest: "шрифт" });
  assert.deepEqual(parseScope("settings"), { scope: "settings", rest: "" });
  assert.deepEqual(parseScope("settingsx"), { scope: null, rest: "settingsx" });
});
