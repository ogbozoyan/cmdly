import { t } from "../../i18n/index.ts";
import type { ResultItem } from "../../shared/model.ts";
import { copyRow } from "../../tools/rows.ts";
import { generateUuids, isUuidVersion, nextUuidVersion, UUID_DESCRIPTIONS, type UuidVersion } from "../../tools/uuid.ts";
import { cycleVariant } from "../tab/cycle-variant.ts";
import type { Feature } from "../types.ts";

/**
 * "uuid", "guid", "uuid 5" (up to 50) use the saved version, and Tab on the row switches it.
 * "uuid v7", "uuid v1 5" pick a version for this query only.
 */
function uuidRows(q: string, saved: UuidVersion): ResultItem[] {
  const m = /^(uuid|guid)(?:\s*v([147]))?(?:\s+(\d{1,2}))?$/i.exec(q);
  if (!m) return [];
  const explicit = m[2] ? (`v${m[2]}` as UuidVersion) : null;
  const version = explicit ?? saved;
  const count = Math.min(Math.max(parseInt(m[3] || "1", 10), 1), 50);
  const ids = generateUuids(version, count);
  const label = `UUID ${version} · ${t(UUID_DESCRIPTIONS[version])}`;
  const row =
    count === 1
      ? copyRow(ids[0], label, ids[0], "key")
      : copyRow(t("uuidCount", count), `${label} · ${ids[0]}…`, ids.join("\n"), "key");
  // Explicit "uuid v7" is a one-off; only the plain query cycles and saves the version.
  if (!explicit) row.variant = { setting: "uuidVersion", value: version, next: nextUuidVersion(version) };
  return [row];
}

export const uuidFeature: Feature = {
  id: "uuid",
  enabled: (features) => features.uuid,
  triggers: [],
  recognizer: {
    rows(text, ctx) {
      const saved = isUuidVersion(ctx.tools.uuidVersion) ? ctx.tools.uuidVersion : "v4";
      return uuidRows(text.trim(), saved).map((row) => ({ ...row, feature: "uuid" }));
    },
  },
  tab: [cycleVariant],
};
