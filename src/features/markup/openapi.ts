import { parseOpenApi } from "../../tools/openapi.ts";
import { markupFeature } from "./shared.ts";

// Swagger Editor: its deep blue-teal header (#173647) and the Swagger green (#89bf04).
export const openApiFeature = markupFeature({
  id: "openapi",
  kind: "openapi",
  triggers: ["swagger", "openapi", "asyncapi", "api"],
  score: (text) => (parseOpenApi(text) ? 1 : 0),
  theme: {
    dark: { panel: "#173647", text: "#e6f0f5", muted: "#8aa7b6", rowActive: "#21485f", chip: "#89bf04", chipText: "#10242f", accent: "#89bf04", border: "rgba(137,191,4,0.28)", divider: "rgba(255,255,255,0.09)" },
    light: { panel: "#eef3f6", text: "#3b4151", muted: "#6f808b", rowActive: "#dce6ec", chip: "#173647", chipText: "#ffffff", accent: "#5f8a00", border: "rgba(23,54,71,0.18)", divider: "rgba(23,54,71,0.1)" },
  },
});
