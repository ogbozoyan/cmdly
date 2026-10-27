import { looksLikeMarkdown } from "../../tools/markdown.ts";
import { markupFeature } from "./shared.ts";

// Graphite: near-black on dark, silver on light.
export const markdownFeature = markupFeature({
  id: "markdown",
  kind: "markdown",
  triggers: ["md", "markdown"],
  detect: looksLikeMarkdown,
  theme: {
    dark: { panel: "#111111", text: "#e8e8e8", muted: "#7b7b7b", rowActive: "#222222", chip: "#e8e8e8", chipText: "#111111", accent: "#a8a8a8", border: "rgba(255,255,255,0.09)", divider: "rgba(255,255,255,0.07)" },
    light: { panel: "#dedee0", text: "#161616", muted: "#6c6c70", rowActive: "#cfcfd2", chip: "#161616", chipText: "#f2f2f2", accent: "#4a4a4f", border: "rgba(0,0,0,0.12)", divider: "rgba(0,0,0,0.09)" },
  },
});
