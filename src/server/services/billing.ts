// Billing: Admin-set prices, Stripe Checkout, plan switches, the billing portal and the Stripe
// webhook. Stripe is the payment source of truth: plans change only from data read from Stripe
// (webhooks, then re-reading the subscription), never from a browser redirect.
import "server-only";
import type Stripe from "stripe";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, payments, planPrices, stripeEvents, subscriptions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { PLAN_SPEC } from "@/lib/plans";
import {
  CURRENT_STATUSES,
  isCurrentStatus,
  isInterval,
  isPaidPlanId,
  toSubscriptionStatus,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/billing";
import { getStripe, isMissing, stripeConfigured } from "@/server/stripe/client";
import { assertOwner, getEntitlements } from "./entitlements";
import { recordAudit } from "./audit";
import { enforce, LIMITS } from "./rate-limit";
import type { RequestMeta } from "./security-events";

const log = logger.child({ module: "billing" });

type UserRef = { id: string; accountId?: string | null };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const NOT_READY = "Payments aren't switched on yet. Please try again later.";

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new AppError("CONFLICT", NOT_READY);
  return stripe;
}

/** Returns null instead of throwing when the Stripe object doesn't exist (e.g. other account). */
async function ifExists<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------- prices (Admin)

export async function listAdminPrices() {
  return db
    .select({
      id: planPrices.id,
      planId: planPrices.planId,
      interval: planPrices.interval,
      amountCents: planPrices.amountCents,
      currency: planPrices.currency,
      stripePriceId: planPrices.stripePriceId,
    })
    .from(planPrices)
    .where(eq(planPrices.active, true));
}

async function activePrice(planId: PaidPlanId, interval: BillingInterval, exec: Tx | typeof db = db) {
  const [row] = await exec
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.planId, planId), eq(planPrices.interval, interval), eq(planPrices.currency, "usd"), eq(planPrices.active, true)));
  return row ?? null;
}

/** One Stripe product per plan, with a fixed id so it can be found again without a DB column. */
async function ensureProduct(stripe: Stripe, planId: PaidPlanId) {
  const id = `garwin_plan_${planId}`;
  const existing = await ifExists(() => stripe.products.retrieve(id));
  if (existing && !existing.deleted) {
    if (!existing.active) await stripe.products.update(id, { active: true });
    return id;
  }
  await stripe.products.create({ id, name: `Garwin AI ${PLAN_SPEC[planId].name}`, metadata: { plan: planId } });
  return id;
}

async function createStripePrice(stripe: Stripe, planId: PaidPlanId, interval: BillingInterval, amountCents: number) {
  const product = await ensureProduct(stripe, planId);
  const price = await stripe.prices.create({
    product,
    currency: "usd",
    unit_amount: amountCents,
    recurring: { interval },
    lookup_key: `garwin_${planId}_${interval}`,
    transfer_lookup_key: true,
    metadata: { plan: planId, interval },
  });
  return price.id;
}

/**
 * Sets a plan's price. The old row is deactivated, never edited, so history stays accurate; with
 * Stripe connected a new Stripe price is created and the old one archived. Existing subscribers
 * keep the price they signed up with.
 */
export async function setPlanPrice(admin: UserRef, planId: PaidPlanId, interval: BillingInterval, amountCents: number, meta?: RequestMeta) {
  const current = await activePrice(planId, interval);
  if (current && current.amountCents === amountCents && (current.stripePriceId || !stripeConfigured())) return false;

  const stripe = getStripe();
  const stripePriceId = stripe ? await createStripePrice(stripe, planId, interval, amountCents) : null;

  await db.transaction(async (tx) => {
    if (current) await tx.update(planPrices).set({ active: false }).where(eq(planPrices.id, current.id));
    await tx.insert(planPrices).values({ planId, interval, amountCents, currency: "usd", stripePriceId, active: true, createdBy: admin.id });
    await recordAudit(
      {
        accountId: null,
        actorUserId: admin.id,
        actorType: "admin",
        action: "plan_price.set",
        targetType: "plan",
        targetId: planId,
        metadata: { interval, amountCents, previousCents: current?.amountCents ?? null },
        meta,
      },
      tx,
    );
  });

  if (stripe && current?.stripePriceId) {
    await ifExists(() => stripe.prices.update(current.stripePriceId!, { active: false }));
  }
  log.info("plan_price.set", { planId, interval, amountCents });
  return true;
}

/**
 * Makes sure every active price exists in the connected Stripe account. Fixes prices saved before
 * Stripe was connected, or made with other keys (test vs live). Returns how many were created.
 */
