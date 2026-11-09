// Minimal stand-ins for the Resend (email) and Twilio (SMS) APIs, used only by e2e tests.
// The app sends real HTTP requests to them (same code path as production); each email or SMS is
// appended as a JSON line to MOCK_MAIL_FILE so tests can read verification/reset/invite links.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const file = process.env.MOCK_MAIL_FILE;
if (!file) throw new Error("MOCK_MAIL_FILE is required");
writeFileSync(file, "");

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/emails") {
    if (!String(req.headers.authorization ?? "").startsWith("Bearer ")) {
      res.writeHead(401, { "content-type": "application/json" }).end('{"message":"missing api key"}');
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const msg = JSON.parse(body);
      const tag = msg.tags?.find((t) => t.name === "type")?.value;
      appendFileSync(file, JSON.stringify({ to: msg.to[0], subject: msg.subject, text: msg.text, tag, at: new Date().toISOString() }) + "\n");
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: crypto.randomUUID() }));
    });
    return;
  }
  const twilio = req.url?.match(/^\/2010-04-01\/Accounts\/([^/]+)\/Messages\.json$/);
  if (req.method === "POST" && twilio) {
    if (!String(req.headers.authorization ?? "").startsWith("Basic ")) {
      res.writeHead(401).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const p = new URLSearchParams(body);
      appendFileSync(file, JSON.stringify({ to: p.get("To"), subject: "sms", text: p.get("Body"), tag: "team_invite", from: p.get("From") ?? p.get("MessagingServiceSid"), at: new Date().toISOString() }) + "\n");
      res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ sid: "SM" + crypto.randomUUID().replace(/-/g, "") }));
    });
    return;
  }
  res.writeHead(404).end();
}).listen(port, () => console.log(`mock providers on :${port}`));
