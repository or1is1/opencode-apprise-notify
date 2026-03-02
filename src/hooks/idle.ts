import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { DedupChecker } from "../dedup.js";
import { formatNotification, formatTodoStatus } from "../formatter.js";
import { sendNotification } from "../notifier.js";
import type { PluginConfig } from "../types.js";

type EventWithSessionID = {
  properties?: {
    sessionID?: string;
    info?: {
      id?: string;
      sessionID?: string;
    };
  };
};

function extractText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const maybeMessage = message as {
    parts?: Array<{ type?: string; text?: string }>;
  };

  if (!Array.isArray(maybeMessage.parts)) {
    return undefined;
  }

  const text = maybeMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();

  return text.length > 0 ? text : undefined;
}

export function createIdleHook(
  input: PluginInput,
  config: PluginConfig,
  dedup: DedupChecker
): NonNullable<Hooks["event"]> {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  return async ({ event }) => {
    if (event.type === "session.idle") {
      const { sessionID } = event.properties;

      const existing = pendingTimers.get(sessionID);
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(async () => {
        pendingTimers.delete(sessionID);

        try {
          const messagesResult = await input.client.session.messages({ path: { id: sessionID } });
          const messages = messagesResult.data ?? [];

          const userMessages = messages.filter(
            (message: { info?: { role?: string } }) => message.info?.role === "user"
          );
          const assistantMessages = messages.filter(
            (message: { info?: { role?: string } }) => message.info?.role === "assistant"
          );

          const lastUser = userMessages[userMessages.length - 1];
          const lastAssistant = assistantMessages[assistantMessages.length - 1];

          const todosResult = await input.client.session.todo({ path: { id: sessionID } });
          const todos = todosResult.data ?? [];

          const todoStatus = todos.length > 0 ? formatTodoStatus(todos) : undefined;

          const payload = {
            type: "idle" as const,
            title: "📢 OpenCode Attention Required",
            context: {
              userRequest: extractText(lastUser),
              agentResponse: extractText(lastAssistant),
              question: undefined,
              options: undefined,
              todoStatus,
              taskName: undefined,
              toolName: undefined,
              action: undefined,
            },
          };

          if (dedup.isDuplicate(payload)) {
            return;
          }

          const formatted = formatNotification(payload, config.truncateLength);
          await sendNotification(config, formatted);
        } catch (error: unknown) {
          console.warn("[opencode-apprise-notify] idle hook error:", error);
        }
      }, config.idleDelayMs);

      pendingTimers.set(sessionID, timer);
    }

    if (event.type === "message.updated" || event.type === "session.created") {
      const typedEvent = event as EventWithSessionID;
      const sessionID =
        typedEvent.properties?.sessionID ??
        typedEvent.properties?.info?.sessionID ??
        typedEvent.properties?.info?.id;

      if (sessionID) {
        const existing = pendingTimers.get(sessionID);
        if (existing) {
          clearTimeout(existing);
          pendingTimers.delete(sessionID);
        }
      }
    }
  };
}
