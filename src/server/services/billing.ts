// Billing: Admin-set prices, Stripe Checkout, plan changes, the billing portal and the webhook.
//
// Rules (see .github/copilot-instructions.md):
//  - An account's plan is NEVER set here directly. It follows from the `subscriptions` row, and
//    that row is only ever written from Stripe's own data (a verified webhook, or an object we
//    fetched from Stripe's API with our secret key). Nothing from the browser grants a plan.
//  - Billing is owner-only (assertOwner). Every query is scoped to the caller's account.
//  - Webhook handling is idempotent: `stripe_events` remembers every processed event id.
import "server-only";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, payments, planPrices, stripeEvents, subscriptions } from "@/db/schema";
import {
  CURRENT_STATUSES,
  isCurrentStatus,
  isInterval,
  isPaidPlan,
  mapStripeStatus,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/billing";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { PLAN_SPEC } from "@/lib/plans";
import {
  idOf,
  ifExists,
  stripe,
  stripeConfigured,
  StripeError,
  type StripeCheckoutSession,
  type StripeCustomer,
  type StripeEvent,
  type StripeList,
  type StripePaymentMethod,
  type StripePortalSession,
  type StripePrice,
  type StripeProduct,
  type StripeSubscription,
} from "@/server/stripe/client";
import { recordAudit } from "./audit";
import { assertOwner, getEntitlements } from "./entitlements";
import { notify } from "./notifications";
import { enforce, LIMITS } from "./rate-limit";
import type { RequestMeta } from "./security-events";

const log = logger.child({ module: "billing" });

const CURRENCY = "usd";
const NOT_SET_UP = "Payments aren't set up yet. Please try again later.";

export type PlanPrice = typeof planPrices.$inferSelect;
export type Payment = typeof payments.$inferSelect;

type BillingUser = { id: string; accountId: string; email: string; name: string };
type AdminUser = { id: string; role: string };

// ---------------------------------------------------------------- prices (Admin)

/** The prices people can buy right now: at most one per plan and interval. */
export async function listActivePrices(): Promise<PlanPrice[]> {
  return db.select().from(planPrices).where(eq(planPrices.active, true));
}

async function getActivePrice(plan: PaidPlanId, interval: BillingInterval) {
  const [row] = await db
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.planId, plan), eq(planPrices.interval, interval), eq(planPrices.currency, CURRENCY), eq(planPrices.active, true)));
  return row ?? null;
}

function assertAdmin(user: AdminUser) {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Only an Admin can change prices.");
}

/**
 * Sets a plan's price. Prices are never edited: the old row is deactivated and a new one added,
 * so history stays accurate and current subscribers keep the price they signed up at. With Stripe
 * connected, the matching Stripe price is created too (Stripe prices are immutable as well).
 */
export async function setPlanPrice(admin: AdminUser, plan: PaidPlanId, interval: BillingInterval, amountCents: number, meta?: RequestMeta) {
  assertAdmin(admin);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new AppError("VALIDATION", "Enter a valid amount.");

  const existing = await getActivePrice(plan, interval);
  const connected = stripeConfigured();
  if (existing?.amountCents === amountCents && (existing.stripePriceId || !connected)) return existing;

  const stripePriceId = connected ? await createStripePrice(plan, interval, amountCents) : null;

  const row = await db.transaction(async (tx) => {
    if (existing) await tx.update(planPrices).set({ active: false }).where(eq(planPrices.id, existing.id));
    const [created] = await tx
      .insert(planPrices)
      .values({ planId: plan, interval, amountCents, currency: CURRENCY, stripePriceId, active: true, createdBy: admin.id })
      .returning();
    await recordAudit(
      {
        accountId: null,
        actorUserId: admin.id,
        actorType: "admin",
        action: "price.changed",
        targetType: "plan_price",
        targetId: created.id,
        metadata: { plan, interval, amountCents, previousAmountCents: existing?.amountCents ?? null },
        meta,
      },
      tx,
    );
    return created;
  });

  // Stop the old price being bought. It may not exist in this Stripe account (test vs live keys).
  if (connected && existing?.stripePriceId) {
    await ifExists(() => stripe<StripePrice>("POST", `/prices/${existing.stripePriceId}`, { active: false })).catch((err) =>
      log.warn("price.archive_failed", { priceId: existing.id, err }),
    );
  }
  log.info("price.changed", { plan, interval, amountCents, adminId: admin.id });
  return row;
}

