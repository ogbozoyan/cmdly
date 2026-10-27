/** The one place that lists the features. A new one is a file in its group plus a line here. */
import type { ResultItem } from "../shared/model.ts";
import type { Features } from "../shared/settings.ts";
import { htmlFeature } from "./markup/html.ts";
import { jsonFeature } from "./data-viewer/json.ts";
import { jwtFeature } from "./data-viewer/jwt.ts";
import { yamlFeature } from "./data-viewer/yaml.ts";
import { markdownFeature } from "./markup/markdown.ts";
import { openApiFeature } from "./markup/openapi.ts";
import { togglePanel } from "./tab/toggle-panel.ts";
import { uuidFeature } from "./uuid/uuid.ts";
import type { Feature, FeatureContext, FeatureId, TabBehavior } from "./types.ts";

/** Order is row order, and breaks a tie between equally sure members of a group. */
const FEATURES: Feature[] = [openApiFeature, htmlFeature, markdownFeature, uuidFeature, jwtFeature, jsonFeature, yamlFeature];

/** Rows that belong to no feature (Base64 / URL decoders with a JSON preview): Tab still folds their panel. */
export const FALLBACK_TAB: TabBehavior[] = [togglePanel];

export interface Registry {
  get(id: FeatureId): Feature | undefined;
  /** Features entered by this word ("md"). */
  byTrigger(word: string): Feature[];
  /** Common state: rows offered for the text. Modes are entered with a trigger word + Tab or from a hint row. */
  recognize(text: string, ctx: FeatureContext): ResultItem[];
}

/** A feature is offered for pasted text only when it is at least this sure. */
export const AUTO_MIN = 0.5;

/** Only the features the settings leave on. */
export function createRegistry(flags: Features, all: Feature[] = FEATURES): Registry {
  const features = all.filter((f) => f.enabled(flags));
  const byTrigger = (word: string) => features.filter((f) => f.triggers.includes(word.trim().toLowerCase()));
  // Features without a score are binary: sure when they have rows.
  const score = (f: Feature, text: string) => f.recognizer.score?.(text) ?? 1;

  return {
    get: (id) => features.find((f) => f.id === id),
    byTrigger,
    recognize(text, ctx) {
      const candidates: { feature: Feature; rows: ResultItem[]; score: number }[] = [];
      for (const feature of features) {
        const sure = score(feature, text);
        if (sure < AUTO_MIN) continue;
        const rows = feature.recognizer.rows(text, ctx);
        if (rows.length) candidates.push({ feature, rows, score: sure });
      }
      // Inside a group the most certain member wins (registry order breaks ties): an OpenAPI spec is also
      // JSON and Markdown-ish text, but it is sure about being OpenAPI.
      const best = new Map<string, (typeof candidates)[number]>();
      for (const c of candidates) {
        const group = c.feature.group;
        if (group && c.score > (best.get(group)?.score ?? -1)) best.set(group, c);
      }
      const winners = candidates.filter((c) => !c.feature.group || best.get(c.feature.group) === c);
      return winners.flatMap((c) => c.rows);
    },
  };
}
