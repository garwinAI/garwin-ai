import type { IncomingMessage, ServerResponse } from "node:http";

type FakeObject = Record<string, unknown> & { id: string; status?: string };

export type FakeStripe = {
  db: Record<"customers" | "products" | "prices" | "subscriptions" | "sessions" | "portals" | "invoices" | "methods", Record<string, FakeObject>>;
  emit(type: string, object: unknown): Promise<unknown>;
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
};

export function createFakeStripe(options: { webhookUrl: string; webhookSecret: string; publicBase: string }): FakeStripe;
export function signPayload(payload: string, secret: string, timestamp?: number): string;
export function parseForm(body: string): Record<string, unknown>;
