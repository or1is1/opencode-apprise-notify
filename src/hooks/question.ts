import type { Hooks } from "@opencode-ai/plugin";
import type { DedupChecker } from "../dedup.js";
import { formatNotification } from "../formatter.js";
import { sendNotification } from "../notifier.js";
import type { PluginConfig } from "../types.js";

export interface QuestionHooks {
  before: NonNullable<Hooks["tool.execute.before"]>;
  after: NonNullable<Hooks["tool.execute.after"]>;
}

export function createQuestionHooks(
  config: PluginConfig,
  dedup: DedupChecker,
  delayMs: number = 30_000
): QuestionHooks {
  // Track pending timers per callID
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const before: NonNullable<Hooks["tool.execute.before"]> = async (input, output) => {
    // Case-insensitive match for "question" tool
    if (input.tool.toLowerCase() !== "question") return;

    const { callID } = input;

    // Extract question and options from args
    // Question tool args shape: { question: string, options?: string[] }
    const args = output.args as { question?: string; options?: string[] } | undefined;
    const questionText = args?.question;
    const options = args?.options;

    const payload = {
      type: "question" as const,
      title: "❓ OpenCode Question",
      context: {
        userRequest: undefined,
        agentResponse: undefined,
        question: questionText,
        options,
        todoStatus: undefined,
        taskName: undefined,
        toolName: "Question",
        action: undefined,
      },
    };

    if (dedup.isDuplicate(payload)) return;

    // Set a delayed notification — if user answers quickly, cancel via after hook
    const timer = setTimeout(async () => {
      pendingTimers.delete(callID);
      try {
        const formatted = formatNotification(payload, config.truncateLength);
        await sendNotification(config, formatted);
      } catch (err: unknown) {
        console.warn("[opencode-apprise-notify] question hook error:", err);
      }
    }, delayMs);

    pendingTimers.set(callID, timer);
  };

  const after: NonNullable<Hooks["tool.execute.after"]> = async (input, _output) => {
    // Cancel pending timer if user answered the question
    if (input.tool.toLowerCase() !== "question") return;
    const timer = pendingTimers.get(input.callID);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(input.callID);
    }
  };

  return { before, after };
}
