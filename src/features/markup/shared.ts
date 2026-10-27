/** What HTML, Markdown and OpenAPI share: the same sandboxed rendering, only detection, triggers and palette differ. */
import type { ModeTheme } from "../../shared/palette.ts";
import { markupLabel, markupResult, type MarkupKind } from "../../tools/markup.ts";
import { enterOnTrigger } from "../tab/enter-feature.ts";
import { togglePanel } from "../tab/toggle-panel.ts";
import type { Feature, FeatureContext } from "../types.ts";

interface MarkupSpec {
  id: string;
  kind: MarkupKind;
  triggers: string[];
  /** Does this pasted text look like the format? Checked in registry order, the first one wins. */
  detect(text: string): boolean;
  theme: ModeTheme;
}

export function markupFeature(spec: MarkupSpec): Feature {
  const rows = (text: string, ctx: FeatureContext) =>
    text.trim() ? markupResult(spec.kind, text.trim(), { remote: ctx.features.markupRemote }).map((row) => ({ ...row, feature: spec.id })) : [];

  return {
    id: spec.id,
    group: "markup",
    enabled: (features) => features.markup,
    triggers: spec.triggers,
    recognizer: { rows: (text, ctx) => (spec.detect(text) ? rows(text, ctx) : []) },
    presentation: { label: () => markupLabel(spec.kind), theme: spec.theme, hint: "previewHintMode", rows },
    tab: [enterOnTrigger(spec.id, spec.triggers), togglePanel],
  };
}
