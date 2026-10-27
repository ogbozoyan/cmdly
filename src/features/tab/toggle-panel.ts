import type { TabBehavior } from "../types.ts";

/** Tab on a row that has a preview opens or folds the panel under it. */
export const togglePanel: TabBehavior = {
  id: "toggle-panel",
  applies: ({ row }) => !!row?.hasPreview,
  run: () => ({ effects: [{ type: "toggle-preview" }] }),
};
