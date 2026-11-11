import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createFakeStripe, signPayload } from "../support/fake-stripe.mjs";

// Runs the real billing service and webhook route against the database in DATABASE_URL and an
// in-process fake Stripe. Creates its own users and removes only those.
const WEBHOOK_SECRET = "whsec_integration_not_real";

let stripeServer: Server;
let appServer: Server;
let fake: ReturnType<typeof createFakeStripe>;
const createdEmails: string[] = [];

type Mods = {
  db: typeof import("@/db").db;
  schema: typeof import("@/db/schema");
  service: typeof import("@/server/billing/service");
  route: typeof import("@/app/api/stripe/webhook/route");
};
let m: Mods;

const listen = (server: Server) =>
  new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as AddressInfo).port)));

beforeAll(async () => {
  // Stand-in for the Next server: forwards webhook deliveries to the real route handler.
  appServer = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const response = await m.route.POST(
      new Request("http://app/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": String(req.headers["stripe-signature"] ?? "") },
        body,
      }),
    );
    res.writeHead(response.status).end(await response.text());
  });
  const appPort = await listen(appServer);

  stripeServer = createServer((req, res) => {
    void fake.handle(req, res).then((handled: boolean) => handled || res.writeHead(404).end());
  });
  const stripePort = await listen(stripeServer);
  fake = createFakeStripe({
    webhookUrl: `http://localhost:${appPort}/api/stripe/webhook`,
    webhookSecret: WEBHOOK_SECRET,
    publicBase: `http://localhost:${stripePort}`,
  });

  process.env.STRIPE_SECRET_KEY = "sk_test_integration_not_real";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_API_BASE = `http://localhost:${stripePort}`;
  process.env.APP_URL = "http://localhost:3000";

  m = {
    db: (await import("@/db")).db,
    schema: await import("@/db/schema"),
    service: await import("@/server/billing/service"),
    route: await import("@/app/api/stripe/webhook/route"),
  };
  // Fresh prices in this fake Stripe for every run.
  await m.service.setPlanPrice("starter", "month", 1000 + (Date.now() % 900));
  await m.service.setPlanPrice("plus", "month", 2000 + (Date.now() % 900));
  await m.service.syncPricesToStripe();
});

afterAll(async () => {
  for (const email of createdEmails) await m.db.delete(m.schema.users).where(eq(m.schema.users.email, email));
  stripeServer?.close();
  appServer?.close();
});

async function newUser() {
  const email = `billing-int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  createdEmails.push(email);
  const [user] = await m.db.insert(m.schema.users).values({ email, name: "Billing", passwordHash: "x" }).returning();
  return user;
}

async function reload(id: string) {
  const [user] = await m.db.select().from(m.schema.users).where(eq(m.schema.users.id, id));
  return user;
}

/** Runs checkout through the fake hosted page (which fires the signed webhooks). */
async function subscribe(user: Awaited<ReturnType<typeof newUser>>, plan: "starter" | "plus") {
  const url = await m.service.createCheckout(await reload(user.id), plan, "month");
  const res = await fetch(`${url}/pay`, { method: "POST", redirect: "manual" });
  expect(res.status).toBe(303);
  return (await m.service.getSubscription(user.id))!;
}

describe("Stripe billing", () => {
  it("upgrades the user when checkout completes (via the signed webhook)", async () => {
    const user = await newUser();
    const sub = await subscribe(user, "starter");
    expect(sub).toMatchObject({ plan: "starter", interval: "month", status: "active" });
    expect((await reload(user.id)).plan).toBe("starter");
  });

  it("refuses a second checkout while subscribed, and switches plans instead", async () => {
    const user = await newUser();
    await subscribe(user, "starter");
    await expect(m.service.createCheckout(await reload(user.id), "plus", "month")).rejects.toThrow(/already have a subscription/);
    await m.service.changePlan(await reload(user.id), "plus", "month");
    expect((await reload(user.id)).plan).toBe("plus");
  });

  it("refuses checkout for team members", async () => {
    const host = await newUser();
    const member = await newUser();
    await m.db.update(m.schema.users).set({ hostId: host.id }).where(eq(m.schema.users.id, member.id));
    await expect(m.service.createCheckout(await reload(member.id), "starter", "month")).rejects.toThrow(/host/);
  });

  it("drops to Free when the subscription is canceled", async () => {
    const user = await newUser();
    const sub = await subscribe(user, "plus");
    fake.db.subscriptions[sub.stripeSubscriptionId].status = "canceled";
    await fake.emit("customer.subscription.deleted", fake.db.subscriptions[sub.stripeSubscriptionId]);
    expect((await reload(user.id)).plan).toBe("free");
    expect((await m.service.getSubscription(user.id))!.status).toBe("canceled");
  });

  it("ignores a late event for an old subscription once a newer one is active", async () => {
    const user = await newUser();
    const first = await subscribe(user, "starter");
    fake.db.subscriptions[first.stripeSubscriptionId].status = "canceled";
    await fake.emit("customer.subscription.deleted", fake.db.subscriptions[first.stripeSubscriptionId]);
    const second = await subscribe(user, "plus");
    expect(second.stripeSubscriptionId).not.toBe(first.stripeSubscriptionId);

    // The old subscription's event is delivered again, late.
    await fake.emit("customer.subscription.updated", fake.db.subscriptions[first.stripeSubscriptionId]);
    expect((await reload(user.id)).plan).toBe("plus");
    expect((await m.service.getSubscription(user.id))!.stripeSubscriptionId).toBe(second.stripeSubscriptionId);
  });

  it("processes each event once and rejects bad signatures", async () => {
    const user = await newUser();
    const sub = await subscribe(user, "starter");
    const event = { id: `evt_dup_${Date.now()}`, object: "event", type: "customer.subscription.updated", data: { object: fake.db.subscriptions[sub.stripeSubscriptionId] } };
    const payload = JSON.stringify(event);
    const deliver = (signature: string) =>
      m.route.POST(new Request("http://app/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));

    expect(await (await deliver(signPayload(payload, WEBHOOK_SECRET))).json()).toMatchObject({ result: "synced" });
    expect(await (await deliver(signPayload(payload, WEBHOOK_SECRET))).json()).toMatchObject({ result: "duplicate" });
    expect((await deliver(signPayload(payload, "whsec_wrong"))).status).toBe(400);
    expect((await deliver("")).status).toBe(400);
  });

  it("recreates prices that don't exist in the connected Stripe account", async () => {
    await m.db
      .update(m.schema.planPrices)
      .set({ stripePriceId: "price_from_another_account" })
      .where(eq(m.schema.planPrices.plan, "starter"));
    expect(await m.service.syncPricesToStripe()).toBeGreaterThanOrEqual(1);
    const price = await m.service.getPlanPrice("starter", "month");
    expect(price!.stripePriceId).not.toBe("price_from_another_account");
    expect(fake.db.prices[price!.stripePriceId!]).toBeDefined();
  });
});