export async function syncPricesToStripe(admin: UserRef, meta?: RequestMeta) {
  const stripe = requireStripe();
  let created = 0;
  for (const p of await listAdminPrices()) {
    if (!isPaidPlanId(p.planId) || !isInterval(p.interval)) continue;
    const live = p.stripePriceId ? await ifExists(() => stripe.prices.retrieve(p.stripePriceId!)) : null;
    if (live?.active && live.unit_amount === p.amountCents && live.recurring?.interval === p.interval) continue;
    const stripePriceId = await createStripePrice(stripe, p.planId, p.interval, p.amountCents);
    await db.update(planPrices).set({ stripePriceId }).where(eq(planPrices.id, p.id));
    created++;
  }
  if (created) {
    await recordAudit({ accountId: null, actorUserId: admin.id, actorType: "admin", action: "plan_price.synced", metadata: { created }, meta });
  }
  return created;
}

// ---------------------------------------------------------------- the account's billing

/** The account's subscription that currently holds the plan, if any. */
async function currentSubscription(accountId: string, exec: Tx | typeof db = db) {
  const [row] = await exec
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.accountId, accountId), inArray(subscriptions.status, CURRENT_STATUSES)))
    .limit(1);
  return row ?? null;
}

/** Everything Settings → Payments shows. Members without billing.view get nothing. */
export async function getBillingOverview(user: UserRef) {
  const ent = await getEntitlements(user);
  if (!ent.canManageBilling && !ent.can("billing.view")) return null;
  const [current, latest, history] = await Promise.all([
    currentSubscription(ent.accountId),
    db.select().from(subscriptions).where(eq(subscriptions.accountId, ent.accountId)).orderBy(desc(subscriptions.updatedAt)).limit(1),
    db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
        currency: payments.currency,
        status: payments.status,
        description: payments.description,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(and(eq(payments.accountId, ent.accountId), eq(payments.kind, "subscription")))
      .orderBy(desc(payments.createdAt))
      .limit(24),
  ]);
  return { ent, subscription: current ?? latest[0] ?? null, hasCurrent: Boolean(current), history, stripeReady: stripeConfigured() };
}

async function ensureCustomer(stripe: Stripe, accountId: string, user: UserRef & { email?: string; name?: string }) {
  const [account] = await db.select({ id: accounts.id, name: accounts.name, customer: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new AppError("NOT_FOUND", "Workspace not found.");
  if (account.customer) {
    const existing = await ifExists(() => stripe.customers.retrieve(account.customer!));
    if (existing && !existing.deleted) return existing.id;
    // Made with other keys (test vs live) or deleted in Stripe: start over.
    await db.update(accounts).set({ stripeCustomerId: null }).where(eq(accounts.id, accountId));
  }
  const customer = await stripe.customers.create(
    { name: account.name, email: user.email, metadata: { accountId } },
    // Per-minute key: a double click makes one customer, a retry after a reset makes a new one.
    { idempotencyKey: `customer-${accountId}-${Math.floor(Date.now() / 60_000)}` },
  );
  // Keep whichever customer was saved first if two requests raced.
  await db.update(accounts).set({ stripeCustomerId: customer.id }).where(and(eq(accounts.id, accountId), sql`${accounts.stripeCustomerId} is null`));
  const [row] = await db.select({ customer: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, accountId));
  return row.customer!;
}

type BillingUser = UserRef & { email: string; name: string };

/** Starts Stripe Checkout for a new subscription; returns the Stripe page to send the host to. */
export async function createCheckout(user: BillingUser, planId: PaidPlanId, interval: BillingInterval) {
  const ent = await assertOwner(user);
  await enforce(`checkout:${user.id}`, LIMITS.checkoutPerUser, "Too many checkout attempts. Try again later.");
  const stripe = requireStripe();

  const current = await currentSubscription(ent.accountId);
  if (current?.source === "admin") throw new AppError("CONFLICT", "Your plan was set by Garwin AI support. Contact support to change it.");
  if (current) throw new AppError("CONFLICT", "You already have a subscription. Use Switch to change plans.");

  const price = await activePrice(planId, interval);
  if (!price?.stripePriceId) throw new AppError("CONFLICT", "That plan isn't available to buy yet.");

  const customer = await ensureCustomer(stripe, ent.accountId, user);
  const appUrl = env().APP_URL;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ent.accountId,
    line_items: [{ price: price.stripePriceId, quantity: 1 }],
    metadata: { accountId: ent.accountId },
    subscription_data: { metadata: { accountId: ent.accountId } },
    allow_promotion_codes: true,
    success_url: `${appUrl}/settings/payments?checkout=success`,
    cancel_url: `${appUrl}/settings/payments?checkout=canceled`,
  });
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
  log.info("checkout.created", { accountId: ent.accountId, planId, interval });
  return session.url;
}

