/** Replaces Chrome's new tab page. The background decides what Cmd+T shows (see bar-service.handleNewTab). */
import { send } from "../shared/messages.ts";

send({ type: "newtab-opened" });
