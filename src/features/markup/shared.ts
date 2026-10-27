/** What HTML, Markdown and OpenAPI share: the same sandboxed rendering, only detection, triggers and palette differ. */
import { t } from "../../i18n/index.ts";
import type { ResultItem } from "../../shared/model.ts";
import type { ModeTheme } from "../../shared/palette.ts";
import { markupLabel, markupResult, type MarkupKind } from "../../tools/markup.ts";
import { enterOnRow, enterOnTrigger } from "../tab/enter-feature.ts";
import { togglePanel } from "../tab/toggle-panel.ts";
import type { Feature, FeatureContext } from "../types.ts";

interface MarkupSpec {
  id: string;
  kind: MarkupKind;
  triggers: string[];
  /** How sure we are that the text is this format, 0..1 (see Recognizer.score). */
  score(text: string): number;
  theme: ModeTheme;
}

export function markupFeature(spec: MarkupSpec): Feature {
  const rows = (text: string, ctx: FeatureContext) =>
    text.trim() ? markupResult(spec.kind, text.trim(), { remote: ctx.features.markupRemote }).map((row) => ({ ...row, feature: spec.id })) : [];

  // Pasted text is only hinted at, never rendered: the preview lives inside the mode (Tab or Enter on the hint).
  const hint = (text: string): ResultItem[] =>
    text.trim()
      ? [{ kind: "tool", title: t("markupEnterMode", markupLabel(spec.kind)), glyph: spec.kind === "openapi" ? "braces" : "code", action: "⇥", enters: spec.id, feature: spec.id }]
      : [];

  return {
    id: spec.id,
    group: "markup",
    enabled: (features) => features.markup,
    triggers: spec.triggers,
    recognizer: { score: spec.score, rows: hint },
    presentation: { label: () => markupLabel(spec.kind), theme: spec.theme, hint: "previewHintMode", rows },
    tab: [enterOnTrigger(spec.id, spec.triggers), enterOnRow(spec.id), togglePanel],
  };
}
