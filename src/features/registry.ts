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

/**
 * Order is row order and, inside the markup group, detection priority: an OpenAPI spec is also
 * JSON/YAML, so it goes before HTML and Markdown (it still gets the JSON rows below it).
 */
const FEATURES: Feature[] = [openApiFeature, htmlFeature, markdownFeature, uuidFeature, jwtFeature, jsonFeature, yamlFeature];

/** Rows that belong to no feature (Base64 / URL decoders with a JSON preview): Tab still folds their panel. */
export const FALLBACK_TAB: TabBehavior[] = [togglePanel];

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
      const claimed = new Set<string>();
      const rows: ResultItem[] = [];
      for (const feature of features) {
        if (feature.group && claimed.has(feature.group)) continue;
        const found = feature.recognizer.rows(text, ctx);
        if (!found.length) continue;
        rows.push(...found);
        if (feature.group) claimed.add(feature.group);
      }
      return rows;
    },
  };
}
