import type { IncomingMessage, ServerResponse } from "node:http";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeObject = Record<string, any> & { id: string; status?: string };

export type FakeStripe = {
  db: Record<"customers" | "products" | "prices" | "subscriptions" | "sessions" | "portals" | "invoices" | "methods", Record<string, FakeObject>>;
  /** When `declineUpdates` is true, plan changes fail like a declined card (HTTP 402). */
  flags: { declineUpdates: boolean };
  emit(type: string, object: unknown): Promise<unknown>;
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
};

export function createFakeStripe(options: { webhookUrl: string; webhookSecret: string; publicBase: string }): FakeStripe;
export function signPayload(payload: string, secret: string, timestamp?: number): string;
export function parseForm(body: string): Record<string, unknown>;
