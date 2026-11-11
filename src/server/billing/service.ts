import "server-only";
import type Stripe from "stripe";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { planPrices, stripeEvents, subscriptions, users, type PlanPrice, type User } from "@/db/schema";
import {
  entitledPlan,
  isEntitledStatus,
  isInterval,
  isPaidPlan,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { getStripe, requireStripe } from "./stripe";

const appUrl = () => process.env.APP_URL || "http://localhost:3000";

export class BillingError extends Error {}

// ---------------------------------------------------------------------------------------------
// Prices (Admin)
// ---------------------------------------------------------------------------------------------

export async function listPlanPrices(): Promise<PlanPrice[]> {
  return db.select().from(planPrices);
}

export async function getPlanPrice(plan: PaidPlanId, interval: BillingInterval) {
  const [row] = await db
    .select()
    .from(planPrices)
    .where(and(eq(planPrices.plan, plan), eq(planPrices.interval, interval)));
  return row ?? null;
}

/**
 * Saves a price. With Stripe configured it also creates the Stripe price (prices are immutable in
 * Stripe, so a change creates a new one and archives the old one; current subscribers keep theirs).
 */
export async function setPlanPrice(plan: PaidPlanId, interval: BillingInterval, amountCents: number) {
  const existing = await getPlanPrice(plan, interval);
  if (existing?.amountCents === amountCents && existing.stripePriceId) return existing;

  const stripe = getStripe();
  let stripeProductId = existing?.stripeProductId ?? null;
  let stripePriceId: string | null = null;

  if (stripe) {
    stripeProductId = await ensureProduct(stripe, plan, stripeProductId);
    const price = await stripe.prices.create({
      product: stripeProductId,
      currency: "usd",
      unit_amount: amountCents,
      recurring: { interval },
      lookup_key: `garwin_${plan}_${interval}`,
      transfer_lookup_key: true,
      metadata: { plan, interval },
    });
    stripePriceId = price.id;
    if (existing?.stripePriceId) {
      // Archive the old price so it can't be bought any more. It may not exist (e.g. it was made
      // with test keys and these are live keys); that's fine.
      await ifExists(() => stripe.prices.update(existing.stripePriceId!, { active: false }));
    }
  }

  const values = { plan, interval, amountCents, currency: "usd", stripeProductId, stripePriceId, updatedAt: new Date() };
  const [row] = await db
    .insert(planPrices)
    .values(values)
    .onConflictDoUpdate({ target: [planPrices.plan, planPrices.interval], set: values })
    .returning();
  return row;
}

/**
 * Makes sure every saved price exists in the connected Stripe account, creating any that are
 * missing: saved before Stripe was connected, or made in another account (test vs live keys).
 * Returns how many were created.
 */
export async function syncPricesToStripe() {
  const stripe = requireStripe();
  let created = 0;
  for (const p of await listPlanPrices()) {
    if (!isPaidPlan(p.plan)) continue;
    const id = p.stripePriceId;
    const live = id ? await ifExists(() => stripe.prices.retrieve(id)) : null;
    if (live?.active && live.unit_amount === p.amountCents) continue;
    await db
      .update(planPrices)
      .set({ stripePriceId: null })
      .where(and(eq(planPrices.plan, p.plan), eq(planPrices.interval, p.interval)));
    await setPlanPrice(p.plan, p.interval, p.amountCents);
    created++;
  }
  return created;
}

/** Runs a Stripe call, returning null instead of throwing when the object doesn't exist. */
async function ifExists<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return null;
    throw err;
  }
}

async function ensureProduct(stripe: Stripe, plan: PaidPlanId, known: string | null) {
  const [sibling] = await db
    .select({ id: planPrices.stripeProductId })
    .from(planPrices)
    .where(and(eq(planPrices.plan, plan), isNotNull(planPrices.stripeProductId)));
  for (const id of new Set([known, sibling?.id].filter((x): x is string => Boolean(x)))) {
    const product = await ifExists(() => stripe.products.retrieve(id));
    if (product && !product.deleted) return product.id;
  }
  const product = await stripe.products.create({ name: `Garwin AI ${PLANS[plan].name}`, metadata: { plan } });
  return product.id;
}

