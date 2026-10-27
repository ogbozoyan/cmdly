import { setLanguage, t } from "../i18n/index.ts";
import type { Draft, ResultItem } from "../shared/model.ts";
import { send } from "../shared/messages.ts";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { withSuggestions } from "../shared/suggestions.ts";
import { reduce, type BarEvent, type Step } from "../features/bar-state.ts";
import { createRegistry, type Registry } from "../features/registry.ts";
import { COMMON, type BarState, type Feature, type FeatureContext, type RowInfo } from "../features/types.ts";
import { PALETTE_VARS, type Palette } from "../shared/palette.ts";
import { localResults } from "../tools/local-results.ts";
import { copyText } from "./clipboard.ts";
import { escapeHtml, highlight } from "./highlight.ts";
import { ARROW_ICON, EXPAND_ICON, GLYPHS, SEARCH_ICON } from "./icons.ts";
import { withWebSearch } from "./results.ts";
import { showPageToast } from "./toast.ts";

export interface CommandBarOptions {
  /** true = drawn over a web page (shadow DOM), false = standalone palette page. */
  overlay: boolean;
  /** Removes the bar (overlay) or closes the palette tab. */
  close: () => void;
}

const TOAST_MS = 1800;

/**
 * The command bar UI: input + result list + preview panel.
 * Results come from two places: localResults() (instant, computed right here)
 * and the background "search" request (tabs, bookmarks, history, commands).
 * Rows with a `preview` (JSON, YAML, JWT) can be expanded into a viewer with Tab.
 */
const KEY_NAMES: Record<string, string> = { Enter: "enter", Entrée: "enter", Tab: "tab", Esc: "esc" };
/** How long a keycap in the hint shows its press before the key's action runs (the hint disappears with it). */
const KEY_FX_MS = 170;

/** Draws the key names in a hint ("Enter copy · Tab collapse") as keycaps. The text is escaped first. */
function keyHints(text: string): string {
  return escapeHtml(text).replace(/\b(Enter|Entrée|Tab|Esc)\b/g, (key) => `<kbd data-key="${KEY_NAMES[key]}">${key}</kbd>`);
}

export class CommandBar {
  readonly input: HTMLInputElement;

  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly previewPanel: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly options: CommandBarOptions;

  private settings: Settings = DEFAULT_SETTINGS;
  private items: ResultItem[] = [];
  private active = 0;
  /** Drops responses of outdated searches when the user types fast. */
  private requestId = 0;
  private previewOpen = false;
  /** Common, or inside one feature ("html" / "md" / "swagger" + Tab): then everything typed or pasted belongs to it. */
  private state: BarState = COMMON;
  private registry: Registry = createRegistry(DEFAULT_SETTINGS.features);
  private replaying = false;
  private morphTimer: ReturnType<typeof setTimeout> | undefined;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The <input> is single-line and drops line breaks on paste, which breaks YAML.
   * We keep the original pasted text while the input still shows it.
   */
  private pasted: { raw: string; shown: string } | null = null;

