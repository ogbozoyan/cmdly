/**
 * Options page. Every form control has data-path="section.key" pointing into Settings;
 * changes are saved immediately. Shortcuts are recorded by pressing keys.
 */
import { localizePage, t } from "../i18n/index.ts";
import { UUID_DESCRIPTIONS, isUuidVersion } from "../tools/uuid.ts";
import { DEFAULT_SETTINGS, fromImportFile, toExportFile, type Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { bugReportUrl, featureRequestUrl } from "../shared/feedback.ts";
import { IS_MAC } from "../shared/platform.ts";
import { formatShortcut, isValidShortcut, shortcutFromEvent } from "../shared/shortcuts.ts";

type ShortcutName = keyof Settings["shortcuts"];

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

localizePage();
document.title = t("optTitle");
document.querySelectorAll<HTMLOptionElement>('[data-path="tools.uuidVersion"] option').forEach((option) => {
  if (isUuidVersion(option.value)) option.textContent = `${option.value} — ${t(UUID_DESCRIPTIONS[option.value])}`;
});

let settings: Settings;
let recording: { name: ShortcutName; button: HTMLButtonElement } | null = null;

// ---------- generic fields ----------

const fields = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-path]")];

function getPath(path: string): unknown {
  return path.split(".").reduce<any>((obj, key) => obj[key], settings);
}

function setPath(path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  keys.reduce<any>((obj, key) => obj[key], settings)[last] = value;
}

function readField(el: HTMLInputElement | HTMLSelectElement): unknown {
  if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked;
  if (el instanceof HTMLInputElement && (el.type === "number" || el.type === "range")) {
    const n = parseInt(el.value, 10);
    return Number.isNaN(n) ? null : Math.min(Math.max(n, +el.min), +el.max);
  }
  return el.value;
}

function fillForm(): void {
  for (const el of fields) {
    const value = getPath(el.dataset.path!);
    if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = value as boolean;
    else el.value = String(value);
  }
  for (const source of ["tabs", "bookmarks", "history"] as const) {
    $<HTMLInputElement>(`[data-path="limits.${source}"]`).disabled = !settings.sources[source];
  }
  // Rows that only matter while another switch is on (e.g. the suggestion engine).
  for (const row of document.querySelectorAll<HTMLElement>("[data-requires]")) {
    const on = getPath(row.dataset.requires!) === true;
    row.classList.toggle("off", !on);
    row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-path]").forEach((el) => (el.disabled = !on));
  }
  $("#width-value").textContent = `${settings.appearance.width}px`;
  fillShortcuts();
}

async function persist(message = t("optSaved")): Promise<void> {
  await settingsRepository.save(settings);
  fillForm();
  flash(message);
}

for (const el of fields) {
  el.addEventListener(el.type === "range" ? "input" : "change", () => {
    const value = readField(el);
    if (value === null) return;
    setPath(el.dataset.path!, value);
    persist();
  });
}

// ---------- shortcuts ----------

function fillShortcuts(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-shortcut]").forEach((button) => {
    if (recording?.button === button) return;
    const value = settings.shortcuts[button.dataset.shortcut as ShortcutName];
    button.textContent = value ? formatShortcut(value) : t("optDisabled");
    button.classList.toggle("off", !value);
  });
}

function startRecording(name: ShortcutName, button: HTMLButtonElement): void {
  stopRecording();
  recording = { name, button };
  button.textContent = t("optPressKeys");
  button.classList.add("recording");
}

function stopRecording(): void {
  recording?.button.classList.remove("recording");
  recording = null;
  fillShortcuts();
}

document.addEventListener(
  "keydown",
  (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return stopRecording();
    const shortcut = shortcutFromEvent(e);
    if (!shortcut) return; // only modifiers held so far
    if (!isValidShortcut(shortcut)) {
      recording.button.textContent = t("optAddModifier");
      return;
    }
    settings.shortcuts[recording.name] = shortcut;
    stopRecording();
    persist();
  },
  true
);

document.querySelectorAll<HTMLButtonElement>("[data-shortcut]").forEach((button) => {
  button.addEventListener("click", () => startRecording(button.dataset.shortcut as ShortcutName, button));
});

document.querySelectorAll<HTMLButtonElement>("[data-shortcut-reset]").forEach((button) => {
  button.addEventListener("click", () => {
    const name = button.dataset.shortcutReset as ShortcutName;
    settings.shortcuts[name] = DEFAULT_SETTINGS.shortcuts[name];
    stopRecording();
    persist();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-shortcut-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    settings.shortcuts[button.dataset.shortcutClear as ShortcutName] = "";
    stopRecording();
    persist();
  });
});

$("#chrome-shortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

/**
 * ⌘T without a flash needs a one-time step only the user can do: assign ⌘T to Cmdly's
 * "open-bar" command in Chrome (Chrome refuses it as a manifest default). Show where we are.
 */
async function renderNativeShortcut(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const assigned = commands.find((c) => c.name === "open-bar")?.shortcut ?? "";
  const key = IS_MAC ? "⌘T" : "Ctrl+T";
  const banner = $("#native-shortcut");
  banner.hidden = false;
  banner.classList.toggle("ok", !!assigned);
  $("#chrome-shortcuts").textContent = t(assigned ? "optBannerChange" : "optBannerOpen");
  $(".banner-title").textContent = assigned ? t("optBannerOkTitle", assigned) : t("optBannerSetupTitle", key);
  $(".banner-text").textContent = assigned ? t("optBannerOkText") : t("optBannerSetupText", key);
}

// Re-check when the user comes back from chrome://extensions/shortcuts.
window.addEventListener("focus", renderNativeShortcut);
renderNativeShortcut();

// ---------- export / import / reset ----------

$("#export").addEventListener("click", () => {
  const json = JSON.stringify(toExportFile(settings), null, 2);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  link.download = `cmdly-settings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("#import").addEventListener("click", () => $<HTMLInputElement>("#import-file").click());

$<HTMLInputElement>("#import-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow importing the same file again
  if (!file) return;
  try {
    settings = fromImportFile(JSON.parse(await file.text()));
    await persist(t("optImported"));
  } catch (error) {
    alert(t("optImportFailed", error instanceof SyntaxError ? t("optInvalidJson") : (error as Error).message));
  }
});

$("#reset").addEventListener("click", async () => {
  if (!confirm(t("optResetConfirm"))) return;
  await settingsRepository.reset();
  settings = await settingsRepository.get();
  fillForm();
  flash(t("optResetDone"));
});

// ---------- feedback & credits ----------

const environment = {
  version: chrome.runtime.getManifest().version,
  userAgent: navigator.userAgent,
  platform: navigator.platform,
};
$<HTMLAnchorElement>("#report-bug").href = bugReportUrl(environment);
$<HTMLAnchorElement>("#request-feature").href = featureRequestUrl(environment);
$("#version").textContent = environment.version;

// ---------- misc ----------

let flashTimer: ReturnType<typeof setTimeout> | undefined;
function flash(message: string): void {
  const badge = $("#saved");
  badge.textContent = message;
  badge.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (badge.hidden = true), 1400);
}

// Settings changed on another device or in another options tab.
settingsRepository.onChange((s) => {
  settings = s;
  fillForm();
});

settingsRepository.get().then((s) => {
  settings = s;
  fillForm();
});
