// Minimal stand-ins for the Resend (email), Twilio (SMS), GitHub (Update App, Admin Assistant),
// Anthropic (Admin Assistant) and Stripe (billing, see fake-stripe.mjs) APIs, used only by e2e tests.
// The app sends real HTTP requests to them (same code path as production); each email or SMS is
// appended as a JSON line to MOCK_MAIL_FILE so tests can read verification/reset/invite links.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createFakeStripe } from "./fake-stripe.mjs";

const port = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const file = process.env.MOCK_MAIL_FILE;
if (!file) throw new Error("MOCK_MAIL_FILE is required");
writeFileSync(file, "");

// Fake GitHub repository: dev is one commit ahead of live until live is moved to dev's commit.
const DEV_SHA = "d".repeat(40);
let liveSha = "a".repeat(40);

const TREE_SHA = "f".repeat(40);
const REPO_FILES = {
  "README.md": "# Garwin AI\n\nWelcome to Garwin.\n",
  ".github/copilot-instructions.md": "Keep changes small.\n",
  "src/lib/auth/session.ts": "export const secret = 1;\n",
};
let pendingTree = null;
let pendingMessage = null;
let lastDevCommit = null;
/** Git tags created through the API: ref → sha. */
const tags = new Map();

// Fake Anthropic Messages API. Scripted like a real tool-use exchange: first it tries a protected
// file and edits README.md, then (once it has the tool results) it answers in text.
function anthropic(req, res) {
  const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (!req.headers["x-api-key"] || !req.headers["anthropic-version"]) return json(401, { type: "error", error: { type: "authentication_error" } });
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { messages, model, tools, system } = JSON.parse(body);
    if (!model || !Array.isArray(tools) || !system) return json(400, { type: "error", error: { type: "invalid_request_error" } });
    const last = messages.at(-1);
    const usage = { input_tokens: 100, output_tokens: 20 };
    // Auto Pilot (support tickets): refunds get escalated, everything else answered and closed.
    if (tools.some((t) => t.name === "resolve_ticket")) {
      const text = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
      const escalate = /refund/i.test(text);
      return json(200, {
        content: [
          {
            type: "tool_use",
            id: "toolu_support",
            name: "resolve_ticket",
            input: escalate
              ? { reply: "Thanks for reaching out. I've passed this to our team and a person will reply here soon. Garwin AI Support", decision: "escalate", reason: "Refund request" }
              : { reply: "You can change your plan any time in Settings → Payments. Garwin AI Support", decision: "close", reason: "Simple how-to question" },
          },
        ],
        stop_reason: "tool_use",
        usage,
      });
    }
    if (Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result")) {
      const blocked = last.content.find((b) => b.tool_use_id === "toolu_1");
      return json(200, { content: [{ type: "text", text: `Updated the welcome line. Protected write refused: ${blocked?.is_error === true}.` }], stop_reason: "end_turn", usage });
    }
    if (/question only/i.test(String(last.content))) return json(200, { content: [{ type: "text", text: "It is a workspace app." }], stop_reason: "end_turn", usage });
    json(200, {
      content: [
        { type: "text", text: "Making the change." },
        { type: "tool_use", id: "toolu_1", name: "write_file", input: { path: "src/lib/auth/session.ts", content: "hacked" } },
        { type: "tool_use", id: "toolu_2", name: "edit_file", input: { path: "README.md", old_text: "Welcome to Garwin.", new_text: "Welcome to the new Garwin." } },
      ],
      stop_reason: "tool_use",
      usage,
    });
  });
}

function github(req, res) {
  const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (req.method === "POST" && req.url === "/github/reset") {
    liveSha = "a".repeat(40);
    lastDevCommit = null;
    tags.clear();
    return json(200, {});
  }
  if (req.method === "GET" && req.url === "/github/last-dev-commit") return json(200, lastDevCommit ?? {});
  // Test hook: what the Scheduled deploy workflow would leave behind if live couldn't be updated.
  if (req.method === "POST" && req.url === "/github/fail-schedule") {
    for (const [ref, sha] of [...tags]) {
      if (ref.startsWith("refs/tags/deploy-schedule/")) {
        tags.delete(ref);
        tags.set(ref.replace("deploy-schedule", "deploy-failed"), sha);
      }
    }
    return json(200, {});
  }
  const path = req.url.replace(/^\/repos\/[^/]+\/[^/]+/, "").split("?")[0];
  if (path === req.url.split("?")[0]) return false;
  if (!String(req.headers.authorization ?? "").startsWith("Bearer ")) return json(401, { message: "Bad credentials" });
  if (req.method === "GET" && path === "/compare/live...dev") {
    const ahead = liveSha === DEV_SHA ? 0 : 1;
    return json(200, { ahead_by: ahead, behind_by: 0, commits: ahead ? [{ sha: DEV_SHA, commit: { message: "Add the thing\n\nDetails" } }] : [] });
  }
  // --- Admin Assistant: read dev, then write one commit to it
  if (req.method === "GET" && path === "/git/ref/heads/dev") return json(200, { object: { sha: DEV_SHA } });
  if (req.method === "GET" && path === `/git/commits/${DEV_SHA}`) return json(200, { sha: DEV_SHA, tree: { sha: TREE_SHA } });
  if (req.method === "GET" && path === `/git/trees/${TREE_SHA}`) {
    return json(200, { tree: Object.keys(REPO_FILES).map((p) => ({ path: p, mode: "100644", type: "blob", size: REPO_FILES[p].length })) });
  }
  if (req.method === "GET" && path.startsWith("/contents/")) {
    const file = REPO_FILES[decodeURIComponent(path.slice("/contents/".length))];
    return file === undefined ? json(404, { message: "Not Found" }) : res.writeHead(200, { "content-type": "text/plain" }).end(file);
  }
  // --- Scheduled deploys are git tags (see src/lib/app-update.ts)
  if (req.method === "GET" && path.startsWith("/git/matching-refs/tags/")) {
    const prefix = "refs/tags/" + path.slice("/git/matching-refs/tags/".length);
    return json(200, [...tags].filter(([ref]) => ref.startsWith(prefix)).map(([ref, sha]) => ({ ref, object: { sha, type: "commit" } })));
  }
  if (req.method === "POST" && path === "/git/refs") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { ref, sha } = JSON.parse(body);
      if (tags.has(ref)) return json(422, { message: "Reference already exists" });
      tags.set(ref, sha);
      json(201, { ref, object: { sha } });
    });
    return true;
  }
  if (req.method === "DELETE" && path.startsWith("/git/refs/tags/")) {
    const ref = path.slice("/git/".length);
    return tags.delete(ref) ? res.writeHead(204).end() : json(422, { message: "Reference does not exist" });
  }
  if (req.method === "POST" && (path === "/git/trees" || path === "/git/commits")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      if (path === "/git/trees") pendingTree = parsed.tree;
      else pendingMessage = parsed.message;
      json(201, { sha: (path === "/git/trees" ? "b" : "c").repeat(40) });
    });
    return true;
  }
  if (req.method === "PATCH" && path === "/git/refs/heads/dev") {
    lastDevCommit = { files: pendingTree, message: pendingMessage };
    return json(200, { ref: "refs/heads/dev" });
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

const stripe = createFakeStripe({
  webhookUrl: process.env.STRIPE_WEBHOOK_URL ?? "http://localhost:3100/api/stripe/webhook",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_e2e_not_a_real_secret",
  publicBase: `http://localhost:${port}`,
});

createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/v1/messages") return anthropic(req, res);
  if (await stripe.handle(req, res)) return;
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
