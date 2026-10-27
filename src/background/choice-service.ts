import { boost, record, type Learned } from "../shared/learned.ts";
import type { ResultItem } from "../shared/model.ts";
import { log } from "../shared/log.ts";
import { settingsRepository } from "../shared/settings-repository.ts";

/**
 * Learned choices for the experimental ranking: which row was picked for which typed text.
 * chrome.storage.local — stays on this computer, never written from incognito, cleared from
 * Settings → Experimental (and when the feature is turned off).
 */

const KEY = "learnedChoices";
/** Only rows the ranking scores can be learned; web search and suggestions aren't ranked. */
const LEARNABLE = new Set<ResultItem["kind"]>(["tab", "bookmark", "history", "command"]);

/** The key a row is remembered by: commands by id (titles are localized), pages by URL. */
export function choiceKey(item: ResultItem): string | undefined {
  if (!LEARNABLE.has(item.kind)) return undefined;
  return item.kind === "command" ? "cmd:" + item.commandId : item.url;
}

export async function learnedData(): Promise<Learned> {
  return ((await chrome.storage.local.get(KEY))[KEY] as Learned | undefined) ?? {};
}

/** Never throws: learning is a bonus, it must not stop the row from opening. */
export async function recordChoice(query: string, item: string | undefined, sender: chrome.tabs.Tab): Promise<void> {
  if (!item || !query.trim() || sender.incognito) return;
  try {
    const { experimental } = await settingsRepository.get();
    if (!experimental.ranking || !experimental.learned) return;
    await chrome.storage.local.set({ [KEY]: record(await learnedData(), query, item, Date.now()) });
  } catch (error) {
    log.debug("choices", "could not record a choice", error);
  }
}

export async function clearLearned(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/** Boost lookup bound to one read of the storage, for scoring every candidate of a query. */
export async function learnedBoost(query: string): Promise<(item: string) => number> {
  const data = await learnedData();
  const now = Date.now();
  return (item) => boost(data, query, item, now);
}
