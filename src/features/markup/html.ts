import { htmlScore } from "../../tools/markup.ts";
import { markupFeature } from "./shared.ts";

// Paper: grey-white in both system themes, the way a page looks.
export const htmlFeature = markupFeature({
  id: "html",
  kind: "html",
  triggers: ["html", "htm"],
  score: htmlScore,
  theme: {
    dark: { panel: "#f1f1ef", text: "#1c1c1e", muted: "#74747a", rowActive: "#e2e2df", chip: "#1c1c1e", chipText: "#ffffff", accent: "#6b6b72", border: "rgba(0,0,0,0.1)", divider: "rgba(0,0,0,0.08)" },
    light: { panel: "#fbfbfa", text: "#1c1c1e", muted: "#7a7a80", rowActive: "#ececea", chip: "#1c1c1e", chipText: "#ffffff", accent: "#6b6b72", border: "rgba(0,0,0,0.1)", divider: "rgba(0,0,0,0.07)" },
  },
});