/** Moves the account's Stripe subscription to another plan or interval, prorated immediately. */
export async function changePlan(user: UserRef, planId: PaidPlanId, interval: BillingInterval, meta?: RequestMeta) {
  const ent = await assertOwner(user);
  const stripe = requireStripe();
  const current = await currentSubscription(ent.accountId);
  if (!current || current.source !== "stripe" || !current.stripeSubscriptionId || current.status === "incomplete") {
    throw new AppError("CONFLICT", "You don't have an active subscription to change.");
  }
  if (current.planId === planId && current.interval === interval) return;
  const price = await activePrice(planId, interval);
  if (!price?.stripePriceId) throw new AppError("CONFLICT", "That plan isn't available to buy yet.");

  const sub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price: price.stripePriceId }],
    proration_behavior: "always_invoice",
    // If the prorated charge fails, Stripe keeps the old plan instead of switching.
    payment_behavior: "pending_if_incomplete",
    cancel_at_period_end: false,
  });
  await syncSubscription(updated);
  await recordAudit({
    accountId: ent.accountId,
    actorUserId: user.id,
    action: "subscription.plan_changed",
    targetType: "subscription",
    targetId: current.id,
    metadata: { from: current.planId, to: planId, interval },
    meta,
  });
}

/** Stripe's hosted page for cards, invoices and cancelling. Host only. */
export async function createPortal(user: BillingUser, returnPath: "/settings/payments" | "/settings/cards") {
  const ent = await assertOwner(user);
  const stripe = requireStripe();
  const customer = await ensureCustomer(stripe, ent.accountId, user);
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${env().APP_URL}${returnPath}` });
  return session.url;
}

export async function listCards(user: UserRef) {
  const ent = await getEntitlements(user);
  if (!ent.canManageBilling) return [];
  const stripe = getStripe();
  const [account] = await db.select({ customer: accounts.stripeCustomerId }).from(accounts).where(eq(accounts.id, ent.accountId));
  if (!stripe || !account?.customer) return [];
  const [methods, customer] = await Promise.all([
    ifExists(() => stripe.customers.listPaymentMethods(account.customer!, { type: "card", limit: 10 })),
    ifExists(() => stripe.customers.retrieve(account.customer!)),
  ]);
  if (!methods || !customer || customer.deleted) return [];
  const def = customer.invoice_settings?.default_payment_method;
  const defaultId = typeof def === "string" ? def : (def?.id ?? null);
  return methods.data.flatMap((m) =>
    m.card ? [{ id: m.id, brand: m.card.brand, last4: m.card.last4, expMonth: m.card.exp_month, expYear: m.card.exp_year, isDefault: m.id === defaultId }] : [],
  );
}

// ---------------------------------------------------------------- webhook

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

const idOf = (v: string | { id: string } | null | undefined) => (v ? (typeof v === "string" ? v : v.id) : null);

/**
 * Applies one signature-verified webhook event, once. Subscriptions and invoices are re-read from
 * Stripe, so late or out-of-order deliveries can't roll an account back to an old state.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  const inserted = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (inserted.length === 0) {
    const [seen] = await db.select({ processedAt: stripeEvents.processedAt }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
    if (seen?.processedAt) return "duplicate";
    // An earlier attempt failed: Stripe is retrying, so try again.
  }

  try {
    const stripe = requireStripe();
    let subscriptionId: string | null = null;
    let invoiceId: string | null = null;

    if (event.type === "checkout.session.completed") {
      if (event.data.object.mode === "subscription") subscriptionId = idOf(event.data.object.subscription);
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      invoiceId = event.data.object.id ?? null;
      subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
    }

    if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    if (invoiceId) await recordInvoice(await stripe.invoices.retrieve(invoiceId));

    await db.update(stripeEvents).set({ processedAt: new Date(), error: null }).where(eq(stripeEvents.id, event.id));
    return subscriptionId || invoiceId ? "processed" : "ignored";
  } catch (err) {
    await db
      .update(stripeEvents)
      .set({ error: err instanceof Error ? err.message.slice(0, 500) : "failed" })
      .where(eq(stripeEvents.id, event.id));
    throw err;
  }
}

async function accountFor(customerId: string, metadataAccountId: string | undefined, exec: Tx | typeof db = db) {
  const [row] = await exec
    .select({ id: accounts.id })
    .from(accounts)
    .where(metadataAccountId ? eq(accounts.id, metadataAccountId) : eq(accounts.stripeCustomerId, customerId));
  return row?.id ?? null;
}

/** Copies a Stripe subscription (freshly read from Stripe) into `subscriptions`. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const stripePrice = item?.price;
  const customerId = idOf(sub.customer)!;
  const [known] = stripePrice
    ? await db.select({ id: planPrices.id, planId: planPrices.planId }).from(planPrices).where(eq(planPrices.stripePriceId, stripePrice.id))
    : [];
  const planId = known?.planId ?? stripePrice?.metadata?.plan;
  const interval = stripePrice?.recurring?.interval;
  if (!item || !isPaidPlanId(planId) || !isInterval(interval)) {
    log.warn("subscription.ignored", { subscriptionId: sub.id, reason: "not a Garwin plan price" });
    return;
  }

  const status = toSubscriptionStatus(sub.status);
  const accountId = await accountFor(customerId, sub.metadata?.accountId);
  if (!accountId) {
    log.warn("subscription.ignored", { subscriptionId: sub.id, reason: "no matching account" });
    return;
  }

  await db.transaction(async (tx) => {
    // Serialize changes per account (one current subscription allowed by a unique index).
    await tx.execute(sql`select 1 from ${accounts} where ${accounts.id} = ${accountId} for update`);

    if (isCurrentStatus(status)) {
      const others = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.accountId, accountId),
            inArray(subscriptions.status, CURRENT_STATUSES),
            sql`${subscriptions.stripeSubscriptionId} is distinct from ${sub.id}`,
          ),
        );
      for (const other of others) {
        if (other.source === "admin") {
          // Checkout is refused while an Admin grant is active, so this needs a person to look at it.
          throw new Error(`Account ${accountId} has an Admin-granted plan and a Stripe subscription ${sub.id}`);
        }
        // A newer subscription replaced an older one whose cancellation we haven't heard about yet:
        // ask Stripe for the older one's real state.
        const fresh = await getStripe()!.subscriptions.retrieve(other.stripeSubscriptionId!);
        const freshStatus = toSubscriptionStatus(fresh.status);
        if (isCurrentStatus(freshStatus)) throw new Error(`Account ${accountId} has two live Stripe subscriptions`);
        await tx.update(subscriptions).set({ status: freshStatus, updatedAt: new Date() }).where(eq(subscriptions.id, other.id));
      }
    }

    const values = {
      accountId,
      planId,
      priceId: known?.id ?? null,
      source: "stripe" as const,
      status,
      interval,
      stripeSubscriptionId: sub.id,
      currentPeriodStart: item.current_period_start ? new Date(item.current_period_start * 1000) : null,
      currentPeriodEnd: item.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end || Boolean(sub.cancel_at),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      updatedAt: new Date(),
    };
    const [before] = await tx.select({ status: subscriptions.status, planId: subscriptions.planId }).from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, sub.id));
    const [row] = await tx
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({ target: subscriptions.stripeSubscriptionId, set: values })
      .returning({ id: subscriptions.id });
    if (before?.status !== status || before?.planId !== planId) {
      await recordAudit(
        {
          accountId,
          actorUserId: null,
          actorType: "stripe",
          action: "subscription.synced",
          targetType: "subscription",
          targetId: row.id,
          metadata: { planId, status, previousStatus: before?.status ?? null, previousPlanId: before?.planId ?? null },
        },
        tx,
      );
    }
    await tx.update(accounts).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(and(eq(accounts.id, accountId), sql`${accounts.stripeCustomerId} is distinct from ${customerId}`));
  });
  log.info("subscription.synced", { subscriptionId: sub.id, accountId, planId, status });
}

/** Records a subscription invoice (freshly read from Stripe) in the payments ledger. */
async function recordInvoice(invoice: Stripe.Invoice) {
  const customerId = idOf(invoice.customer);
  const accountId = customerId ? await accountFor(customerId, undefined) : null;
  const subscriptionStripeId = idOf(invoice.parent?.subscription_details?.subscription);
  const [sub] = subscriptionStripeId
    ? await db.select({ id: subscriptions.id, planId: subscriptions.planId, interval: subscriptions.interval }).from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subscriptionStripeId))
    : [];
  const status = invoice.status === "paid" ? "succeeded" : invoice.status === "open" && invoice.attempted ? "failed" : "pending";
  const plan = sub && isPaidPlanId(sub.planId) ? PLAN_SPEC[sub.planId].name : "Garwin AI";
  const values = {
    accountId,
    kind: "subscription" as const,
    status: status as "succeeded" | "failed" | "pending",
    amountCents: invoice.status === "paid" ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency,
    stripeInvoiceId: invoice.id!,
    subscriptionId: sub?.id ?? null,
    description: `${plan} plan${sub?.interval ? (sub.interval === "month" ? " (monthly)" : " (yearly)") : ""}`,
    updatedAt: new Date(),
  };
  await db.insert(payments).values(values).onConflictDoUpdate({ target: payments.stripeInvoiceId, set: values });
}

// ---------------------------------------------------------------- Admin overview

export async function subscriptionCounts() {
  const rows = await db
    .select({ status: subscriptions.status, n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(and(eq(subscriptions.source, "stripe"), ne(subscriptions.status, "incomplete")))
    .groupBy(subscriptions.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<string, number>>;
}
