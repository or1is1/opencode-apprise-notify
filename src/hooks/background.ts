import type { Hooks } from "@opencode-ai/plugin";
import type { DedupChecker } from "../dedup.js";
import type { PluginConfig } from "../types.js";
import { createPayload, sendHookNotification } from "./shared.js";

export function createBackgroundHook(
  config: PluginConfig,
  dedup: DedupChecker,
): NonNullable<Hooks["event"]> {
  return async ({ event }) => {
    if (event.type !== "session.status") return;

    const props = event.properties as { sessionID: string; status: { type: string } };
    if (props.status.type !== "idle") return;

    const payload = createPayload("background", "✅ Background Task Complete", {
      taskName: `Session ${props.sessionID}`,
    });

    await sendHookNotification("background", config, dedup, payload);
  };
}
