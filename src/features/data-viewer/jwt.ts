import { t } from "../../i18n/index.ts";
import { toMinifiedJson, toPrettyJson } from "../../tools/data-formats.ts";
import { decodeJwt, describeJwt, jwtTimeNotes } from "../../tools/dev-tools.ts";
import { copyRow } from "../../tools/rows.ts";
import { togglePanel } from "../tab/toggle-panel.ts";
import type { Feature } from "../types.ts";

/** A pasted token: its payload (with readable expiry) and header, both expandable. */
export const jwtFeature: Feature = {
  id: "jwt",
  enabled: (features) => features.jwt,
  triggers: [],
  recognizer: {
    rows(text) {
      const jwt = decodeJwt(text.trim());
      if (!jwt) return [];
      const payload = toPrettyJson(jwt.payload);
      const header = toPrettyJson(jwt.header);
      return [
        copyRow(toMinifiedJson(jwt.payload), describeJwt(jwt.payload), payload, "key", "tool", {
          language: "json",
          content: payload,
          notes: jwtTimeNotes(jwt.payload),
        }),
        copyRow(toMinifiedJson(jwt.header), t("jwtHeader"), header, "key", "tool", { language: "json", content: header }),
      ].map((row) => ({ ...row, feature: "jwt" }));
    },
  },
  tab: [togglePanel],
};
