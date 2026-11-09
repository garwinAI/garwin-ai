// Minimal structured logger. JSON lines in production (readable by Vercel logs),
// compact text in development. Sensitive fields are redacted automatically.
//
//   import { logger } from "@/lib/logger";
//   const log = logger.child({ module: "billing" });
//   log.info("checkout.created", { userId, plan });
//   log.error("webhook.failed", { err, eventId });

export type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|card|cvc|ssn/i;
const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function currentLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  return raw && raw in LEVELS ? (raw as LogLevel) : "info";
}

export type Logger = {
  debug: (msg: string, fields?: Fields) => void;
  info: (msg: string, fields?: Fields) => void;
  warn: (msg: string, fields?: Fields) => void;
  error: (msg: string, fields?: Fields) => void;
  child: (context: Fields) => Logger;
};

export function createLogger(context: Fields = {}, sink: (line: string, level: LogLevel) => void = defaultSink): Logger {
  function write(level: LogLevel, msg: string, fields?: Fields) {
    if (LEVELS[level] < LEVELS[currentLevel()]) return;
    const entry = redact({ time: new Date().toISOString(), level, msg, ...context, ...fields }) as Fields;
    if (process.env.NODE_ENV === "production") {
      sink(JSON.stringify(entry), level);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { time, level: _l, msg: _m, ...rest } = entry;
      const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
      sink(`[${level}] ${msg}${extra}`, level);
    }
  }
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (more) => createLogger({ ...context, ...more }, sink),
  };
}

function defaultSink(line: string, level: LogLevel) {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = createLogger({ app: "garwin-ai" });