// ---------------------------------------------------------------------------------------------
// Customers, checkout and the billing portal
// ---------------------------------------------------------------------------------------------

type BillingUser = Pick<User, "id" | "email" | "name" | "hostId" | "stripeCustomerId">;

export async function getSubscription(userId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return row ?? null;
}

async function ensureCustomer(stripe: Stripe, user: BillingUser) {
  if (user.stripeCustomerId) {
    const existing = await ifExists(() => stripe.customers.retrieve(user.stripeCustomerId!));
    if (existing && !existing.deleted) return existing.id;
    // Made in another Stripe account (test vs live keys) or deleted: start over.
    await db.update(users).set({ stripeCustomerId: null }).where(eq(users.id, user.id));
  }
  const customer = await stripe.customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.id } },
    // Per-minute key: a double click reuses one customer; a later retry after a reset gets a new one.
    { idempotencyKey: `customer-${user.id}-${Math.floor(Date.now() / 60_000)}` },
  );
  // Only set it if nobody else did in the meantime, then read back whichever won.
  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(users.id, user.id), sql`${users.stripeCustomerId} is null`));
  const [row] = await db.select({ id: users.stripeCustomerId }).from(users).where(eq(users.id, user.id));
  return row.id!;
}

function assertCanBuy(user: BillingUser) {
  if (user.hostId) throw new BillingError("Your plan is managed by your team's host.");
}

/** Starts Stripe Checkout for a new subscription and returns the URL to send the user to. */
export async function createCheckout(user: BillingUser, plan: PaidPlanId, interval: BillingInterval) {
  assertCanBuy(user);
  const stripe = getStripe();
  if (!stripe) throw new BillingError("Payments aren't set up yet. Please try again later.");

  const current = await getSubscription(user.id);
  if (current && isEntitledStatus(current.status)) {
    throw new BillingError("You already have a subscription. Use Switch to change plans.");
  }
  const price = await getPlanPrice(plan, interval);
  if (!price?.stripePriceId) throw new BillingError("That plan isn't available to buy yet.");

  const customer = await ensureCustomer(stripe, user);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: price.stripePriceId, quantity: 1 }],
    subscription_data: { metadata: { userId: user.id } },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/settings/payments?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/settings/payments?checkout=canceled`,
  });
  if (!session.url) throw new BillingError("Stripe didn't return a checkout page. Please try again.");
  return session.url;
}

/** Moves an existing subscription to another plan or interval, prorating the difference. */
export async function changePlan(user: BillingUser, plan: PaidPlanId, interval: BillingInterval) {
  assertCanBuy(user);
  const stripe = requireStripe();
  const current = await getSubscription(user.id);
  if (!current || !isEntitledStatus(current.status)) throw new BillingError("You don't have an active subscription.");
  if (current.plan === plan && current.interval === interval) return;

  const price = await getPlanPrice(plan, interval);
  if (!price?.stripePriceId) throw new BillingError("That plan isn't available to buy yet.");

  const sub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price: price.stripePriceId }],
    proration_behavior: "always_invoice",
    payment_behavior: "pending_if_incomplete",
    cancel_at_period_end: false,
  });
  await syncSubscription(updated);
}

/** Stripe's hosted page for cards, invoices and cancelling. */
export async function createPortal(user: BillingUser, returnPath: string) {
  assertCanBuy(user);
  const stripe = getStripe();
  if (!stripe) throw new BillingError("Payments aren't set up yet. Please try again later.");
  const customer = await ensureCustomer(stripe, user);
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${appUrl()}${returnPath}` });
  return session.url;
}

