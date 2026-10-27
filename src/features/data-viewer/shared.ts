/** JSON, YAML and JWT show their result in a code panel under the row; Tab folds it. */
import { t } from "../../i18n/index.ts";
import type { Preview, ResultItem } from "../../shared/model.ts";
import { describeData, formatSize, parseData, toMinifiedJson, toPrettyJson, toYaml } from "../../tools/data-formats.ts";
import { copyRow } from "../../tools/rows.ts";
import { togglePanel } from "../tab/toggle-panel.ts";
import type { Feature } from "../types.ts";

const tagged = (id: string, rows: ResultItem[]) => rows.map((row) => ({ ...row, feature: id }));

/**
 * Pasted JSON → Format / Minify / Convert to YAML; pasted YAML → Format / Convert to JSON.
 * Every row can be expanded (Tab) to view the result.
 */
function dataRows(text: string, format: "json" | "yaml"): ResultItem[] {
  const q = text.trim();
  const data = q ? parseData(q) : null;
  if (!data || data.format !== format) return [];
  const meta = `${describeData(data.value)} · ${formatSize(q)}`;
  const pretty = toPrettyJson(data.value);
  const yaml = toYaml(data.value);
  const json: Preview = { language: "json", content: pretty };

  if (format === "json") {
    const minified = toMinifiedJson(data.value);
    return [
      copyRow(t("formatJson"), meta, pretty, "braces", "tool", json),
      copyRow(t("minifyJson"), formatSize(minified), minified, "braces", "tool", { language: "json", content: minified }),
      copyRow(t("convertToYaml"), meta, yaml, "code", "tool", { language: "yaml", content: yaml }),
    ];
  }
  return [
    copyRow(t("formatYaml"), meta, yaml, "code", "tool", { language: "yaml", content: yaml }),
    copyRow(t("convertToJson"), meta, pretty, "braces", "tool", json),
  ];
}

export function dataFeature(id: string, format: "json" | "yaml"): Feature {
  return {
    id,
    enabled: (features) => features.formats,
    triggers: [],
    recognizer: { rows: (text) => tagged(id, dataRows(text, format)) },
    tab: [togglePanel],
  };
}
