/** All translations, keyed by Chrome's _locales folder name. Used by scripts/build.mjs and tests. */
import { de } from "./de.ts";
import { en, type Messages } from "./en.ts";
import { fr } from "./fr.ts";
import { ru } from "./ru.ts";
import { zh_CN } from "./zh_CN.ts";

export const LOCALES: Record<string, Messages> = { en, ru, zh_CN, de, fr };

type ChromeMessage = { message: string; placeholders?: Record<string, { content: string }> };

/**
 * Our strings → Chrome's messages.json. `$1` becomes a named placeholder ($P1$ → "$1"):
 * Chrome's documented way to pass substitutions, and it keeps a literal "$" safe.
 */
export function toChromeMessages(messages: Messages): Record<string, ChromeMessage> {
  const out: Record<string, ChromeMessage> = {};
  for (const [key, text] of Object.entries(messages)) {
    if (text === undefined) continue;
    const numbers = [...new Set([...text.matchAll(/\$(\d)/g)].map((m) => m[1]))];
    const message = text.replace(/\$(?!\d)/g, "$$$$").replace(/\$(\d)/g, "$$P$1$$");
    out[key] = numbers.length
      ? { message, placeholders: Object.fromEntries(numbers.map((n) => [`p${n}`, { content: `$${n}` }])) }
      : { message };
  }
  return out;
}
