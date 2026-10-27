import type { TabBehavior } from "../types.ts";

/** Tab on a row with a variant (UUID version) switches it and remembers the choice. */
export const cycleVariant: TabBehavior = {
  id: "cycle-variant",
  applies: ({ row }) => !!row?.hasVariant,
  run: () => ({ effects: [{ type: "cycle-variant" }] }),
};
