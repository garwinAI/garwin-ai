// Local stand-in for Resend and Twilio during e2e tests, so tests never send real email or SMS.
// Each request body is appended as one JSON line to MOCK_MAIL_FILE for tests to read.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.MOCK_RESEND_PORT ?? 3199);
const mailFile = process.env.MOCK_MAIL_FILE;

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (mailFile) appendFileSync(mailFile, JSON.stringify({ url: req.url, body }) + "\n");
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `mock_${Date.now()}` }));
  });
}).listen(port, () => console.log(`Mock providers listening on http://localhost:${port}`));
