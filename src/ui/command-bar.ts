import { setLanguage, t } from "../i18n/index.ts";
import type { Draft, ResultItem } from "../shared/model.ts";
import { send } from "../shared/messages.ts";
import { DEFAULT_SETTINGS, type Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { withSuggestions } from "../shared/suggestions.ts";
import { localResults } from "../tools/local-results.ts";
import { markupLabel, markupModeFromPrefix, type MarkupKind } from "../tools/markup.ts";
import { copyText } from "./clipboard.ts";
import { escapeHtml, highlight } from "./highlight.ts";
import { ARROW_ICON, EXPAND_ICON, GLYPHS, SEARCH_ICON } from "./icons.ts";
import { withWebSearch } from "./results.ts";

export interface CommandBarOptions {
  /** true = drawn over a web page (shadow DOM), false = standalone palette page. */
  overlay: boolean;
  /** Removes the bar (overlay) or closes the palette tab. */
  close: () => void;
}

const TOAST_MS = 1100;

/**
 * The command bar UI: input + result list + preview panel + toast.
 * Results come from two places: localResults() (instant, computed right here)
 * and the background "search" request (tabs, bookmarks, history, commands).
 * Rows with a `preview` (JSON, YAML, JWT) can be expanded into a viewer with Tab.
 */
export class CommandBar {
  readonly input: HTMLInputElement;

  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly previewPanel: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly options: CommandBarOptions;

  private settings: Settings = DEFAULT_SETTINGS;
  private items: ResultItem[] = [];
  private active = 0;
  /** Drops responses of outdated searches when the user types fast. */
  private requestId = 0;
  private previewOpen = false;
  /** "html" / "md" / "swagger" + Tab: everything typed or pasted is treated as that format. */
  private markupMode: MarkupKind | null = null;
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
            <span class="preview-hint">${escapeHtml(t("previewHint"))}</span>
          </div>
          <pre class="code"></pre>
          <iframe class="frame" sandbox="" referrerpolicy="no-referrer" hidden></iframe>
          <div class="preview-notes"></div>
        </div>
      </div>
      <div class="toast" hidden></div>`;
    container.appendChild(this.root);

    this.panel = this.root.querySelector(".bar")!;
    this.input = this.root.querySelector("input")!;
    this.list = this.root.querySelector(".results")!;
    this.previewPanel = this.root.querySelector(".preview")!;
    this.toast = this.root.querySelector(".toast")!;
    this.chip = this.root.querySelector(".mode-chip")!;

    this.bindEvents();
    this.applyAppearance();
    Promise.all([settingsRepository.get(), send({ type: "draft-get" })]).then(([settings, draft]) => {
      this.settings = settings;
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
    this.input.placeholder = this.markupMode ? t("markupPlaceholder", markupLabel(this.markupMode)) : t("barPlaceholder");
    this.root.querySelector(".preview-hint")!.textContent = t("previewHint");
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

  private async render(keepActive = false): Promise<void> {
    const id = ++this.requestId;
    // Tool rows (calculator, JSON/YAML, JWT…) come first; web search, tabs and history always follow.
    const query = this.input.value.trim();
    const local = localResults(this.rawQuery(), this.settings.features, {
      ...this.settings.tools,
      markupMode: this.markupMode,
    });
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

  private setMarkupMode(mode: MarkupKind | null): void {
    this.markupMode = mode;
    this.previewOpen = false;
    this.input.value = "";
    this.pasted = null;
    this.clearDraft();
    this.chip.hidden = !mode;
    this.chip.textContent = mode ? markupLabel(mode) : "";
    this.input.placeholder = mode ? t("markupPlaceholder", markupLabel(mode)) : t("barPlaceholder");
    this.render();
  }

  /** Tab on a row with a variant (UUID version): switch, remember in settings, regenerate. */
  private async cycleVariant(): Promise<void> {
    const variant = this.items[this.active]?.variant;
    if (!variant) return;
    this.settings = { ...this.settings, tools: { ...this.settings.tools, [variant.setting]: variant.next } };
    await this.render(true);
    await settingsRepository.save(this.settings);
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

  private showToast(text: string): void {
    this.panel.hidden = true;
    this.toast.textContent = text;
    this.toast.hidden = false;
    setTimeout(this.options.close, TOAST_MS);
  }

  // ---------- actions ----------

  private async choose(item: ResultItem | undefined, inBackground: boolean): Promise<void> {
    const text = this.input.value.trim();
    if (!item && !text) return;

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
      this.setMarkupMode(null);
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
      if (key === "ArrowDown" || (e.ctrlKey && key === "n")) {
        e.preventDefault();
        this.setActive(this.active + 1);
      } else if (key === "ArrowUp" || (e.ctrlKey && key === "p")) {
        e.preventDefault();
        this.setActive(this.active - 1);
      } else if (key === "Enter") {
        e.preventDefault();
        this.choose(this.items[this.active], e.metaKey);
      } else if (key === "Backspace" && this.markupMode && !this.input.value) {
        e.preventDefault();
        this.setMarkupMode(null);
      } else if (key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const item = this.items[this.active];
        const prefixMode = this.settings.features.markup && !this.markupMode ? markupModeFromPrefix(this.input.value) : null;
        if (prefixMode) this.setMarkupMode(prefixMode);
        else if (item?.preview) this.togglePreview();
        else if (item?.variant) this.cycleVariant();
      } else if (key === "Escape") {
        e.preventDefault();
        // Esc collapses the preview, then clears the input, then closes the bar.
        if (this.previewOpen && this.items[this.active]?.preview) {
          this.togglePreview();
        } else if (this.markupMode) {
          this.setMarkupMode(null);
        } else if (this.input.value) {
          this.input.value = "";
          this.clearDraft();
          this.render();
        } else {
          this.options.close();
        }
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
