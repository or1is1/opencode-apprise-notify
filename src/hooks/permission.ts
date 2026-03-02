import type { Hooks } from "@opencode-ai/plugin";
import type { DedupChecker } from "../dedup.js";
import type { PluginConfig } from "../types.js";
import { createPayload, sendHookNotification } from "./shared.js";

export interface PermissionHooks {
  /** Primary: permission.ask hook */
  permissionAsk: NonNullable<Hooks["permission.ask"]>;
  /** Fallback: event hook watching permission.asked */
  eventFallback: NonNullable<Hooks["event"]>;
}

export function createPermissionHooks(
  config: PluginConfig,
  dedup: DedupChecker,
): PermissionHooks {
  const notifiedPermissions = new Set<string>();

  // v1 Permission: { id, type, title, pattern?, sessionID, messageID, ... }
  const permissionAsk: NonNullable<Hooks["permission.ask"]> = async (input, _output) => {
    const permId = (input as { id?: string }).id ?? "unknown";
    if (notifiedPermissions.has(permId)) return;
    notifiedPermissions.add(permId);

    const title = (input as unknown as { title?: string }).title ?? "Unknown";
    const pattern = (input as unknown as { pattern?: string | string[] }).pattern;
    const action = Array.isArray(pattern) ? pattern.join(", ") : (pattern ?? "Unknown");

    const payload = createPayload("permission", "🔐 OpenCode Permission Required", {
      toolName: title,
      action,
    });

    await sendHookNotification("permission", config, dedup, payload);
  };

  // v2 PermissionRequest: { id, sessionID, permission, patterns, metadata, ... }
  const eventFallback: NonNullable<Hooks["event"]> = async ({ event }) => {
    const eventType: string = event.type;
    if (eventType !== "permission.asked") return;

    const props = (event as unknown as { properties: { id: string; permission: string; patterns: string[] } }).properties;

    const permId = props.id ?? "unknown";
    if (notifiedPermissions.has(permId)) return;
    notifiedPermissions.add(permId);

    const payload = createPayload("permission", "🔐 OpenCode Permission Required", {
      toolName: props.permission ?? "Unknown",
      action: props.patterns?.join(", ") ?? "Unknown",
    });

    await sendHookNotification("permission", config, dedup, payload);
  };

  return { permissionAsk, eventFallback };
}
