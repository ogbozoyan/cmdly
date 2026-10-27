/**
 * Keys → state changes and effects, without the DOM. The UI feeds it what it sees (input,
 * highlighted row) and does what comes back; which feature handles Tab is decided by the
 * strategies the features carry (see types.ts), not by branches here.
 */
import { FALLBACK_TAB, type Registry } from "./registry.ts";
import { COMMON, type BarState, type Effect, type RowInfo, type TabBehavior } from "./types.ts";

export type BarEvent =
  | { type: "tab"; input: string; row: RowInfo | null }
  | { type: "escape"; input: string; row: RowInfo | null; previewOpen: boolean }
  | { type: "backspace"; input: string };

export interface Step {
  state: BarState;
  effects: Effect[];
  /** false: the UI leaves the key to the browser (Backspace in a filled input). */
  handled: boolean;
}

export function reduce(state: BarState, event: BarEvent, registry: Registry): Step {
  switch (event.type) {
    case "tab": {
      const ctx = { state, input: event.input, row: event.row };
      const owners =
        state.kind === "feature"
          ? [registry.get(state.id)]
          : [...registry.byTrigger(event.input), event.row?.feature ? registry.get(event.row.feature) : undefined];
      const behaviors: TabBehavior[] = [...owners.flatMap((f) => f?.tab ?? []), ...FALLBACK_TAB];
      const result = behaviors.find((b) => b.applies(ctx))?.run(ctx);
      return { state: result?.state ?? state, effects: result?.effects ?? [], handled: true };
    }
    case "escape": {
      // Inside a feature Esc goes back to the ordinary bar and keeps the text; otherwise it folds
      // the preview, then clears the input, then closes.
      if (state.kind === "feature") return { state: COMMON, effects: [], handled: true };
      if (event.previewOpen && event.row?.hasPreview) return { state, effects: [{ type: "toggle-preview" }], handled: true };
      return { state, effects: [{ type: event.input ? "clear-input" : "close" }], handled: true };
    }
    case "backspace":
      if (state.kind === "feature" && !event.input) return { state: COMMON, effects: [], handled: true };
      return { state, effects: [], handled: false };
  }
}
