import { log } from "../shared/log.ts";
/** Copies text. Falls back to execCommand on pages where the async Clipboard API is blocked. */
export async function copyText(text: string, container: Node = document.body): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    log.info("clipboard", "async clipboard blocked, using execCommand", error);
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    container.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