/**
 * Makes sure every active price exists in the connected Stripe account, creating any that are
 * missing: saved before Stripe was connected, or made under other keys (test vs live).
 * Returns how many were created.
 */
export async function syncPricesToStripe(admin: AdminUser, meta?: RequestMeta) {
  assertAdmin(admin);
  if (!stripeConfigured()) throw new AppError("CONFLICT", "Stripe isn't connected yet.");
  let created = 0;
  for (const price of await listActivePrices()) {
    if (!isPaidPlan(price.planId)) continue;
    const id = price.stripePriceId;
    const remote = id ? await ifExists(() => stripe<StripePrice>("GET", `/prices/${id}`)) : null;
    if (remote?.active && remote.unit_amount === price.amountCents) continue;
    const stripePriceId = await createStripePrice(price.planId, price.interval, price.amountCents);
    await db.update(planPrices).set({ stripePriceId }).where(eq(planPrices.id, price.id));
    created++;
  }
  if (created > 0) {
    await recordAudit({ accountId: null, actorUserId: admin.id, actorType: "admin", action: "price.synced", metadata: { created }, meta });
  }
  return created;
}

async function createStripePrice(plan: PaidPlanId, interval: BillingInterval, amountCents: number) {
  const product = await ensureProduct(plan);
  const price = await stripe<StripePrice>("POST", "/prices", {
    product,
    currency: CURRENCY,
    unit_amount: amountCents,
    recurring: { interval },
    metadata: { plan, interval },
  });
  return price.id;
}

/** One Stripe product per paid plan, with a fixed id so it is found again without storing it. */
async function ensureProduct(plan: PaidPlanId) {
  const id = `garwin_${plan}`;
  const existing = await ifExists(() => stripe<StripeProduct>("GET", `/products/${id}`));
  if (existing && !existing.deleted) return existing.id;
  try {
    const product = await stripe<StripeProduct>("POST", "/products", { id, name: `Garwin AI ${PLAN_SPEC[plan].name}`, metadata: { plan } });
    return product.id;
  } catch (err) {
    // Two saves at once: the other one created it first.
    if (err instanceof StripeError && err.code === "resource_already_exists") return id;
    throw err;
  }
}

// ---------------------------------------------------------------- reading an account's billing

/** The account's current subscription, or failing that its most recent one (e.g. canceled). */
export async function getSubscription(accountId: string) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.accountId, accountId))
    .orderBy(sql`${subscriptions.status} in ('incomplete', 'trialing', 'active', 'past_due') desc`, desc(subscriptions.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** What the Payments page shows. Members need `billing.view`; hosts always may. */
export async function getBillingOverview(user: { id: string; accountId: string }) {
  const ent = await getEntitlements(user);
  if (!ent.canManageBilling && !ent.can("billing.view")) throw new AppError("FORBIDDEN", "Your account host manages billing.");
  const [subscription, prices, history] = await Promise.all([
    getSubscription(ent.accountId),
    listActivePrices(),
    db.select().from(payments).where(eq(payments.accountId, ent.accountId)).orderBy(desc(payments.createdAt)).limit(24),
  ]);
  return { subscription, prices, payments: history };
}

// ---------------------------------------------------------------- customers, checkout, portal

async function ensureCustomer(accountId: string, user: BillingUser) {
  const [account] = await db.select({ customerId: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, accountId));
  if (account?.customerId) {
    const existing = await ifExists(() => stripe<StripeCustomer>("GET", `/customers/${account.customerId}`));
    if (existing && !existing.deleted) return existing.id;
    // The customer isn't in this Stripe account: made under other keys (test vs live), or deleted.
    // If a subscription still hangs off it, forgetting the customer would cut that subscription
    // loose from its webhooks, so stop instead. Otherwise start over with a new customer.
    const [live] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.accountId, accountId), eq(subscriptions.source, "stripe"), inArray(subscriptions.status, CURRENT_STATUSES)));
    if (live) {
      log.error("customer.missing_with_subscription", { accountId });
      throw new AppError("CONFLICT", "We couldn't find this workspace's billing record in Stripe. Please contact support.");
    }
    await db.update(accounts).set({ stripeCustomerId: null, updatedAt: new Date() }).where(eq(accounts.id, accountId));
  }
  const customer = await stripe<StripeCustomer>(
    "POST",
    "/customers",
    { email: user.email, name: user.name, metadata: { accountId } },
    // Per-minute key: a double click reuses one customer instead of creating two.
    { idempotencyKey: `customer-${accountId}-${Math.floor(Date.now() / 60_000)}` },
  );
  // Only set it if nobody else did in the meantime, then read back whichever won.
  await db
    .update(accounts)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(and(eq(accounts.id, accountId), sql`${accounts.stripeCustomerId} is null`));
  const [row] = await db.select({ id: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, accountId));
  return row.id!;
}

