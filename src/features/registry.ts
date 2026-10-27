/** The one place that lists the features. A new one is a file in its group plus a line here. */
import type { ResultItem } from "../shared/model.ts";
import type { Features } from "../shared/settings.ts";
import { htmlFeature } from "./markup/html.ts";
import { markdownFeature } from "./markup/markdown.ts";
import { openApiFeature } from "./markup/openapi.ts";
import { cycleVariant } from "./tab/cycle-variant.ts";
import { togglePanel } from "./tab/toggle-panel.ts";
import type { Feature, FeatureContext, FeatureId, TabBehavior } from "./types.ts";

/** Order is detection priority: an OpenAPI spec is also JSON/YAML, so it goes before HTML and Markdown. */
const FEATURES: Feature[] = [openApiFeature, htmlFeature, markdownFeature];

/** For rows that don't belong to a feature yet (JSON, JWT, UUID…): what Tab does with their preview / variant. */
export const FALLBACK_TAB: TabBehavior[] = [togglePanel, cycleVariant];

export interface Registry {
  get(id: FeatureId): Feature | undefined;
  /** Features entered by this word ("md"). */
  byTrigger(word: string): Feature[];
  /** Common state: rows offered for the text; a forced prefix ("md # Title") beats detection. */
  recognize(text: string, ctx: FeatureContext): ResultItem[];
}

/** Only the features the settings leave on. */
export function createRegistry(flags: Features, all: Feature[] = FEATURES): Registry {
  const features = all.filter((f) => f.enabled(flags));
  const byTrigger = (word: string) => features.filter((f) => f.triggers.includes(word.trim().toLowerCase()));
  return {
    get: (id) => features.find((f) => f.id === id),
    byTrigger,
    recognize(text, ctx) {
      const prefixed = /^(\S+)\s+([\s\S]+)$/.exec(text.trim());
      const forced = prefixed ? byTrigger(prefixed[1]).find((f) => f.presentation) : undefined;
      if (prefixed && forced?.presentation) return forced.presentation.rows(prefixed[2], ctx);
      for (const feature of features) {
        const rows = feature.recognizer.rows(text, ctx);
        if (rows.length) return rows;
      }
      return [];
    },
  };
}
