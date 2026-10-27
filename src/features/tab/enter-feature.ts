import type { FeatureId, TabBehavior } from "../types.ts";

/** Tab on a trigger word ("md") moves the bar into the feature with an empty input. */
export function enterOnTrigger(id: FeatureId, triggers: string[]): TabBehavior {
  return {
    id: `enter:${id}`,
    applies: ({ state, input }) => state.kind === "common" && triggers.includes(input.trim().toLowerCase()),
    run: () => ({ state: { kind: "feature", id } }),
  };
}
