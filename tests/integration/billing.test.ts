import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createFakeStripe, signPayload, type FakeStripe } from "../support/fake-stripe.mjs";
import { uniqueEmail } from "./helpers";

// The real billing service and webhook route, against the database in DATABASE_URL and an
// in-process fake Stripe (tests/support/fake-stripe.mjs) that sends correctly signed webhooks.
const WEBHOOK_SECRET = "whsec_integration_not_a_real_secret";

let fake: FakeStripe;
let stripeServer: Server;
let appServer: Server;

type Mods = {
  db: typeof import("@/db").db;
  schema: typeof import("@/db/schema");
  billing: typeof import("@/server/services/billing");
  entitlements: typeof import("@/server/services/entitlements");
  users: typeof import("@/server/services/users");
  route: typeof import("@/app/api/stripe/webhook/route");
};
let m: Mods;

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));

beforeAll(async () => {
  // Stands in for the Next server: hands webhook deliveries to the real route handler.
  appServer = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = await m.route.POST(
      new Request("http://app/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": String(req.headers["stripe-signature"] ?? "") }, body }),
    );
    res.writeHead(response.status).end(await response.text());
  });
  const appPort = await listen(appServer);
  stripeServer = createServer((req, res) => void fake.handle(req, res).then((handled) => handled || res.writeHead(404).end()));
  const stripePort = await listen(stripeServer);
  fake = createFakeStripe({ webhookUrl: `http://localhost:${appPort}/api/stripe/webhook`, webhookSecret: WEBHOOK_SECRET, publicBase: `http://localhost:${stripePort}` });

  process.env.STRIPE_SECRET_KEY = "sk_test_integration_not_a_real_key";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_API_BASE = `http://localhost:${stripePort}`;
  (await import("@/lib/env")).resetEnvCache();
  (await import("@/server/stripe/client")).resetStripeClient();

  m = {
    db: (await import("@/db")).db,
    schema: await import("@/db/schema"),
    billing: await import("@/server/services/billing"),
    entitlements: await import("@/server/services/entitlements"),
    users: await import("@/server/services/users"),
    route: await import("@/app/api/stripe/webhook/route"),
  };
  // Prices for this run's fresh fake Stripe.
  const admin = await m.users.createUser({ name: "Billing Admin", email: uniqueEmail("billing-admin"), passwordHash: "x" });
  await m.billing.setPlanPrice(admin, "starter", "month", 1000 + (Date.now() % 900));
  await m.billing.setPlanPrice(admin, "plus", "month", 2000 + (Date.now() % 900));
  await m.billing.syncPricesToStripe(admin);
});

afterAll(() => {
  stripeServer?.close();
  appServer?.close();
});

async function newHost() {
  const user = await m.users.createUser({ name: "Billing Host", email: uniqueEmail("billing"), passwordHash: "x" });
  const [member] = await m.db.select().from(m.schema.accountMembers).where(eq(m.schema.accountMembers.userId, user.id));
  return { ...user, accountId: member.accountId };
}

const planOf = (accountId: string) => m.entitlements.planForAccount(accountId);

async function subscription(accountId: string) {
  const [row] = await m.db
    .select()
    .from(m.schema.subscriptions)
    .where(and(eq(m.schema.subscriptions.accountId, accountId), eq(m.schema.subscriptions.source, "stripe")))
    .orderBy(m.schema.subscriptions.createdAt);
  return row;
}

/** Runs checkout through the fake hosted page, which fires the signed webhooks. */
async function subscribe(host: Awaited<ReturnType<typeof newHost>>, plan: "starter" | "plus") {
  const url = await m.billing.createCheckout(host, plan, "month");
  const res = await fetch(`${url}/pay`, { method: "POST", redirect: "manual" });
  expect(res.status).toBe(303);
  const rows = await m.db.select().from(m.schema.subscriptions).where(eq(m.schema.subscriptions.accountId, host.accountId));
  return rows.find((r) => r.status === "active")!;
}

