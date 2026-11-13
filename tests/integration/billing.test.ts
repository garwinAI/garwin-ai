import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createFakeStripe, signPayload } from "../support/fake-stripe.mjs";
import { uniqueEmail } from "./helpers";

// Runs the real billing service and webhook route against the database in DATABASE_URL and an
// in-process fake Stripe (tests/support/fake-stripe.mjs), which signs its webhooks like Stripe.
// Creates its own users. Plan prices are global, so the ones it adds are removed again afterwards
// and the prices that were active before are restored.
const WEBHOOK_SECRET = "whsec_integration_not_a_real_secret";

type Mods = {
  db: typeof import("@/db").db;
  schema: typeof import("@/db/schema");
  billing: typeof import("@/server/services/billing");
  entitlements: typeof import("@/server/services/entitlements");
  users: typeof import("@/server/services/users");
  route: typeof import("@/app/api/stripe/webhook/route");
};
let m: Mods;
let fake: ReturnType<typeof createFakeStripe>;
let stripeServer: Server;
let appServer: Server;
let admin: { id: string; role: string };
let previouslyActive: string[] = [];

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));

const deliver = (payload: string, signature: string) =>
  m.route.POST(new Request("http://app/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));

beforeAll(async () => {
  // Stand-in for the Next server: forwards the fake Stripe's webhook deliveries to the real route.
  appServer = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = await deliver(body, String(req.headers["stripe-signature"] ?? ""));
    res.writeHead(response.status).end(await response.text());
  });
  const appPort = await listen(appServer);

  stripeServer = createServer((req, res) => {
    void fake.handle(req, res).then((handled) => handled || res.writeHead(404).end());
  });
  const stripePort = await listen(stripeServer);
  fake = createFakeStripe({ webhookUrl: `http://localhost:${appPort}/api/stripe/webhook`, webhookSecret: WEBHOOK_SECRET, publicBase: `http://localhost:${stripePort}` });

  process.env.STRIPE_SECRET_KEY = "sk_test_integration_not_a_real_key";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_API_URL = `http://localhost:${stripePort}`;
  process.env.APP_URL = "http://localhost:3000";
  (await import("@/lib/env")).resetEnvCache();

  m = {
    db: (await import("@/db")).db,
    schema: await import("@/db/schema"),
    billing: await import("@/server/services/billing"),
    entitlements: await import("@/server/services/entitlements"),
    users: await import("@/server/services/users"),
    route: await import("@/app/api/stripe/webhook/route"),
  };

  const adminUser = await m.users.createUser({ name: "Billing Admin", email: uniqueEmail("billing-admin"), passwordHash: "x" });
  admin = { id: adminUser.id, role: "admin" };

  previouslyActive = (await m.billing.listActivePrices()).map((p) => p.id);
  // Fresh amounts so the prices are created in this run's (empty) fake Stripe.
  const bump = Date.now() % 900;
  await m.billing.setPlanPrice(admin, "starter", "month", 1000 + bump);
  await m.billing.setPlanPrice(admin, "starter", "year", 10000 + bump);
  await m.billing.setPlanPrice(admin, "plus", "month", 2000 + bump);
  await m.billing.syncPricesToStripe(admin);
});

afterAll(async () => {
  if (m) {
    const { planPrices, subscriptions } = m.schema;
    const mine = await m.db.select({ id: planPrices.id }).from(planPrices).where(eq(planPrices.createdBy, admin.id));
    const ids = mine.map((p) => p.id);
    if (ids.length) {
      await m.db.delete(subscriptions).where(inArray(subscriptions.priceId, ids));
      await m.db.delete(planPrices).where(inArray(planPrices.id, ids));
    }
    if (previouslyActive.length) await m.db.update(planPrices).set({ active: true }).where(inArray(planPrices.id, previouslyActive));
  }
  stripeServer?.close();
  appServer?.close();
});