async function buyablePrice(plan: PaidPlanId, interval: BillingInterval) {
  const price = await getActivePrice(plan, interval);
  if (!price?.stripePriceId) throw new AppError("CONFLICT", "That plan isn't available to buy yet.");
  return price as PlanPrice & { stripePriceId: string };
}

/** Starts Stripe Checkout for a new subscription and returns the URL to send the host to. */
export async function createCheckout(user: BillingUser, plan: PaidPlanId, interval: BillingInterval, meta?: RequestMeta) {
  const ent = await assertOwner(user);
  if (!stripeConfigured()) throw new AppError("CONFLICT", NOT_SET_UP);
  await enforce(`billing:${ent.accountId}`, LIMITS.billingPerAccount);

  const current = await getSubscription(ent.accountId);
  if (current && isCurrentStatus(current.status)) {
    throw new AppError("CONFLICT", current.source === "stripe" ? "You already have a subscription. Use Switch to change plans." : "Your plan was set up by Garwin AI support. Contact support to change it.");
  }
  const price = await buyablePrice(plan, interval);
  const customer = await ensureCustomer(ent.accountId, user);
  const base = env().APP_URL;
  const session = await stripe<StripeCheckoutSession>("POST", "/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: ent.accountId,
    line_items: [{ price: price.stripePriceId, quantity: 1 }],
    subscription_data: { metadata: { accountId: ent.accountId } },
    allow_promotion_codes: true,
    success_url: `${base}/settings/payments?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/settings/payments?checkout=canceled`,
  });
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL");

  await recordAudit({ accountId: ent.accountId, actorUserId: user.id, action: "checkout.created", targetType: "plan", targetId: plan, metadata: { interval }, meta });
  log.info("checkout.created", { accountId: ent.accountId, plan, interval });
  return session.url;
}

/** Moves the account's Stripe subscription to another plan or interval, prorating the difference. */
export async function changePlan(user: BillingUser, plan: PaidPlanId, interval: BillingInterval, meta?: RequestMeta) {
  const ent = await assertOwner(user);
  if (!stripeConfigured()) throw new AppError("CONFLICT", NOT_SET_UP);
  await enforce(`billing:${ent.accountId}`, LIMITS.billingPerAccount);

  const current = await getSubscription(ent.accountId);
  if (!current || current.source !== "stripe" || !current.stripeSubscriptionId || !isCurrentStatus(current.status)) {
    throw new AppError("CONFLICT", "You don't have an active subscription to switch.");
  }
  if (current.status !== "active" && current.status !== "trialing") {
    throw new AppError("CONFLICT", "Fix your payment under Manage billing before switching plans.");
  }
  if (current.planId === plan && current.interval === interval) return;
  const price = await buyablePrice(plan, interval);

  const remote = await stripe<StripeSubscription>("GET", `/subscriptions/${current.stripeSubscriptionId}`);
  const item = remote.items.data[0];
  if (!item) throw new Error("Stripe subscription has no items");
  let updated: StripeSubscription;
  try {
    updated = await stripe<StripeSubscription>("POST", `/subscriptions/${remote.id}`, {
      items: [{ id: item.id, price: price.stripePriceId }],
      proration_behavior: "always_invoice",
      // If the card can't be charged for the difference, Stripe rejects the change and the
      // subscription stays exactly as it was.
      payment_behavior: "error_if_incomplete",
    });
  } catch (err) {
    if (err instanceof StripeError && err.status === 402) {
      throw new AppError("CONFLICT", "Your card was declined, so your plan wasn't changed. Update your card under Manage billing and try again.");
    }
    throw err;
  }
  await syncSubscription(updated);
  await recordAudit({
    accountId: ent.accountId,
    actorUserId: user.id,
    action: "subscription.plan_changed",
    targetType: "subscription",
    targetId: current.id,
    metadata: { from: { plan: current.planId, interval: current.interval }, to: { plan, interval } },
    meta,
  });
}

