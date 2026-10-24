/** Standalone command bar page — used where scripts can't be injected (chrome:// pages). */
import { send } from "../shared/messages.ts";
import { CommandBar } from "../ui/command-bar.ts";

const bar = new CommandBar(document.body, {
  overlay: false,
  close: () => send({ type: "dismiss-page" }),
});

window.addEventListener("focus", () => bar.input.focus());
