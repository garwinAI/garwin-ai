import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { garwinPool?: Pool };

// The pool connects lazily on first query, so importing this module never touches the network
// (keeps `next build` working without a database). DATABASE_URL is validated at server start
// by src/instrumentation.ts. In serverless production, use your provider's POOLED connection string.
const pool =
  globalForDb.garwinPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: process.env.NODE_ENV === "production" ? 3 : 5 });
if (process.env.NODE_ENV !== "production") globalForDb.garwinPool = pool;

export const db = drizzle(pool, { schema });
export { schema };

/** Lightweight connectivity check used by /api/health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}
