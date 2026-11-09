import "server-only";

export type AssistantStatus = { available: false; reason: string } | { available: true };

/**
 * Whether the Assistant can answer. There is no AI provider integration yet (Phase 7), so this
 * is honestly "unavailable" even if ASSISTANT_API_KEY is set. When the integration lands, check
 * the key and provider health here; the UI already handles both states.
 */
export async function getAssistantStatus(): Promise<AssistantStatus> {
  return {
    available: false,
    reason: "The Assistant isn't connected to an AI provider yet. An admin can connect one in a future update.",
  };
}
