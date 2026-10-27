import type { FeatureId, TabBehavior } from "../types.ts";

/** Tab on a trigger word ("md") moves the bar into the feature with an empty input. */
export function enterOnTrigger(id: FeatureId, triggers: string[]): TabBehavior {
  return {
    id: `enter:${id}`,
    applies: ({ state, input }) => state.kind === "common" && triggers.includes(input.trim().toLowerCase()),
    run: () => ({ state: { kind: "feature", id } }),
  };
}

/** Tab on a hint row ("Open in HTML mode") enters the feature; the UI keeps the text. */
export function enterOnRow(id: FeatureId): TabBehavior {
  return {
    id: `enter-row:${id}`,
    applies: ({ state, row }) => state.kind === "common" && !!row?.enters && row.feature === id,
    run: () => ({ state: { kind: "feature", id } }),
  };
}