  constructor(container: Node, options: CommandBarOptions) {
    this.options = options;
    this.root = document.createElement("div");
    this.root.className = options.overlay ? "wrap overlay" : "wrap";
    this.root.innerHTML = `
      <div class="bar">
        <div class="input-row">
          <span class="loupe">${SEARCH_ICON}</span>
          <button class="mode-chip" hidden></button>
          <input type="text" placeholder="${escapeHtml(t("barPlaceholder"))}" autocomplete="off" spellcheck="false">
        </div>
        <ul class="results"></ul>
        <div class="preview" hidden>
          <div class="preview-head">
            <span class="preview-lang"></span>
            <span class="preview-rule"></span>
            <span class="preview-hint">${keyHints(t("previewHint"))}</span>
          </div>
          <pre class="code"></pre>
          <iframe class="frame" sandbox="" referrerpolicy="no-referrer" hidden></iframe>
          <div class="preview-notes"></div>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.panel = this.root.querySelector(".bar")!;
    this.input = this.root.querySelector("input")!;
    this.list = this.root.querySelector(".results")!;
    this.previewPanel = this.root.querySelector(".preview")!;
    this.chip = this.root.querySelector(".mode-chip")!;

    this.bindEvents();
    this.applyAppearance();
    Promise.all([settingsRepository.get(), send({ type: "draft-get" })]).then(([settings, draft]) => {
      this.settings = settings;
      this.registry = createRegistry(settings.features);
      this.applyLanguage();
      this.applyAppearance();
      this.restoreDraft(draft);
      this.render();
    });
    this.input.focus();
  }

  /** Texts drawn before settings loaded used Chrome's language; redo them in the chosen one. */
  private applyLanguage(): void {
    setLanguage(this.settings.appearance.language);
    this.input.placeholder = this.placeholder();
    this.updateHint();
  }

  // ---------- draft (survives close / reload until something is run) ----------

  /** Restored text is selected: typing replaces it, arrows/Enter continue where the user stopped. */
  private restoreDraft(draft: Draft | null): void {
    if (!draft || this.input.value) return; // the user already started typing
    this.input.value = draft.text;
    if (draft.pasted) this.pasted = { raw: draft.pasted, shown: draft.text };
    this.input.select();
  }

  private saveDraftSoon(): void {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      const text = this.input.value;
      send({ type: "draft-save", draft: text.trim() ? { text, pasted: this.pasted?.raw } : null });
    }, 150);
  }

  private clearDraft(): void {
    clearTimeout(this.draftTimer);
    send({ type: "draft-save", draft: null });
  }

  // ---------- rendering ----------

  /** Text to analyze: the original paste (with line breaks) if the input still shows it. */
  private rawQuery(): string {
    return this.pasted && this.input.value === this.pasted.shown ? this.pasted.raw : this.input.value;
  }

  private featureContext(): FeatureContext {
    return { features: this.settings.features, tools: this.settings.tools };
  }

  /** The feature the bar is inside, if any. */
  private feature(): Feature | null {
    return this.state.kind === "feature" ? (this.registry.get(this.state.id) ?? null) : null;
  }

  private async render(keepActive = false): Promise<void> {
    const id = ++this.requestId;
    const raw = this.rawQuery();
    const inside = this.feature()?.presentation;
    // Inside a feature only the pasted text is rendered: no tabs, history, web search or suggestions,
    // and the pasted text never leaves the bar.
    if (inside) {
      const rows = inside.rows(raw, this.featureContext());
      this.previewOpen = !!rows[0]?.preview;
      this.draw(rows, 0);
      return;
    }
    // Tool rows (calculator, JSON/YAML, JWT…) come first; web search, tabs and history always follow.
    const query = this.input.value.trim();
    const local = [...this.registry.recognize(raw, this.featureContext()), ...localResults(raw, this.settings.features)];
    // Text that a tool understood (JSON, JWT, math…) is never sent to the search engine.
    const suggestions = local.length ? null : this.suggest(query, id);
    const remote = (await send({ type: "search", query, overlay: this.options.overlay })) ?? [];
    if (id !== this.requestId) return;

    const previous = this.active;
    const items = withWebSearch([...local, ...remote], query);
    this.draw(items, keepActive ? Math.min(previous, items.length - 1) : 0);

    // Suggestions arrive later (network); tabs and history are already on screen.
    const rows = (await suggestions) ?? [];
    if (id !== this.requestId || !rows.length) return;
    const selected = this.items[this.active];
    const merged = withSuggestions(this.items, rows);
    this.draw(merged, this.active === 0 ? 0 : Math.max(merged.indexOf(selected), 0));
  }

  private draw(items: ResultItem[], active: number): void {
    this.items = items;
    this.list.replaceChildren(...items.map((item, i) => this.renderRow(item, i)));
    this.setActive(active);
  }

  /** Short pause first: fast typing sends only the last query, not every letter. */
  private async suggest(query: string, id: number): Promise<ResultItem[] | null> {
    if (!this.settings.sources.suggestions || !query) return null;
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (id !== this.requestId) return null;
    return send({ type: "suggest", query });
  }

  private renderRow(item: ResultItem, index: number): HTMLLIElement {
    const li = document.createElement("li");
    li.append(this.renderIcon(item), this.renderTitle(item));

    if (item.variant) {
      const chip = document.createElement("button");
      chip.className = "variant";
      chip.title = t("variantSwitch", item.variant.next);
      chip.textContent = `${item.variant.value} ⇥`;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setActive(index);
        this.cycleVariant();
      });
      li.append(chip);
    }

    if (item.preview) {
      const expand = document.createElement("button");
      expand.className = "expand";
      expand.title = t("expand");
      expand.innerHTML = EXPAND_ICON;
      expand.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setActive(index);
        this.togglePreview();
      });
      li.append(expand);
    }

    if (item.action) {
      const action = document.createElement("span");
      action.className = "action";
      action.textContent = item.action;
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.innerHTML = ARROW_ICON;
      action.append(arrow);
      li.append(action);
    }

    li.addEventListener("mousemove", () => this.active !== index && this.setActive(index));
    li.addEventListener("click", (e) => this.choose(item, e.metaKey));
    return li;
  }

  private renderIcon(item: ResultItem): HTMLElement {
    const icon = document.createElement("span");
    icon.className = "icon";
    if (item.kind === "search") {
      icon.innerHTML = SEARCH_ICON;
    } else if (item.glyph) {
      icon.classList.add("glyph");
      icon.innerHTML = GLYPHS[item.glyph];
    } else if (item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.onerror = () => img.remove();
      icon.append(img);
    }
    return icon;
  }

  private renderTitle(item: ResultItem): HTMLElement {
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = item.title;
    if (item.meta) {
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = "— " + item.meta;
      title.append(meta);
    }
    return title;
  }

  private setActive(index: number): void {
    if (!this.items.length) return;
    this.active = (index + this.items.length) % this.items.length;
    [...this.list.children].forEach((li, i) => li.classList.toggle("active", i === this.active));
    this.list.children[this.active]?.scrollIntoView({ block: "nearest" });
    this.renderPreview();
  }

  private placeholder(): string {
    const label = this.feature()?.presentation?.label();
    return label ? t("markupPlaceholder", label) : t("barPlaceholder");
  }

  /** Moves into a feature (empty input) or back to the common bar; leaving keeps the text. */
  private enter(next: BarState, keepText = false): void {
    const inside = next.kind === "feature";
    this.state = next;
    const feature = this.feature();
    this.previewOpen = false;
    // A typed trigger word starts an empty mode; a hint row carries the text it noticed into the mode.
    if (inside && !keepText) {
      this.input.value = "";
      this.pasted = null;
      this.clearDraft();
    }
    const label = feature?.presentation?.label();
    this.chip.hidden = !feature;
    this.chip.textContent = label ?? "";
    this.input.placeholder = this.placeholder();
    this.applyFeatureTheme(feature);
    this.updateHint();
    this.render();
  }

  private featurePalette(feature: Feature | null): Palette | null {
    const theme = feature?.presentation?.theme;
    if (!theme) return null;
    return this.root.classList.contains("light") ? theme.light : theme.dark;
  }

  /** Recolors the bar for the feature and replays the transition: colors fade, the chip springs out, the bar breathes once. */
  private applyFeatureTheme(feature: Feature | null): void {
    const palette = this.featurePalette(feature);
    for (const [key, name] of Object.entries(PALETTE_VARS) as [keyof Palette, string][]) {
      if (palette) this.root.style.setProperty(name, palette[key]);
      else this.root.style.removeProperty(name);
    }
    // The accent is a user setting: keep it when leaving a feature.
    if (!palette) this.root.style.setProperty("--accent", this.settings.appearance.accent);
    if (feature) this.root.dataset.mode = feature.id;
    else delete this.root.dataset.mode;

    this.root.classList.remove("morph");
    void this.root.offsetWidth; // restart the animations
    this.root.classList.add("morph");
    clearTimeout(this.morphTimer);
    this.morphTimer = setTimeout(() => this.root.classList.remove("morph"), 900);
  }

  // ---------- keys: the reducer decides, this runs the outcome ----------

  private rowInfo(): RowInfo | null {
    const row = this.items[this.active];
    return row ? { feature: row.feature, enters: !!row.enters, hasPreview: !!row.preview, hasVariant: !!row.variant } : null;
  }

  private dispatch(event: BarEvent): Step {
    const step = reduce(this.state, event, this.registry);
    const changed = step.state.kind !== this.state.kind || (step.state.kind === "feature" && this.state.kind === "feature" && step.state.id !== this.state.id);
    if (changed) this.enter(step.state, event.type === "tab" && !!event.row?.enters);
    for (const effect of step.effects) {
      if (effect.type === "toggle-preview") this.togglePreview();
      else if (effect.type === "cycle-variant") this.cycleVariant();
      else if (effect.type === "clear-input") {
        this.input.value = "";
        this.clearDraft();
        this.render();
      } else this.options.close();
    }
    return step;
  }

  /** Tab on a row with a variant (UUID version): switch, remember in settings, regenerate. */
  private async cycleVariant(): Promise<void> {
    const variant = this.items[this.active]?.variant;
    if (!variant) return;
    this.settings = { ...this.settings, tools: { ...this.settings.tools, [variant.setting]: variant.next } };
    await this.render(true);
    await settingsRepository.save(this.settings);
  }

  /**
   * Enter / Tab / Esc while the preview is open: the matching keycap in the hint sinks like a real key,
   * then the key is handled as usual.
   */
  private pressed(e: KeyboardEvent): boolean {
    const name = e.shiftKey ? undefined : KEY_NAMES[e.key === "Escape" ? "Esc" : e.key];
    if (!name || this.replaying || this.previewPanel.hidden) return false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const cap = this.previewPanel.querySelector<HTMLElement>(`kbd[data-key="${name}"]`);
    if (!cap) return false;
    e.preventDefault();
    cap.classList.remove("hit");
    void cap.offsetWidth; // restart the animation
    cap.classList.add("hit");
    const { key, metaKey } = e;
    setTimeout(() => {
      this.replaying = true;
      this.input.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey, bubbles: true, cancelable: true }));
      this.replaying = false;
    }, KEY_FX_MS);
    return true;
  }

  private caretAtEnd(): boolean {
    const { selectionStart, selectionEnd, value } = this.input;
    return selectionStart === value.length && selectionEnd === value.length;
  }

  /** Tab / → on a search suggestion copies it into the input so it can be extended. */
  private completeSuggestion(): boolean {
    const row = this.items[this.active];
    if (!row?.suggestion || row.title === this.input.value) return false;
    this.input.value = row.title;
    this.pasted = null;
    this.input.setSelectionRange(row.title.length, row.title.length);
    this.saveDraftSoon();
    this.render();
    return true;
  }

  private updateHint(): void {
    this.root.querySelector(".preview-hint")!.innerHTML = keyHints(t(this.feature()?.presentation?.hint ?? "previewHint"));
  }

  private togglePreview(): void {
    this.previewOpen = !this.previewOpen;
    this.renderPreview();
  }

  /** Shows the active row's preview while the panel is open; hides it for rows without one. */
  private renderPreview(): void {
    const preview = this.items[this.active]?.preview;
    const visible = this.previewOpen && !!preview;
    this.previewPanel.hidden = !visible;
    this.root.classList.toggle("previewing", visible);
    this.list.querySelectorAll(".expand").forEach((b) => b.classList.toggle("open", this.previewOpen));
    if (!visible || !preview) return;

    this.previewPanel.querySelector(".preview-lang")!.textContent = preview.label ?? preview.language.toUpperCase();
    const code = this.previewPanel.querySelector("pre")!;
    const frame = this.previewPanel.querySelector("iframe")!;
    code.hidden = preview.language === "html";
    frame.hidden = preview.language !== "html";
    if (preview.language === "html") {
      // sandbox="" = no scripts, forms, popups or same-origin; the document's own CSP blocks the network.
      if (frame.srcdoc !== preview.content) frame.srcdoc = preview.content;
    } else {
      code.innerHTML = highlight(preview.content, preview.language);
      code.scrollTop = 0;
    }
    const notes = this.previewPanel.querySelector(".preview-notes")!;
    notes.replaceChildren(
      ...(preview.notes ?? []).map((text) => {
        const note = document.createElement("div");
        note.textContent = text;
        return note;
      })
    );
  }

  private applyAppearance(): void {
    const a = this.settings.appearance;
    const dark = a.theme === "dark" || (a.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    this.root.classList.toggle("light", !dark);
    this.root.classList.toggle("top", a.position === "top");
    this.root.style.setProperty("--accent", a.accent);
    this.root.style.setProperty("--width", `${a.width}px`);
  }

  /** The toast is not part of the bar: the overlay closes at once (⌘T works right away), the toast stays. */
  private showToast(text: string): void {
    showPageToast(text, TOAST_MS);
    if (this.options.overlay) return this.options.close();
    // The palette page is a tab of its own: it has to stay open until the toast is gone.
    this.panel.hidden = true;
    setTimeout(this.options.close, TOAST_MS);
  }

  // ---------- actions ----------

  private async choose(item: ResultItem | undefined, inBackground: boolean): Promise<void> {
    const text = this.input.value.trim();
    if (!item && !text) return;

    if (item?.enters) return this.enter({ kind: "feature", id: item.enters }, true);

    this.clearDraft(); // the work is done — next time the bar opens empty
    if (item?.kind === "command") return this.runCommand(item);

    if (item?.copy != null) {
      await copyText(item.copy, this.root);
      const preview = item.copy.length > 40 ? item.copy.slice(0, 40) + "…" : item.copy;
      return this.showToast(t("copied", preview.replace(/\s+/g, " ")));
    }

    if (this.options.overlay) this.options.close();
    await send({ type: "open", item, text, inBackground, overlay: this.options.overlay });
  }

  private async runCommand(item: ResultItem): Promise<void> {
    const result = (await send({ type: "command", id: item.commandId!, overlay: this.options.overlay })) ?? {};
    if (result.copy) await copyText(result.copy, this.root);
    if (result.toast) this.showToast(result.toast);
    else if (this.options.overlay || result.closePalette) this.options.close();
  }

  // ---------- events ----------

  private bindEvents(): void {
    this.chip.addEventListener("click", () => {
      this.enter(COMMON);
      this.input.focus();
    });

    this.input.addEventListener("input", () => {
      if (this.pasted && this.input.value !== this.pasted.shown) this.pasted = null;
      this.saveDraftSoon();
      this.render();
    });

    this.input.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.includes("\n")) return; // single line — let the input handle it normally
      e.preventDefault();
      const shown = text.replace(/\s*\n\s*/g, " ").trim();
      this.pasted = { raw: text, shown };
      this.input.value = shown;
      this.input.setSelectionRange(shown.length, shown.length);
      this.saveDraftSoon();
      this.render();
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const key = e.key;
      if (this.pressed(e)) return;
      if (key === "ArrowDown" || (e.ctrlKey && key === "n")) {
        e.preventDefault();
        this.setActive(this.active + 1);
      } else if (key === "ArrowUp" || (e.ctrlKey && key === "p")) {
        e.preventDefault();
        this.setActive(this.active - 1);
      } else if (key === "Enter") {
        e.preventDefault();
        this.choose(this.items[this.active], e.metaKey);
      } else if (key === "Backspace") {
        const step = this.dispatch({ type: "backspace", input: this.input.value });
        if (step.handled) e.preventDefault();
      } else if ((key === "Tab" && !e.shiftKey && this.completeSuggestion()) || (key === "ArrowRight" && this.caretAtEnd() && this.completeSuggestion())) {
        e.preventDefault();
      } else if (key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        this.dispatch({ type: "tab", input: this.input.value, row: this.rowInfo() });
      } else if (key === "Escape") {
        e.preventDefault();
        this.dispatch({ type: "escape", input: this.input.value, row: this.rowInfo(), previewOpen: this.previewOpen });
      }
    });

    // Click outside the panel closes the overlay.
    this.root.addEventListener("mousedown", (e) => {
      if (this.options.overlay && !this.panel.contains(e.target as Node)) {
        e.preventDefault();
        this.options.close();
      }
    });
  }
}