describe("Stripe billing", () => {
  it("gives the account the plan when checkout completes, and records the payment", async () => {
    const host = await newHost();
    expect(await planOf(host.accountId)).toBe("free");
    const sub = await subscribe(host, "starter");
    expect(sub).toMatchObject({ planId: "starter", interval: "month", status: "active", source: "stripe" });
    expect(await planOf(host.accountId)).toBe("starter");
    const ledger = await m.db.select().from(m.schema.payments).where(eq(m.schema.payments.accountId, host.accountId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: "subscription", status: "succeeded", description: "Starter plan (monthly)" });
  });

  it("refuses a second checkout and switches plans in place instead", async () => {
    const host = await newHost();
    await subscribe(host, "starter");
    await expect(m.billing.createCheckout(host, "plus", "month")).rejects.toThrow(/already have a subscription/);
    await m.billing.changePlan(host, "plus", "month");
    expect(await planOf(host.accountId)).toBe("plus");
  });

  it("only the host can buy; team members can't, and can't reach another workspace's billing", async () => {
    const host = await newHost();
    const member = await newHost();
    await m.db.insert(m.schema.accountMembers).values({ accountId: host.accountId, userId: member.id, role: "member" });
    await expect(m.billing.createCheckout({ ...member, accountId: host.accountId }, "starter", "month")).rejects.toThrow(/Only the account host/);
    const stranger = await newHost();
    await expect(m.billing.createCheckout({ ...stranger, accountId: host.accountId }, "starter", "month")).rejects.toThrow(/don't have access/);
  });

  it("won't sell a plan on top of an Admin-granted one", async () => {
    const host = await newHost();
    await m.db.insert(m.schema.subscriptions).values({ accountId: host.accountId, planId: "pro", source: "admin", status: "active" });
    await expect(m.billing.createCheckout(host, "starter", "month")).rejects.toThrow(/set by Garwin AI support/);
  });

  it("keeps the plan while a failed payment is retried, then drops to Free when canceled", async () => {
    const host = await newHost();
    const sub = await subscribe(host, "plus");
    const stripeSub = fake.db.subscriptions[sub.stripeSubscriptionId!];
    stripeSub.status = "past_due";
    await fake.emit("customer.subscription.updated", stripeSub);
    expect(await planOf(host.accountId)).toBe("plus");
    stripeSub.status = "canceled";
    await fake.emit("customer.subscription.deleted", stripeSub);
    expect(await planOf(host.accountId)).toBe("free");
  });

  it("ignores a late event about an old subscription once a newer one is active", async () => {
    const host = await newHost();
    const first = await subscribe(host, "starter");
    const oldSub = fake.db.subscriptions[first.stripeSubscriptionId!];
    oldSub.status = "canceled";
    await fake.emit("customer.subscription.deleted", oldSub);
    const second = await subscribe(host, "plus");
    expect(second.stripeSubscriptionId).not.toBe(first.stripeSubscriptionId);

    await fake.emit("customer.subscription.updated", oldSub); // delivered again, late
    expect(await planOf(host.accountId)).toBe("plus");
    expect((await subscription(host.accountId)).status).toBe("canceled"); // the old row
  });

  it("processes each event once and rejects bad signatures", async () => {
    const host = await newHost();
    const sub = await subscribe(host, "starter");
    const event = { id: `evt_dup_${Date.now()}`, object: "event", type: "customer.subscription.updated", data: { object: fake.db.subscriptions[sub.stripeSubscriptionId!] } };
    const payload = JSON.stringify(event);
    const deliver = (signature: string) =>
      m.route.POST(new Request("http://app/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));

    expect(await (await deliver(signPayload(payload, WEBHOOK_SECRET))).json()).toMatchObject({ result: "processed" });
    expect(await (await deliver(signPayload(payload, WEBHOOK_SECRET))).json()).toMatchObject({ result: "duplicate" });
    expect((await deliver(signPayload(payload, "whsec_wrong"))).status).toBe(400);
    expect((await deliver("")).status).toBe(400);
  });

  it("recreates prices that don't exist in the connected Stripe account", async () => {
    const admin = await newHost();
    const [price] = await m.db
      .update(m.schema.planPrices)
      .set({ stripePriceId: `price_other_account_${Date.now()}` })
      .where(and(eq(m.schema.planPrices.planId, "starter"), eq(m.schema.planPrices.interval, "month"), eq(m.schema.planPrices.active, true)))
      .returning();
    expect(await m.billing.syncPricesToStripe(admin)).toBeGreaterThanOrEqual(1);
    const [after] = await m.db.select().from(m.schema.planPrices).where(eq(m.schema.planPrices.id, price.id));
    expect(fake.db.prices[after.stripePriceId!]).toBeDefined();
  });

  it("keeps price history: a new price deactivates the old row", async () => {
    const admin = await newHost();
    await m.billing.setPlanPrice(admin, "plus", "year", 19_900);
    await m.billing.setPlanPrice(admin, "plus", "year", 21_900);
    const rows = await m.db.select().from(m.schema.planPrices).where(and(eq(m.schema.planPrices.planId, "plus"), eq(m.schema.planPrices.interval, "year")));
    expect(rows.filter((r) => r.active).map((r) => r.amountCents)).toEqual([21_900]);
    expect(rows.some((r) => !r.active && r.amountCents === 19_900)).toBe(true);
  });
});