/** Stripe's hosted page for cards, invoices and cancelling. `returnPath` must be one of ours. */
export async function createPortal(user: BillingUser, returnPath: "/settings/payments" | "/settings/cards") {
  const ent = await assertOwner(user);
  if (!stripeConfigured()) throw new AppError("CONFLICT", NOT_SET_UP);
  await enforce(`billing:${ent.accountId}`, LIMITS.billingPerAccount);
  const customer = await ensureCustomer(ent.accountId, user);
  const session = await stripe<StripePortalSession>("POST", "/billing_portal/sessions", { customer, return_url: `${env().APP_URL}${returnPath}` });
  return session.url;
}

/**
 * Called when the host lands back from Checkout, so the plan shows without waiting for the
 * webhook. The session id from the URL is only a lookup key: the session is fetched from Stripe,
 * must belong to this account's Stripe customer, and the plan comes from Stripe's subscription.
 */
export async function confirmCheckout(user: { id: string; accountId: string }, sessionId: string) {
  if (!stripeConfigured() || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) return;
  const ent = await getEntitlements(user);
  if (!ent.canManageBilling) return;
  const [account] = await db.select({ customerId: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, ent.accountId));
  if (!account?.customerId) return;
  const session = await ifExists(() => stripe<StripeCheckoutSession>("GET", `/checkout/sessions/${sessionId}`));
  if (!session || idOf(session.customer) !== account.customerId) return;
  const subscriptionId = idOf(session.subscription);
  if (!subscriptionId) return;
  const remote = await ifExists(() => stripe<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`));
  if (remote) await syncSubscription(remote);
}

export type SavedCard = { id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean };

/** Cards Stripe holds for the account (brand and last four digits only). Host only. */
export async function listCards(user: { id: string; accountId: string }): Promise<SavedCard[]> {
  const ent = await assertOwner(user);
  if (!stripeConfigured()) return [];
  const [account] = await db.select({ customerId: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, ent.accountId));
  const customerId = account?.customerId;
  if (!customerId) return [];
  const [methods, customer] = await Promise.all([
    ifExists(() => stripe<StripeList<StripePaymentMethod>>("GET", `/customers/${customerId}/payment_methods`, { type: "card", limit: 10 })),
    ifExists(() => stripe<StripeCustomer>("GET", `/customers/${customerId}`)),
  ]);
  const defaultId = customer && !customer.deleted ? idOf(customer.invoice_settings?.default_payment_method) : null;
  return (methods?.data ?? [])
    .filter((m) => m.card)
    .map((m) => ({ id: m.id, brand: m.card!.brand, last4: m.card!.last4, expMonth: m.card!.exp_month, expYear: m.card!.exp_year, isDefault: m.id === defaultId }));
}

// ---------------------------------------------------------------- webhook

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export type WebhookResult = "duplicate" | "synced" | "ignored";

/**
 * Applies one VERIFIED webhook event (the route checks the signature first). Safe to receive the
 * same event many times and in any order: each event id is processed once, and the subscription is
 * always re-read from Stripe, so a late event can't roll an account back to an old state.
 * Throws if processing fails, so the route answers 500 and Stripe retries.
 */
export async function handleStripeEvent(event: StripeEvent): Promise<WebhookResult> {
  const inserted = await db.insert(stripeEvents).values({ id: event.id, type: event.type, payload: event }).onConflictDoNothing().returning({ id: stripeEvents.id });
  if (inserted.length === 0) {
    const [seen] = await db.select({ processedAt: stripeEvents.processedAt }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
    if (seen?.processedAt) return "duplicate";
    // Seen before but never finished (an earlier attempt failed): process it again.
  }

  try {
    const result = await applyEvent(event);
    await db.update(stripeEvents).set({ processedAt: new Date(), error: null }).where(eq(stripeEvents.id, event.id));
    log.info("webhook.processed", { eventId: event.id, type: event.type, result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(stripeEvents).set({ error: message.slice(0, 500) }).where(eq(stripeEvents.id, event.id)).catch(() => {});
    throw err;
  }
}

async function applyEvent(event: StripeEvent): Promise<WebhookResult> {
  const object = event.data.object;
  let subscriptionId: string | null = null;
  let invoice: InvoiceObject | null = null;

  if (event.type === "checkout.session.completed") {
    const session = object as Partial<StripeCheckoutSession>;
    if (session.mode === "subscription") subscriptionId = idOf(session.subscription);
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    subscriptionId = typeof object.id === "string" ? object.id : null;
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    invoice = object as InvoiceObject;
    // Newer API versions nest the subscription under `parent`; older ones had it at the top.
    subscriptionId = idOf(invoice.parent?.subscription_details?.subscription) ?? idOf(invoice.subscription);
  } else {
    return "ignored";
  }

  let synced = false;
  if (subscriptionId && /^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) {
    const remote = await ifExists(() => stripe<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`));
    if (remote) synced = (await syncSubscription(remote)) === "synced";
  }
  if (invoice) synced = (await recordInvoice(invoice, event.type === "invoice.paid" ? "succeeded" : "failed", subscriptionId)) || synced;
  return synced ? "synced" : "ignored";
}

