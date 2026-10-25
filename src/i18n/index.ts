/**
 * UI translations. Chrome picks the locale from the browser language (chrome.i18n, _locales/);
 * outside Chrome — unit tests in Node — the English strings are used.
 */
import { en, type MessageKey, type Messages } from "./en.ts";
import { LOCALES } from "./locales.ts";

export type { MessageKey } from "./en.ts";

type Substitution = string | number;

/** Message keys that have plural forms: "toastClosedTabs" for toastClosedTabs_one / _other… */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Base}_other` ? Base : never) : never;

/** Language picked in Settings; null = follow Chrome (chrome.i18n). */
let chosen: Messages | null = null;

/** "auto" or a locale from src/i18n/locales.ts. Call again when the setting changes. */
export function setLanguage(language: string): void {
  chosen = language !== "auto" ? (LOCALES[language] ?? null) : null;
}

function chromeMessage(key: string, substitutions: string[]): string {
  if (chosen) {
    const text = chosen[key];
    return text === undefined ? "" : fill(text, substitutions);
  }
  try {
    return globalThis.chrome?.i18n?.getMessage(key, substitutions) ?? "";
  } catch {
    return ""; // context invalidated after an extension update
  }
}

function fill(text: string, substitutions: string[]): string {
  return text.replace(/\$(\d)/g, (_, n: string) => substitutions[Number(n) - 1] ?? "");
}

export function t(key: MessageKey, ...substitutions: Substitution[]): string {
  const subs = substitutions.map(String);
  return chromeMessage(key, subs) || fill(en[key], subs);
}

/** Plural-aware t(): `count` becomes $1 and picks the form by the active locale's rules. */
export function tp(key: PluralKey, count: number, ...substitutions: Substitution[]): string {
  const subs = [String(count), ...substitutions.map(String)];
  const form = new Intl.PluralRules(t("localeCode")).select(count);
  const translated = chromeMessage(`${key}_${form}`, subs) || chromeMessage(`${key}_other`, subs);
  if (translated) return translated;
  return fill(en[(count === 1 ? `${key}_one` : `${key}_other`) as MessageKey], subs);
}

/**
 * Translates static HTML: data-i18n → innerHTML (our own strings, may contain <code>),
 * data-i18n-title / data-i18n-placeholder → attributes. The English text in the HTML is the fallback.
 */
export function localizePage(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle as MessageKey);
  });
  root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as MessageKey);
  });
  if (root === document) document.documentElement.lang = t("localeCode");
}