// ---------------------------------------------------------------- fixtures

async function host() {
  const user = await m.users.createUser({ name: "Billing Host", email: uniqueEmail("billing"), passwordHash: "x" });
  const [member] = await m.db.select().from(m.schema.accountMembers).where(eq(m.schema.accountMembers.userId, user.id));
  return { id: user.id, accountId: member.accountId, email: user.email, name: user.name };
}
type Host = Awaited<ReturnType<typeof host>>;

/** Runs checkout through the fake hosted page, which fires the signed webhooks before redirecting. */
async function subscribe(user: Host, plan: "starter" | "plus", interval: "month" | "year" = "month") {
  const url = await m.billing.createCheckout(user, plan, interval);
  const res = await fetch(`${url}/pay`, { method: "POST", redirect: "manual" });
  expect(res.status).toBe(303);
  return (await m.billing.getSubscription(user.accountId))!;
}

const planOf = (user: Host) => m.entitlements.planForAccount(user.accountId);

const ledger = (user: Host) =>
  m.db.select().from(m.schema.payments).where(eq(m.schema.payments.accountId, user.accountId)).orderBy(desc(m.schema.payments.createdAt));

function signedEvent(type: string, object: unknown, id = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  return { id, payload, signature: signPayload(payload, WEBHOOK_SECRET) };
}

// ---------------------------------------------------------------- tests

