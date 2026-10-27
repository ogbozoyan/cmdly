/**
 * A feature is a thing the bar can show with its own view (a rendered page, a code panel) or
 * act on with Tab (switch the UUID version). It is assembled from three small strategies
 * instead of inheriting behavior, so the same part (e.g. `togglePanel`) serves many features:
 *
 *   Feature ──has──▶ Recognizer   how to notice it in the text
 *           ──has──▶ Presentation how it looks once entered (optional)
 *           ──has──▶ TabBehavior[] what Tab does
 *
 * Pure: no DOM, no chrome.*; the UI executes the effects the reducer returns.
 */
import type { MessageKey } from "../i18n/index.ts";
import type { ResultItem } from "../shared/model.ts";
import type { ModeTheme } from "../shared/palette.ts";
import type { Features, Settings } from "../shared/settings.ts";

export type FeatureId = string;

/** The bar is either in its ordinary state or inside one feature. */
export type BarState = { kind: "common" } | { kind: "feature"; id: FeatureId };

export const COMMON: BarState = { kind: "common" };

/** What the features may read from the settings. */
export interface FeatureContext {
  features: Features;
  /** Remembered tool choices, e.g. the UUID version. */
  tools: Settings["tools"];
}

/** Common state: looks at the typed or pasted text and offers rows (e.g. "Markdown preview"). */
export interface Recognizer {
  /**
   * How sure we are that the text is this feature's format, 0..1. Optional: without it the feature is
   * binary (it has rows or it doesn't). The registry shows a row only above a bar (AUTO_MIN, or the lower
   * PREFIX_MIN after the feature's own trigger word) and, inside a group, only the highest score.
   */
  score?(text: string): number;
  rows(text: string, ctx: FeatureContext): ResultItem[];
}

/** Feature state: the whole input belongs to the feature, nothing else is shown. */
export interface Presentation {
  /** Chip text, localized when called. */
  label(): string;
  theme: ModeTheme;
  /** Hint under the bar, with the key names drawn as keycaps by the UI. */
  hint: MessageKey;
  rows(text: string, ctx: FeatureContext): ResultItem[];
}

export interface RowInfo {
  feature?: FeatureId;
  hasPreview: boolean;
  hasVariant: boolean;
}

export interface TabContext {
  state: BarState;
  input: string;
  /** The highlighted row. */
  row: RowInfo | null;
}

/** Things the UI does after a reducer step; state changes are returned separately. */
export type Effect =
  | { type: "toggle-preview" }
  | { type: "cycle-variant" }
  | { type: "clear-input" }
  | { type: "close" };

export interface TabResult {
  state?: BarState;
  effects?: Effect[];
}

/** One answer to "what does Tab do here?". The first behavior that applies runs. */
export interface TabBehavior {
  id: string;
  applies(ctx: TabContext): boolean;
  run(ctx: TabContext): TabResult;
}

export interface Feature {
  id: FeatureId;
  /** Features of one group don't stack: when one recognizes the text, the rest of the group stays quiet. */
  group?: string;
  enabled(features: Features): boolean;
  /** Words that enter the feature on Tab ("md"); also forced prefixes ("md # Title"). */
  triggers: string[];
  recognizer: Recognizer;
  presentation?: Presentation;
  tab: TabBehavior[];
}