/**
 * Copies a Stripe subscription (fetched from Stripe, never from the browser) into our database.
 * The account's plan follows from this row. Exported for tests.
 */
export async function syncSubscription(remote: StripeSubscription): Promise<"synced" | "skipped"> {
  const customerId = idOf(remote.customer);
  const [account] = customerId
    ? await db.select({ id: accounts.id, ownerUserId: accounts.ownerUserId }).from(accounts).where(eq(accounts.stripeCustomerId, customerId))
    : [];
  if (!account) {
    log.warn("subscription.unknown_customer", { stripeSubscriptionId: remote.id });
    return "skipped";
  }

  const item = remote.items.data[0];
  const [price] = item ? await db.select().from(planPrices).where(eq(planPrices.stripePriceId, item.price.id)) : [];
  // Normally the price is one of ours. Fall back to the labels we put on the Stripe price.
  const planId = price?.planId ?? item?.price.metadata?.plan;
  const interval = price?.interval ?? item?.price.recurring?.interval;
  if (!item || !isPaidPlan(planId) || !isInterval(interval)) {
    log.warn("subscription.not_a_plan_price", { stripeSubscriptionId: remote.id });
    return "skipped";
  }

  const status = mapStripeStatus(remote.status);
  const start = toDate(item.current_period_start ?? remote.current_period_start);
  const end = toDate(item.current_period_end ?? remote.current_period_end);
  const periodOk = !start || !end || end > start;
  const values = {
    accountId: account.id,
    planId,
    priceId: price?.id ?? null,
    source: "stripe" as const,
    status,
    interval,
    stripeSubscriptionId: remote.id,
    currentPeriodStart: periodOk ? start : null,
    currentPeriodEnd: periodOk ? end : null,
    cancelAtPeriodEnd: remote.cancel_at_period_end || Boolean(remote.cancel_at),
    canceledAt: toDate(remote.canceled_at) ?? (status === "canceled" ? new Date() : null),
    updatedAt: new Date(),
  };

  const change = await db.transaction(async (tx) => {
    // Serialize everything that touches this account's subscriptions.
    await tx.execute(sql`select 1 from ${accounts} where ${accounts.id} = ${account.id} for update`);
    const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, remote.id));

    if (isCurrentStatus(status)) {
      // Only one subscription may be current per account. A paid Stripe subscription replaces
      // whatever held the slot (an Admin grant, or an older subscription we missed the end of).
      const replaced = await tx
        .update(subscriptions)
        .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(subscriptions.accountId, account.id), inArray(subscriptions.status, CURRENT_STATUSES), existing ? ne(subscriptions.id, existing.id) : undefined))
        .returning({ id: subscriptions.id, source: subscriptions.source });
      if (replaced.length > 0) log.warn("subscription.replaced", { accountId: account.id, replaced });
    }

    if (existing) await tx.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    else await tx.insert(subscriptions).values(values);

    const changed = !existing || existing.status !== status || existing.planId !== planId || existing.interval !== interval;
    if (changed) {
      await recordAudit(
        {
          accountId: account.id,
          actorUserId: null,
          actorType: "stripe",
          action: "subscription.synced",
          targetType: "subscription",
          targetId: remote.id,
          metadata: { status, planId, interval, previousStatus: existing?.status ?? null, previousPlanId: existing?.planId ?? null },
        },
        tx,
      );
    }
    return { changed, previousStatus: existing?.status ?? null };
  });

  if (change.changed) {
    log.info("subscription.synced", { accountId: account.id, status, planId, interval });
    if (status === "past_due" && change.previousStatus !== "past_due") {
      await notify([account.ownerUserId], {
        type: "billing.payment_failed",
        title: "Your payment failed",
        body: "Update your card to keep your plan. We'll try the payment again automatically.",
        link: "/settings/payments",
      }).catch((err) => log.error("billing.notify_failed", { err }));
    }
  }
  return "synced";
}