describe("plan prices", () => {
  it("only an Admin can set prices", async () => {
    const user = await host();
    await expect(m.billing.setPlanPrice({ id: user.id, role: "user" }, "pro", "month", 5000)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(m.billing.syncPricesToStripe({ id: user.id, role: "user" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates the Stripe price under a per-plan product, and keeps history when a price changes", async () => {
    const first = await m.billing.setPlanPrice(admin, "pro", "month", 4000 + (Date.now() % 900));
    expect(first.stripePriceId).toBeTruthy();
    expect(fake.db.prices[first.stripePriceId!]).toMatchObject({ product: "garwin_pro", unit_amount: first.amountCents, active: true });
    expect(fake.db.products.garwin_pro).toBeDefined();

    // Saving the same amount again changes nothing.
    expect((await m.billing.setPlanPrice(admin, "pro", "month", first.amountCents)).id).toBe(first.id);

    const second = await m.billing.setPlanPrice(admin, "pro", "month", first.amountCents + 100);
    expect(second.id).not.toBe(first.id);
    const [old] = await m.db.select().from(m.schema.planPrices).where(eq(m.schema.planPrices.id, first.id));
    expect(old).toMatchObject({ active: false, amountCents: first.amountCents }); // deactivated, never edited
    expect(fake.db.prices[first.stripePriceId!].active).toBe(false); // can't be bought any more
    const active = (await m.billing.listActivePrices()).filter((p) => p.planId === "pro" && p.interval === "month");
    expect(active.map((p) => p.id)).toEqual([second.id]);

    const [audit] = await m.db.select().from(m.schema.auditLogs).where(and(eq(m.schema.auditLogs.action, "price.changed"), eq(m.schema.auditLogs.targetId, second.id)));
    expect(audit).toMatchObject({ actorUserId: admin.id, actorType: "admin" });
  });

  it("recreates prices that don't exist in the connected Stripe account", async () => {
    const before = (await m.billing.listActivePrices()).find((p) => p.planId === "starter" && p.interval === "year")!;
    await m.db.update(m.schema.planPrices).set({ stripePriceId: `price_other_account_${Date.now()}` }).where(eq(m.schema.planPrices.id, before.id));
    expect(await m.billing.syncPricesToStripe(admin)).toBe(1);
    const after = (await m.billing.listActivePrices()).find((p) => p.id === before.id)!;
    expect(fake.db.prices[after.stripePriceId!]).toMatchObject({ unit_amount: before.amountCents, active: true });
    expect(await m.billing.syncPricesToStripe(admin)).toBe(0);
  });
});

describe("checkout and the webhook", () => {
  it("gives the account its plan only once Stripe's signed webhook arrives", async () => {
    const user = await host();
    const url = await m.billing.createCheckout(user, "starter", "month");
    // Checkout has started but nothing is paid: still Free, and no subscription row yet.
    expect(await planOf(user)).toBe("free");
    expect(await m.billing.getSubscription(user.accountId)).toBeNull();

    await fetch(`${url}/pay`, { method: "POST", redirect: "manual" });
    const sub = (await m.billing.getSubscription(user.accountId))!;
    expect(sub).toMatchObject({ planId: "starter", interval: "month", status: "active", source: "stripe" });
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
    expect(await planOf(user)).toBe("starter");

    const payments = await ledger(user);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ kind: "subscription", status: "succeeded", subscriptionId: sub.id, currency: "usd" });
    expect(payments[0].amountCents).toBeGreaterThanOrEqual(1000);
    expect(payments[0].stripeInvoiceId).toMatch(/^in_/);

    const audits = await m.db.select().from(m.schema.auditLogs).where(eq(m.schema.auditLogs.accountId, user.accountId));
    expect(audits.map((a) => a.action).sort()).toEqual(["checkout.created", "subscription.synced"]);
  });

  it("refuses team members, and anyone naming a workspace they don't belong to", async () => {
    const owner = await host();
    const other = await host();
    const [memberUser] = await m.db.insert(m.schema.users).values({ name: "Member", email: uniqueEmail("billing-member"), passwordHash: "x" }).returning();
    const [membership] = await m.db.insert(m.schema.accountMembers).values({ accountId: owner.accountId, userId: memberUser.id, role: "member" }).returning();
    await m.db.insert(m.schema.memberPermissions).values({ memberId: membership.id, permission: "billing.view" });
    const member = { id: memberUser.id, accountId: owner.accountId, email: memberUser.email, name: memberUser.name };

    await expect(m.billing.createCheckout(member, "starter", "month")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(m.billing.changePlan(member, "plus", "month")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(m.billing.createPortal(member, "/settings/payments")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(m.billing.listCards(member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // billing.view lets a member SEE billing, nothing more.
    expect((await m.billing.getBillingOverview(member)).subscription).toBeNull();

    // A host pointing at somebody else's workspace gets nowhere.
    const intruder = { ...other, accountId: owner.accountId };
    await expect(m.billing.createCheckout(intruder, "starter", "month")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(m.billing.getBillingOverview(intruder)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await m.billing.getSubscription(owner.accountId)).toBeNull();
  });

  it("refuses a second checkout while subscribed, and switches plans instead", async () => {
    const user = await host();
    await subscribe(user, "starter");
    await expect(m.billing.createCheckout(user, "plus", "month")).rejects.toThrow(/already have a subscription/);

    await m.billing.changePlan(user, "plus", "month");
    expect(await planOf(user)).toBe("plus");
    expect((await m.billing.getSubscription(user.accountId))!.planId).toBe("plus");
    // The proration invoice reaches the ledger through its own webhook.
    await expect.poll(async () => (await ledger(user)).length).toBe(2);
  });

  it("leaves the plan alone when the card is declined for a plan change", async () => {
    const user = await host();
    await subscribe(user, "starter");
    fake.flags.declineUpdates = true;
    try {
      await expect(m.billing.changePlan(user, "plus", "month")).rejects.toThrow(/card was declined/);
    } finally {
      fake.flags.declineUpdates = false;
    }
    expect(await planOf(user)).toBe("starter");
  });

  it("won't start checkout for a plan an Admin granted", async () => {
    const user = await host();
    await m.db.insert(m.schema.subscriptions).values({ accountId: user.accountId, planId: "pro", source: "admin", status: "active" });
    await expect(m.billing.createCheckout(user, "starter", "month")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(m.billing.changePlan(user, "plus", "month")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await planOf(user)).toBe("pro");
  });

  it("drops to Free when the subscription is canceled", async () => {
    const user = await host();
    const sub = await subscribe(user, "plus");
    const remote = fake.db.subscriptions[sub.stripeSubscriptionId!];
    remote.status = "canceled";
    await fake.emit("customer.subscription.deleted", remote);
    expect(await planOf(user)).toBe("free");
    expect(await m.billing.getSubscription(user.accountId)).toMatchObject({ status: "canceled" });
    // Free again, so a new checkout is allowed.
    await expect(m.billing.createCheckout(user, "starter", "month")).resolves.toMatch(/^http/);
  });

  it("keeps the plan while a failed payment is retried, and records it", async () => {
    const user = await host();
    const sub = await subscribe(user, "starter");
    const remote = fake.db.subscriptions[sub.stripeSubscriptionId!];
    remote.status = "past_due";
    const failed = { id: `in_failed_${Date.now()}`, customer: remote.customer, currency: "usd", amount_paid: 0, amount_due: 1500, parent: { subscription_details: { subscription: remote.id } } };
    await fake.emit("invoice.payment_failed", failed);

    expect(await m.billing.getSubscription(user.accountId)).toMatchObject({ status: "past_due" });
    expect(await planOf(user)).toBe("starter");
    expect((await ledger(user)).find((p) => p.stripeInvoiceId === failed.id)).toMatchObject({ status: "failed", amountCents: 1500 });
    const notes = await m.db.select().from(m.schema.notifications).where(eq(m.schema.notifications.userId, user.id));
    expect(notes.filter((n) => n.type === "billing.payment_failed")).toHaveLength(1);
    // Plan changes wait until the payment is fixed.
    await expect(m.billing.changePlan(user, "plus", "month")).rejects.toThrow(/Fix your payment/);

    // The retry succeeds: same invoice, now paid.
    remote.status = "active";
    await fake.emit("invoice.paid", { ...failed, amount_paid: 1500 });
    expect((await ledger(user)).find((p) => p.stripeInvoiceId === failed.id)).toMatchObject({ status: "succeeded" });
    expect(await m.billing.getSubscription(user.accountId)).toMatchObject({ status: "active" });

    // The "failed" event delivered again, late, must not undo the payment.
    await fake.emit("invoice.payment_failed", failed);
    expect((await ledger(user)).find((p) => p.stripeInvoiceId === failed.id)).toMatchObject({ status: "succeeded" });
  });

  it("ignores a late event for an old subscription once a newer one is active", async () => {
    const user = await host();
    const first = await subscribe(user, "starter");
    const old = fake.db.subscriptions[first.stripeSubscriptionId!];
    old.status = "canceled";
    await fake.emit("customer.subscription.deleted", old);
    const second = await subscribe(user, "plus");
    expect(second.stripeSubscriptionId).not.toBe(first.stripeSubscriptionId);

    await fake.emit("customer.subscription.updated", old);
    expect(await planOf(user)).toBe("plus");
    expect((await m.billing.getSubscription(user.accountId))!.stripeSubscriptionId).toBe(second.stripeSubscriptionId);
  });

  it("re-reads the subscription from Stripe instead of trusting what the event says", async () => {
    const user = await host();
    const sub = await subscribe(user, "starter");
    // A correctly signed event carrying stale data (claims the subscription is canceled).
    const stale = { ...fake.db.subscriptions[sub.stripeSubscriptionId!], status: "canceled" };
    const event = signedEvent("customer.subscription.updated", stale);
    expect((await deliver(event.payload, event.signature)).status).toBe(200);
    expect(await planOf(user)).toBe("starter");
  });

  it("processes each event once, and rejects unsigned, forged and replayed requests", async () => {
    const user = await host();
    const sub = await subscribe(user, "starter");
    const event = signedEvent("customer.subscription.updated", fake.db.subscriptions[sub.stripeSubscriptionId!]);

    expect(await (await deliver(event.payload, event.signature)).json()).toMatchObject({ result: "synced" });
    expect(await (await deliver(event.payload, event.signature)).json()).toMatchObject({ result: "duplicate" });
    const [row] = await m.db.select().from(m.schema.stripeEvents).where(eq(m.schema.stripeEvents.id, event.id));
    expect(row.processedAt).not.toBeNull();

    expect((await deliver(event.payload, signPayload(event.payload, "whsec_wrong"))).status).toBe(400);
    expect((await deliver(event.payload, "")).status).toBe(400);
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await deliver(event.payload, signPayload(event.payload, WEBHOOK_SECRET, old))).status).toBe(400);
  });

  it("can't be used to give a plan to an account that didn't pay", async () => {
    const payer = await host();
    const bystander = await host();
    const sub = await subscribe(payer, "plus");
    const remote = fake.db.subscriptions[sub.stripeSubscriptionId!];

    // Even a signed event naming another account in metadata changes nothing for that account:
    // the account is found from Stripe's customer, never from metadata.
    remote.metadata = { accountId: bystander.accountId };
    await fake.emit("customer.subscription.updated", remote);
    expect(await planOf(bystander)).toBe("free");
    expect(await planOf(payer)).toBe("plus");

    // A subscription for a customer we don't know, or on a price that isn't ours, is ignored.
    const stranger = signedEvent("customer.subscription.updated", { id: "sub_does_not_exist" });
    expect(await (await deliver(stranger.payload, stranger.signature)).json()).toMatchObject({ result: "ignored" });
    const unrelated = signedEvent("charge.succeeded", { id: "ch_1" });
    expect(await (await deliver(unrelated.payload, unrelated.signature)).json()).toMatchObject({ result: "ignored" });
  });

  it("confirms a checkout only for the account that owns the Stripe session", async () => {
    const payer = await host();
    const thief = await host();
    const url = await m.billing.createCheckout(payer, "starter", "month");
    const sessionId = url.split("/").pop()!;
    // Give the thief a Stripe customer of their own, then pay the payer's session.
    await m.billing.createPortal(thief, "/settings/payments");
    await fetch(`${url}/pay`, { method: "POST", redirect: "manual" });

    await m.billing.confirmCheckout(thief, sessionId);
    expect(await planOf(thief)).toBe("free");
    await m.billing.confirmCheckout(payer, sessionId);
    expect(await planOf(payer)).toBe("starter");
    // Junk ids are ignored without calling Stripe.
    await expect(m.billing.confirmCheckout(payer, "../../customers")).resolves.toBeUndefined();
  });

  it("starts over with a new Stripe customer when the old one is gone, unless a subscription depends on it", async () => {
    const free = await host();
    await m.billing.createPortal(free, "/settings/cards");
    const customerOf = async (u: Host) => (await m.db.select().from(m.schema.accounts).where(eq(m.schema.accounts.id, u.accountId)))[0].stripeCustomerId!;
    const first = await customerOf(free);
    delete fake.db.customers[first]; // e.g. the keys were switched from test to live
    await m.billing.createPortal(free, "/settings/cards");
    expect(await customerOf(free)).not.toBe(first);

    const paying = await host();
    await subscribe(paying, "starter");
    const customer = await customerOf(paying);
    delete fake.db.customers[customer];
    await expect(m.billing.createPortal(paying, "/settings/payments")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await customerOf(paying)).toBe(customer); // still linked, so its webhooks still land
    expect(await planOf(paying)).toBe("starter");
  });

  it("lists the saved card for the host", async () => {
    const user = await host();
    expect(await m.billing.listCards(user)).toEqual([]);
    await subscribe(user, "starter");
    expect(await m.billing.listCards(user)).toMatchObject([{ brand: "visa", last4: "4242", isDefault: true }]);
  });
});