/** Called on the checkout success page so the plan updates without waiting for the webhook. */
export async function confirmCheckout(userId: string, sessionId: string) {
  const stripe = getStripe();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.client_reference_id !== userId) return;
  if (session.subscription && typeof session.subscription !== "string") await syncSubscription(session.subscription);
}

export async function listInvoices(user: BillingUser) {
  const stripe = getStripe();
  if (!stripe || !user.stripeCustomerId) return [];
  const { data } = await stripe.invoices.list({ customer: user.stripeCustomerId, limit: 12 });
  return data.map((i) => ({
    id: i.id,
    number: i.number,
    created: new Date(i.created * 1000),
    amountCents: i.amount_paid || i.amount_due,
    currency: i.currency,
    status: i.status,
    url: i.hosted_invoice_url ?? null,
  }));
}

export async function listCards(user: BillingUser) {
  const stripe = getStripe();
  if (!stripe || !user.stripeCustomerId) return [];
  const [methods, customer] = await Promise.all([
    stripe.customers.listPaymentMethods(user.stripeCustomerId, { type: "card", limit: 10 }),
    stripe.customers.retrieve(user.stripeCustomerId),
  ]);
  const defaultId =
    !customer.deleted && customer.invoice_settings?.default_payment_method
      ? String(
          typeof customer.invoice_settings.default_payment_method === "string"
            ? customer.invoice_settings.default_payment_method
            : customer.invoice_settings.default_payment_method.id,
        )
      : null;
  return methods.data
    .filter((m) => m.card)
    .map((m) => ({
      id: m.id,
      brand: m.card!.brand,
      last4: m.card!.last4,
      expMonth: m.card!.exp_month,
      expYear: m.card!.exp_year,
      isDefault: m.id === defaultId,
    }));
}

// ---------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/**
 * Applies one verified webhook event. Always re-reads the subscription from Stripe, so events
 * that arrive late or out of order can't roll a user back to an old state.
 */
export async function handleStripeEvent(event: Stripe.Event) {
  const [seen] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
  if (seen) return "duplicate";

  const stripe = requireStripe();
  let subscriptionId: string | null = null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode === "subscription" && session.subscription) {
      subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    }
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const parent = event.data.object.parent?.subscription_details?.subscription;
    if (parent) subscriptionId = typeof parent === "string" ? parent : parent.id;
  }

  if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));

  // Recorded after processing: if processing fails, Stripe retries and we try again.
  await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return subscriptionId ? "synced" : "ignored";
}

/** Copies a Stripe subscription into our database and sets the user's plan to match. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const price = item?.price;
  const plan = price?.metadata?.plan;
  const interval = price?.recurring?.interval;
  if (!item || !isPaidPlan(plan) || !isInterval(interval)) {
    console.warn(`[billing] Ignoring subscription ${sub.id}: its price isn't a Garwin plan price.`);
    return;
  }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sub.metadata?.userId ? eq(users.id, sub.metadata.userId) : eq(users.stripeCustomerId, customerId));
  if (!user) {
    console.warn(`[billing] No user for subscription ${sub.id}.`);
    return;
  }

  // A late event about an old, ended subscription must not replace a newer active one.
  const existing = await getSubscription(user.id);
  if (
    existing &&
    existing.stripeSubscriptionId !== sub.id &&
    isEntitledStatus(existing.status) &&
    !isEntitledStatus(sub.status)
  ) {
    return;
  }

  const values = {
    userId: user.id,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
    stripePriceId: price.id,
    plan,
    interval,
    status: sub.status,
    currentPeriodEnd: item.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end || Boolean(sub.cancel_at),
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.userId, set: values });
    await tx
      .update(users)
      .set({ plan: entitledPlan(sub.status, plan), stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  });
}

// ---------------------------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------------------------

export async function subscriptionCounts() {
  const rows = await db
    .select({ status: subscriptions.status, n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .groupBy(subscriptions.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}