type InvoiceObject = {
  id?: string;
  number?: string | null;
  customer?: string | { id: string } | null;
  currency?: string;
  amount_paid?: number;
  amount_due?: number;
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
};

/** Adds (or updates) the invoice in the payment ledger. Returns whether a row was written. */
async function recordInvoice(invoice: InvoiceObject, status: "succeeded" | "failed", stripeSubscriptionId: string | null) {
  const customerId = idOf(invoice.customer);
  const amount = status === "succeeded" ? invoice.amount_paid : invoice.amount_due;
  const currency = invoice.currency?.toLowerCase();
  if (!invoice.id || !/^in_[A-Za-z0-9_]+$/.test(invoice.id) || !Number.isSafeInteger(amount) || amount! < 0 || !currency || !/^[a-z]{3}$/.test(currency)) {
    log.warn("payment.invalid_invoice", { hasId: Boolean(invoice.id) });
    return false;
  }
  const [account] = customerId ? await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.stripeCustomerId, customerId)) : [];
  if (!account) {
    log.warn("payment.unknown_customer", { stripeInvoiceId: invoice.id });
    return false;
  }
  const [subscription] = stripeSubscriptionId
    ? await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    : [];
  const values = {
    accountId: account.id,
    kind: "subscription" as const,
    status,
    amountCents: amount!,
    currency,
    stripeInvoiceId: invoice.id,
    subscriptionId: subscription?.id ?? null,
    description: invoice.number ? `Invoice ${invoice.number}`.slice(0, 120) : null,
  };
  await db
    .insert(payments)
    .values(values)
    .onConflictDoUpdate({
      target: payments.stripeInvoiceId,
      set: { status, amountCents: values.amountCents, subscriptionId: values.subscriptionId, description: values.description, updatedAt: new Date() },
      // A late "payment failed" event must not undo an invoice that has since been paid.
      setWhere: status === "failed" ? ne(payments.status, "succeeded") : undefined,
    });
  log.info("payment.recorded", { accountId: account.id, status });
  return true;
}

const toDate = (seconds: number | null | undefined) => (typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000) : null);

// ---------------------------------------------------------------- Admin overview

export async function subscriptionCounts(admin: AdminUser) {
  assertAdmin(admin);
  const rows = await db
    .select({ status: subscriptions.status, n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .groupBy(subscriptions.status);
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<string, number>>;
  return {
    active: (counts.active ?? 0) + (counts.trialing ?? 0),
    pastDue: counts.past_due ?? 0,
    canceled: counts.canceled ?? 0,
    other: (counts.incomplete ?? 0) + (counts.unpaid ?? 0),
  };
}
