import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { DedupChecker } from "../dedup.js";
import { formatTodoStatus } from "../formatter.js";
import type { PluginConfig } from "../types.js";
import { createPayload, sendHookNotification } from "./shared.js";

interface MessagePart {
  type: string;
  text?: string;
  synthetic?: boolean;
}

interface SessionMessageWrapper {
  info: { role: string };
  parts: MessagePart[];
}

function extractText(parts: MessagePart[]): string | undefined {
  const textParts = parts.filter((p) => p.type === "text" && p.text);
  const nonSynthetic = textParts.filter((p) => !p.synthetic);
  const source = nonSynthetic.length > 0 ? nonSynthetic : textParts;
  const texts = source.map((p) => p.text as string);

  return texts.join("\n").trim() || undefined;
}

function isFullySyntheticMessage(parts: MessagePart[]): boolean {
  const textParts = parts.filter((p) => p.type === "text");
  return textParts.length > 0 && textParts.every((p) => p.synthetic === true);
}

export function createIdleHook(
  ctx: PluginInput,
  config: PluginConfig,
  dedup: DedupChecker,
  delayMs: number = 30_000,
): NonNullable<Hooks["event"]> {
  const pendingTimers = new Map<string, NodeJS.Timeout>();

  return async ({ event }) => {
    if (event.type !== "session.status") return;

    const props = event.properties as { sessionID: string; status: { type: string } };
    const sessionID = props.sessionID;
    if (!sessionID) return;

    if (props.status.type !== "idle") {
      const timer = pendingTimers.get(sessionID);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.delete(sessionID);
      }
      return;
    }

    const existing = pendingTimers.get(sessionID);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      pendingTimers.delete(sessionID);

      let userRequest: string | undefined = undefined;
      let agentResponse: string | undefined = undefined;
      let todoStatus: string | undefined = undefined;

      try {
        const sessionResponse = await ctx.client.session.get({ path: { id: sessionID } });
        const sessionInfo = sessionResponse.data as unknown as { parentID?: string; title?: string };
        if (sessionInfo.parentID) return;

        const sessionTitle = sessionInfo.title || undefined;

        const messagesResponse = await ctx.client.session.messages({
          path: { id: sessionID },
        });
        const messages = (messagesResponse.data ?? []) as unknown as SessionMessageWrapper[];

        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg?.info?.role === "user") {
            if (isFullySyntheticMessage(msg.parts)) continue;
            userRequest = extractText(msg.parts);
            break;
          }
        }

        if (userRequest) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg?.info?.role === "assistant") {
              agentResponse = extractText(msg.parts);
              break;
            }
          }
        }

        try {
          const todosResponse = await ctx.client.session.todo({
            path: { id: sessionID },
          });
          if (todosResponse.data) {
            todoStatus = formatTodoStatus(todosResponse.data);
          }
        } catch {
          // Session might not have todos — ignore
        }

        const payload = createPayload("idle", "📢 OpenCode Attention Required", {
          sessionTitle,
          userRequest,
          agentResponse,
          todoStatus,
        });

        await sendHookNotification("idle", config, dedup, payload);
      } catch (err: unknown) {
        console.warn("[opencode-plugin-apprise] failed to fetch session data:", err);
      }
    }, delayMs);

    pendingTimers.set(sessionID, timer);
  };
}
