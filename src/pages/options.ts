/**
 * Options page. Every form control has data-path="section.key" pointing into Settings;
 * changes are saved immediately. Shortcuts are recorded by pressing keys.
 */
import { DEFAULT_SETTINGS, fromImportFile, toExportFile, type Settings } from "../shared/settings.ts";
import { settingsRepository } from "../shared/settings-repository.ts";
import { formatShortcut, isValidShortcut, shortcutFromEvent } from "../shared/shortcuts.ts";

type ShortcutName = keyof Settings["shortcuts"];

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

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
  $("#width-value").textContent = `${settings.appearance.width}px`;
  fillShortcuts();
}

async function persist(message = "Saved"): Promise<void> {
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
    button.textContent = value ? formatShortcut(value) : "Disabled";
    button.classList.toggle("off", !value);
  });
}

function startRecording(name: ShortcutName, button: HTMLButtonElement): void {
  stopRecording();
  recording = { name, button };
  button.textContent = "Press keys…";
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
      recording.button.textContent = "Add ⌘, Ctrl or ⌥";
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
    await persist("Imported");
  } catch (error) {
    alert(`Import failed: ${error instanceof SyntaxError ? "the file is not valid JSON" : (error as Error).message}`);
  }
});

$("#reset").addEventListener("click", async () => {
  if (!confirm("Reset all Cmdly settings to defaults?")) return;
  await settingsRepository.reset();
  settings = await settingsRepository.get();
  fillForm();
  flash("Reset");
});

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
