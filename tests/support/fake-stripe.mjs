// A small in-memory imitation of the parts of the Stripe API Garwin AI uses, plus fake hosted
// Checkout and billing portal pages. Used by e2e and integration tests so they never reach Stripe.
// Webhooks are signed exactly like Stripe's, so the app's signature check is exercised for real.
import { createHmac, randomBytes } from "node:crypto";

const id = (prefix) => `${prefix}_${randomBytes(8).toString("hex")}`;
const now = () => Math.floor(Date.now() / 1000);
const MONTH = 30 * 24 * 3600;

/** Parses Stripe's form encoding (`a[b][0][c]=1`) into nested objects/arrays. */
export function parseForm(body) {
  const out = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const keys = rawKey.replace(/\]/g, "").split("[");
    let node = out;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        node[key] = value;
        return;
      }
      node[key] ??= /^\d+$/.test(keys[i + 1]) ? [] : {};
      node = node[key];
    });
  }
  return out;
}

export function signPayload(payload, secret, timestamp = now()) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export function createFakeStripe({ webhookUrl, webhookSecret, publicBase }) {
  const db = { customers: {}, products: {}, prices: {}, subscriptions: {}, sessions: {}, portals: {}, invoices: {}, methods: {} };
  const list = (data, url) => ({ object: "list", data, has_more: false, url });
  const error = (res, status, message) =>
    send(res, status, { error: { type: "invalid_request_error", code: status === 404 ? "resource_missing" : undefined, message } });

  function send(res, status, body) {
    res.writeHead(status, { "content-type": "application/json", "request-id": id("req") });
    res.end(JSON.stringify(body));
  }

  function html(res, body) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Stripe</title></head><body>${body}</body></html>`);
  }

  function redirect(res, location) {
    res.writeHead(303, { location });
    res.end();
  }

  async function emit(type, object) {
    const event = { id: id("evt"), object: "event", type, created: now(), livemode: false, api_version: "fake", data: { object } };
    const payload = JSON.stringify(event);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signPayload(payload, webhookSecret) },
      body: payload,
    });
    if (!res.ok) throw new Error(`Webhook ${type} failed: ${res.status} ${await res.text()}`);
    return event;
  }

  function addInvoice(sub, amount) {
    const inv = {
      id: id("in"),
      object: "invoice",
      number: `FAKE-${Object.keys(db.invoices).length + 1}`,
      created: now(),
      customer: sub.customer,
      currency: "usd",
      amount_paid: amount,
      amount_due: amount,
      status: "paid",
      hosted_invoice_url: `${publicBase}/invoice`,
      parent: { subscription_details: { subscription: sub.id } },
    };
    db.invoices[inv.id] = inv;
    return inv;
  }

  // ---- REST API (/v1/...) ------------------------------------------------------------------
  function api(method, path, body, query, res) {
    // "/v1/checkout/sessions/cs_1" → resource "checkout/sessions", rid "cs_1"
    const parts = path.split("/").filter(Boolean).slice(1);
    const nested = ["checkout", "billing_portal"].includes(parts[0]);
    const resource = nested ? `${parts[0]}/${parts[1]}` : parts[0];
    const [rid, sub] = parts.slice(nested ? 2 : 1);
    const key = `${method} ${resource}${rid ? "/:id" : ""}${sub ? `/${sub}` : ""}`;

    switch (key) {
      case "POST products": {
        const product = { id: id("prod"), object: "product", name: body.name, metadata: body.metadata ?? {} };
        return send(res, 200, (db.products[product.id] = product));
      }
      case "POST prices": {
        const price = {
          id: id("price"),
          object: "price",
          product: body.product,
          currency: body.currency,
          unit_amount: Number(body.unit_amount),
          recurring: { interval: body.recurring?.interval },
          metadata: body.metadata ?? {},
          lookup_key: body.lookup_key ?? null,
          active: true,
        };
        if (price.lookup_key && body.transfer_lookup_key === "true") {
          for (const other of Object.values(db.prices)) if (other.lookup_key === price.lookup_key) other.lookup_key = null;
        }
        return send(res, 200, (db.prices[price.id] = price));
      }
      case "GET products/:id":
        return db.products[rid] ? send(res, 200, db.products[rid]) : error(res, 404, "No such product");
      case "GET prices/:id":
        return db.prices[rid] ? send(res, 200, db.prices[rid]) : error(res, 404, "No such price");
      case "POST prices/:id": {
        const price = db.prices[rid];
        if (!price) return error(res, 404, "No such price");
        if (body.active !== undefined) price.active = body.active === "true";
        return send(res, 200, price);
      }
      case "POST customers": {
        const customer = {
          id: id("cus"),
          object: "customer",
          email: body.email,
          name: body.name,
          metadata: body.metadata ?? {},
          invoice_settings: { default_payment_method: null },
        };
        return send(res, 200, (db.customers[customer.id] = customer));
      }
      case "GET customers/:id":
        return db.customers[rid] ? send(res, 200, db.customers[rid]) : error(res, 404, "No such customer");
      case "GET customers/:id/payment_methods":
        return send(res, 200, list(Object.values(db.methods).filter((m) => m.customer === rid), path));
      case "POST checkout/sessions": {
        const price = db.prices[body.line_items?.[0]?.price];
        if (!price?.active) return error(res, 400, "No such active price");
        const session = {
          id: id("cs_test"),
          object: "checkout.session",
          mode: body.mode,
          customer: body.customer,
          client_reference_id: body.client_reference_id,
          success_url: body.success_url,
          cancel_url: body.cancel_url,
          subscription: null,
          status: "open",
          metadata: body.metadata ?? {},
          _price: price.id,
          _subscriptionMetadata: body.subscription_data?.metadata ?? {},
        };
        session.url = `${publicBase}/checkout/${session.id}`;
        db.sessions[session.id] = session;
        return send(res, 200, session);
      }
      case "GET checkout/sessions/:id": {
        const session = db.sessions[rid];
        if (!session) return error(res, 404, "No such session");
        const expand = Object.values(query.expand ?? {});
        const out = { ...session };
        if (expand.includes("subscription") && session.subscription) out.subscription = db.subscriptions[session.subscription];
        return send(res, 200, out);
      }
      case "GET subscriptions/:id":
        return db.subscriptions[rid] ? send(res, 200, db.subscriptions[rid]) : error(res, 404, "No such subscription");
      case "POST subscriptions/:id": {
        const subscription = db.subscriptions[rid];
        if (!subscription) return error(res, 404, "No such subscription");
        const newPrice = body.items?.[0]?.price;
        if (newPrice) {
          if (!db.prices[newPrice]?.active) return error(res, 400, "No such active price");
          subscription.items.data[0].price = db.prices[newPrice];
          addInvoice(subscription, db.prices[newPrice].unit_amount);
        }
        if (body.cancel_at_period_end !== undefined) subscription.cancel_at_period_end = body.cancel_at_period_end === "true";
        return send(res, 200, subscription);
      }
      case "POST billing_portal/sessions": {
        const portal = { id: id("bps"), object: "billing_portal.session", customer: body.customer, return_url: body.return_url };
        portal.url = `${publicBase}/portal/${portal.id}`;
        return send(res, 200, (db.portals[portal.id] = portal));
      }
      case "GET invoices":
        return send(
          res,
          200,
          list(
            Object.values(db.invoices)
              .filter((i) => i.customer === query.customer)
              .reverse(),
            path,
          ),
        );
      default:
        return error(res, 404, `Fake Stripe doesn't implement ${method} ${path}`);
    }
  }

  // ---- Hosted pages -------------------------------------------------------------------------
  async function pages(method, path, res) {
    const [, kind, pid, action] = path.split("/");

    if (kind === "checkout" && method === "GET") {
      const s = db.sessions[pid];
      if (!s) return html(res, "<p>Unknown session</p>");
      const price = db.prices[s._price];
      return html(
        res,
        `<h1>Fake Stripe Checkout</h1><p>${(price.unit_amount / 100).toFixed(2)} USD / ${price.recurring.interval}</p>
         <form method="post" action="/checkout/${pid}/pay"><button>Pay</button></form>
         <a href="${s.cancel_url}">Back</a>`,
      );
    }

    if (kind === "checkout" && action === "pay" && method === "POST") {
      const s = db.sessions[pid];
      const price = db.prices[s._price];
      const pm = { id: id("pm"), object: "payment_method", customer: s.customer, card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2034 } };
      db.methods[pm.id] = pm;
      db.customers[s.customer].invoice_settings.default_payment_method = pm.id;
      const subscription = {
        id: id("sub"),
        object: "subscription",
        customer: s.customer,
        status: "active",
        metadata: s._subscriptionMetadata,
        cancel_at_period_end: false,
        cancel_at: null,
        items: { object: "list", data: [{ id: id("si"), object: "subscription_item", price, current_period_end: now() + MONTH }] },
      };
      db.subscriptions[subscription.id] = subscription;
      addInvoice(subscription, price.unit_amount);
      s.subscription = subscription.id;
      s.status = "complete";
      await emit("customer.subscription.created", subscription);
      await emit("checkout.session.completed", { ...s });
      return redirect(res, s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id));
    }

    if (kind === "portal" && method === "GET") {
      const portal = db.portals[pid];
      if (!portal) return html(res, "<p>Unknown portal session</p>");
      return html(
        res,
        `<h1>Fake Stripe billing portal</h1>
         <form method="post" action="/portal/${pid}/cancel"><button>Cancel subscription now</button></form>
         <a href="${portal.return_url}">Return to Garwin AI</a>`,
      );
    }

    if (kind === "portal" && action === "cancel" && method === "POST") {
      const portal = db.portals[pid];
      for (const subscription of Object.values(db.subscriptions)) {
        if (subscription.customer === portal.customer && subscription.status !== "canceled") {
          subscription.status = "canceled";
          await emit("customer.subscription.deleted", subscription);
        }
      }
      return redirect(res, portal.return_url);
    }

    if (kind === "invoice") return html(res, "<h1>Fake invoice</h1>");
    return false;
  }

  /** Test-only controls: simulate a failed renewal payment. */
  async function control(method, path, res) {
    const [, , what, sid] = path.split("/"); // /__test/fail-payment/:sub
    if (method === "POST" && what === "fail-payment") {
      // "latest" = the most recently created subscription.
      const subscription = sid === "latest" ? Object.values(db.subscriptions).at(-1) : db.subscriptions[sid];
      if (!subscription) return error(res, 404, "No such subscription");
      subscription.status = "past_due";
      await emit("invoice.payment_failed", { id: id("in"), object: "invoice", parent: { subscription_details: { subscription: subscription.id } } });
      return send(res, 200, subscription);
    }
    return false;
  }

  /** Node request handler. Returns false when the path isn't Stripe's, so callers can fall through. */
  return {
    db,
    emit,
    async handle(req, res) {
      const url = new URL(req.url, "http://fake");
      const path = url.pathname;
      if (!/^\/(v1|checkout|portal|invoice|__test)\b/.test(path)) return false;
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try {
        if (path.startsWith("/v1/")) {
          const query = parseForm(url.search.slice(1));
          api(req.method, path, parseForm(raw), query, res);
          return true;
        }
        if (path.startsWith("/__test/")) return (await control(req.method, path, res)) !== false;
        return (await pages(req.method, path, res)) !== false;
      } catch (err) {
        send(res, 500, { error: { message: String(err?.message ?? err) } });
        return true;
      }
    },
  };
}
