import { t } from "../i18n/index.ts";
import type { Preview, ResultItem } from "../shared/model.ts";

/** A tool row: Enter copies `copy`; with a `preview` it can be expanded with Tab. */
export function copyRow(
  title: string,
  meta: string,
  copy: string,
  glyph: ResultItem["glyph"],
  kind: ResultItem["kind"] = "tool",
  preview?: Preview
): ResultItem {
  return { kind, title, meta, copy, glyph, action: t("actionCopy"), preview };
}
