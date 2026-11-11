// Local stand-in for Resend, Twilio and Stripe during e2e tests, so tests never reach real services.
// Resend/Twilio request bodies are appended as JSON lines to MOCK_MAIL_FILE for tests to read.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { createFakeStripe } from "./fake-stripe.mjs";

const port = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const mailFile = process.env.MOCK_MAIL_FILE;

const stripe = createFakeStripe({
  webhookUrl: process.env.STRIPE_WEBHOOK_URL ?? "http://localhost:3100/api/stripe/webhook",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_e2e",
  publicBase: `http://localhost:${port}`,
});

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    return;
  }
  if (await stripe.handle(req, res)) return;

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (mailFile) appendFileSync(mailFile, JSON.stringify({ url: req.url, body }) + "\n");
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `mock_${Date.now()}` }));
  });
}).listen(port, () => console.log(`Mock providers listening on http://localhost:${port}`));
