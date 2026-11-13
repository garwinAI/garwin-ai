// Minimal stand-ins for the Resend (email), Twilio (SMS) and GitHub (Update App) APIs, used only by e2e tests.
// The app sends real HTTP requests to them (same code path as production); each email or SMS is
// appended as a JSON line to MOCK_MAIL_FILE so tests can read verification/reset/invite links.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const file = process.env.MOCK_MAIL_FILE;
if (!file) throw new Error("MOCK_MAIL_FILE is required");
writeFileSync(file, "");

// Fake GitHub repository: dev is one commit ahead of live until live is moved to dev's commit.
const DEV_SHA = "d".repeat(40);
let liveSha = "a".repeat(40);

function github(req, res) {
  const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (req.method === "POST" && req.url === "/github/reset") {
    liveSha = "a".repeat(40);
    return json(200, {});
  }
  const path = req.url.replace(/^\/repos\/[^/]+\/[^/]+/, "").split("?")[0];
  if (path === req.url.split("?")[0]) return false;
  if (!String(req.headers.authorization ?? "").startsWith("Bearer ")) return json(401, { message: "Bad credentials" });
  if (req.method === "GET" && path === "/compare/live...dev") {
    const ahead = liveSha === DEV_SHA ? 0 : 1;
    return json(200, { ahead_by: ahead, behind_by: 0, commits: ahead ? [{ sha: DEV_SHA, commit: { message: "Add the thing\n\nDetails" } }] : [] });
  }
  if (req.method === "GET" && path === "/commits/dev") return res.writeHead(200, { "content-type": "text/plain" }).end(DEV_SHA);
  if (req.method === "PATCH" && path === "/git/refs/heads/live") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { sha, force } = JSON.parse(body);
      if (force || sha !== DEV_SHA) return json(422, { message: "Update is not a fast forward" });
      liveSha = sha;
      json(200, { ref: "refs/heads/live", object: { sha } });
    });
    return true;
  }
  return json(404, { message: "Not Found" });
}

createServer((req, res) => {
  if (req.url?.startsWith("/repos/") || req.url?.startsWith("/github/")) {
    if (github(req, res) !== false) return;
  }
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
