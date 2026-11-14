// Anthropic Messages API over HTTPS (no SDK). The key is never logged or returned.
import "server-only";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "site-editor" });

export type ToolUse = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ContentBlock = { type: "text"; text: string } | ToolUse | { type: string; [k: string]: unknown };
export type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ModelMessage = { role: "user" | "assistant"; content: string | ContentBlock[] | ToolResult[] };
export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export type ModelReply = {
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function callModel(input: {
  system: string;
  tools: Tool[];
  messages: ModelMessage[];
  timeoutMs: number;
  /** Force a specific tool (used by Auto Pilot so every answer comes with a decision). */
  toolChoice?: { type: "tool"; name: string };
  maxTokens?: number;
}): Promise<ModelReply> {
  const config = env();
  let res: Response;
  try {
    res = await fetch(config.ASSISTANT_API_URL, {
      method: "POST",
      headers: { "x-api-key": config.ASSISTANT_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: config.ASSISTANT_MODEL,
        max_tokens: input.maxTokens ?? 16_000,
        system: input.system,
        tools: input.tools,
        messages: input.messages,
        ...(input.toolChoice && { tool_choice: input.toolChoice }),
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    log.warn("site_editor.model_unreachable", { err });
    throw new AppError("CONFLICT", "The AI provider didn't answer in time. Nothing was changed. Try again, or ask for a smaller change.");
  }
  if (!res.ok) {
    // Error bodies don't contain our key; keep only the status and a short excerpt.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    log.warn("site_editor.model_rejected", { status: res.status, detail });
    if (res.status === 401 || res.status === 403) throw new AppError("FORBIDDEN", "The AI provider rejected ASSISTANT_API_KEY. Check the key in Vercel.");
    if (res.status === 404) throw new AppError("NOT_FOUND", "The AI provider doesn't recognise the model in ASSISTANT_MODEL. Check its spelling in Vercel.");
    if (res.status === 429 || res.status === 529) throw new AppError("RATE_LIMITED", "The AI provider is busy or the account is over its limit. Nothing was changed. Try again shortly.");
    if (res.status === 400 && /credit|billing/i.test(detail)) throw new AppError("FORBIDDEN", "The Anthropic account has no credit left. Add credit in the Anthropic Console.");
    throw new Error(`AI provider error (${res.status})`);
  }
  return (await res.json()) as ModelReply;
}
