// Thin Stripe REST client (no SDK, like the other providers here) plus webhook signature
// verification. The secret key is read only in this file and is never logged or returned.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Pinned so Stripe's response shapes can't change underneath us when the account upgrades. */
const STRIPE_API_VERSION = "2025-03-31.basil";

/** Both keys are needed: without the webhook secret a payment could never be confirmed. */
export const stripeConfigured = () => Boolean(env().STRIPE_SECRET_KEY && env().STRIPE_WEBHOOK_SECRET);

export class StripeError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, code: string | undefined, message: string) {
    super(message);
    this.name = "StripeError";
    this.status = status;
    this.code = code;
  }
}

type Params = { [key: string]: ParamValue };
type ParamValue = string | number | boolean | null | undefined | ParamValue[] | Params;

/** Stripe's form encoding: `{ a: { b: [1] } }` becomes `a[b][0]=1`. Skips null/undefined. */
export function encodeForm(params: Params): string {
  const out = new URLSearchParams();
  const walk = (key: string, value: ParamValue) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${key}[${i}]`, v));
    else if (typeof value === "object") for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v);
    else out.append(key, String(value));
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.toString();
}

/**
 * Calls the Stripe API. GET sends `params` as the query string, POST as the form body.
 * Throws StripeError for any non-2xx response.
 */
export async function stripe<T>(
  method: "GET" | "POST",
  path: string,
  params: Params = {},
  options: { idempotencyKey?: string } = {},
): Promise<T> {
  const config = env();
  if (!config.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  const encoded = encodeForm(params);
  const url = `${config.STRIPE_API_URL}/v1${path}${method === "GET" && encoded ? `?${encoded}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: method === "POST" ? encoded : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; type?: string; message?: string } } | null;
  if (!res.ok) {
    // Stripe's message can echo request details; keep the type/code, which are safe to log.
    throw new StripeError(res.status, body?.error?.code, `Stripe ${method} ${path.split("/")[1]} failed: ${res.status} ${body?.error?.code ?? body?.error?.type ?? ""}`.trim());
  }
  return body as T;
}

/** Runs a Stripe call, returning null instead of throwing when the object doesn't exist. */
export async function ifExists<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof StripeError && (err.code === "resource_missing" || err.status === 404)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------- webhook signatures

export type StripeEvent = { id: string; type: string; created?: number; data: { object: Record<string, unknown> } };

/** Events older than this are rejected, which stops a captured request being replayed later. */
const TOLERANCE_SEC = 5 * 60;

/**
 * Verifies a webhook's `Stripe-Signature` header against the RAW request body and returns the
 * event, or null when the signature is missing, wrong or too old. Never throws.
 */
export function verifyWebhook(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): StripeEvent | null {
  if (!header || !secret) return null;
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !Number.isFinite(timestamp) || signatures.length === 0) return null;
  if (Math.abs(nowSec - timestamp) > TOLERANCE_SEC) return null;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const valid = signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    return timingSafeEqual(Buffer.from(sig, "hex"), expected);
  });
  if (!valid) return null;

  try {
    const event = JSON.parse(rawBody) as StripeEvent;
    if (typeof event?.id !== "string" || typeof event.type !== "string" || typeof event.data?.object !== "object" || event.data.object === null) return null;
    return event;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the response fields we read

export type StripeList<T> = { data: T[] };
export type StripeProduct = { id: string; deleted?: boolean };
export type StripePrice = {
  id: string;
  active: boolean;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
  metadata?: Record<string, string>;
};
export type StripeCustomer = {
  id: string;
  deleted?: boolean;
  invoice_settings?: { default_payment_method?: string | { id: string } | null };
};
export type StripeSubscriptionItem = { id: string; price: StripePrice; current_period_start?: number; current_period_end?: number };
export type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  canceled_at: number | null;
  metadata?: Record<string, string>;
  items: StripeList<StripeSubscriptionItem>;
  // Older API versions carried the period on the subscription instead of its items.
  current_period_start?: number;
  current_period_end?: number;
};
export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  mode: string;
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
};
export type StripePortalSession = { id: string; url: string };
export type StripePaymentMethod = { id: string; card?: { brand: string; last4: string; exp_month: number; exp_year: number } };

/** Stripe returns related objects as an id or, when expanded, the object. */
export const idOf = (ref: string | { id: string } | null | undefined): string | null => (!ref ? null : typeof ref === "string" ? ref : ref.id);
