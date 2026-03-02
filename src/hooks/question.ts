import type { Hooks } from "@opencode-ai/plugin";
import type { DedupChecker } from "../dedup.js";
import type { PluginConfig } from "../types.js";
import { createPayload, sendHookNotification } from "./shared.js";

export interface QuestionHooks {
  before: NonNullable<Hooks["tool.execute.before"]>;
  after: NonNullable<Hooks["tool.execute.after"]>;
}

export function createQuestionHooks(
  config: PluginConfig,
  dedup: DedupChecker,
  delayMs: number = 30_000,
): QuestionHooks {
  const timers = new Map<string, NodeJS.Timeout>();

  const before: NonNullable<Hooks["tool.execute.before"]> = async (
    { tool, callID },
    input,
  ) => {
    if (tool.toLowerCase() !== "question") return;

    const args = (input as { args?: { question?: unknown; options?: unknown } } | undefined)?.args;
    const question = typeof args?.question === "string" ? args.question : undefined;
    const options = Array.isArray(args?.options)
      ? args.options.filter((option): option is string => typeof option === "string")
      : undefined;

    const timer = setTimeout(async () => {
      if (!question) return;

      const payload = createPayload("question", "❓ OpenCode Question", {
        question,
        options,
        toolName: "Question",
      });

      await sendHookNotification("question", config, dedup, payload);
    }, delayMs);

    timers.set(callID, timer);
  };

  const after: NonNullable<Hooks["tool.execute.after"]> = async ({
    tool,
    callID,
  }) => {
    if (tool.toLowerCase() !== "question") return;

    const timer = timers.get(callID);
    if (timer) {
      clearTimeout(timer);
      timers.delete(callID);
    }
  };

  return { before, after };
}
