// Minimal stand-in for the Resend API, used only by e2e tests.
// The app sends real HTTP requests to it (same code path as production); each email is
// appended as a JSON line to MOCK_MAIL_FILE so tests can read verification/reset links.
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
  res.writeHead(404).end();
}).listen(port, () => console.log(`mock resend on :${port}`));
