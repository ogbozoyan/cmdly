import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../../src/i18n/en.ts";
import { t, tp } from "../../src/i18n/index.ts";
import { LOCALES, toChromeMessages } from "../../src/i18n/locales.ts";

const placeholders = (text: string) => [...new Set(text.match(/\$\d/g) ?? [])].sort().join(",");
const PLURAL_EXTRA = /_(zero|two|few|many)$/;

for (const [locale, messages] of Object.entries(LOCALES)) {
  test(`${locale}: same keys as English, extra keys only plural forms`, () => {
    for (const key of Object.keys(en)) assert.ok(messages[key]?.trim(), `${locale} is missing ${key}`);
    for (const key of Object.keys(messages)) {
      if (key in en) continue;
      assert.match(key, PLURAL_EXTRA, `${locale}: unknown key ${key}`);
      assert.ok(`${key.replace(PLURAL_EXTRA, "")}_other` in en, `${locale}: ${key} has no English base`);
    }
  });

  test(`${locale}: substitutions match English`, () => {
    for (const [key, text] of Object.entries(messages)) {
      const base = (key in en ? key : key.replace(PLURAL_EXTRA, "_other")) as keyof typeof en;
      assert.equal(placeholders(text!), placeholders(en[base]), `${locale}.${key}`);
    }
  });

  test(`${locale}: Web Store limits and Chrome key rules`, () => {
    assert.ok(messages.extName.length <= 75, `${locale} name too long`);
    assert.ok(messages.extDescription.length <= 132, `${locale} description: ${messages.extDescription.length} chars`);
    const lower = new Set<string>();
    for (const key of Object.keys(messages)) {
      assert.match(key, /^[A-Za-z0-9_@]+$/);
      assert.ok(!lower.has(key.toLowerCase()), `${locale}: keys differ only in case: ${key}`);
      lower.add(key.toLowerCase());
    }
  });
}

test("Chrome messages use named placeholders and escape a literal $", () => {
  const out = toChromeMessages({ ...en, copied: "Copied $1 for $ 5" });
  assert.deepEqual(out.copied, { message: "Copied $P1$ for $$ 5", placeholders: { p1: { content: "$1" } } });
  assert.deepEqual(out.actionCopy, { message: "Copy" });
});

test("outside Chrome t() and tp() fall back to English", () => {
  assert.equal(t("copied", "abc"), "Copied abc");
  assert.equal(tp("toastClosedTabs", 1), "Closed 1 tab");
  assert.equal(tp("toastClosedTabs", 3), "Closed 3 tabs");
});
