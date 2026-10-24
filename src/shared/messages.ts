import type { CommandResult, ResultItem } from "./model.ts";

/**
 * Message contract between UI / content scripts and the background service worker.
 * Think of it as the REST API of the background: `type` is the endpoint,
 * the rest of the object is the request body. Handled in src/background/router.ts.
 */
export type Request =
  | { type: "search"; query: string; overlay: boolean }
  | { type: "open"; item?: ResultItem; text: string; inBackground: boolean; overlay: boolean }
  | { type: "command"; id: string; overlay: boolean }
  | { type: "newtab-opened" }
  | { type: "dismiss-page" }
  | { type: "restore-tab" }
  | { type: "open-bar" }
  | { type: "tab-url" };

/** Response type for each request type. */
export interface ResponseMap {
  search: ResultItem[];
  open: void;
  command: CommandResult;
  "newtab-opened": void;
  "dismiss-page": void;
  "restore-tab": void;
  "open-bar": void;
  "tab-url": string | null;
}

/** Typed wrapper around chrome.runtime.sendMessage. Resolves to null if the background failed. */
export function send<R extends Request>(request: R): Promise<ResponseMap[R["type"]] | null> {
  return chrome.runtime.sendMessage(request).catch(() => null);
}
