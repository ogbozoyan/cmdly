/** Replaces Chrome's new tab page. The background decides what Cmd+T shows (see bar-service.handleNewTab). */
import { t } from "../i18n/index.ts";
import { send } from "../shared/messages.ts";
import { initLogging } from "../shared/log-runtime.ts";

initLogging("newtab");

document.title = t("newTabTitle");

send({ type: "newtab-opened" });
